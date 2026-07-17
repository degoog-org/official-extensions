import { tabSpell } from "../browser/browser.js";
import {
  documentHtmlJs,
  inspectPageJs,
  navigateJs,
  progressPageJs,
  warmupSearchJs,
} from "../injectors/index.js";
import {
  OriginBlockedError,
  looksBlocked,
  looksConsent,
  originFor,
  sleep,
} from "./origin-warmup.js";

const WARMUP_ACTION_TIMEOUT_MS = 5000;
const OPEN_READY_TIMEOUT_MS = 2000;

export class WarmupDriver {
  constructor({
    cmd,
    inject,
    awaitDom,
    awaitReady,
    awaitMatch,
    closeTabQuietly,
    store,
    ownedTabIds,
    tabContainerIds,
    registerCaptcha,
    seenOrigins,
    warn,
    timeoutMs,
    warmupQuery,
    warmupTtlMs,
    blockCooldownMs,
    settleMs,
    acceptConsent,
  }) {
    this._cmd = cmd;
    this._inject = inject;
    this._awaitDom = awaitDom;
    this._awaitReady = awaitReady;
    this._awaitMatch = awaitMatch;
    this._closeTabQuietly = closeTabQuietly;
    this._store = store;
    this._ownedTabIds = ownedTabIds;
    this._tabContainerIds = tabContainerIds;
    this._registerCaptcha = registerCaptcha;
    this._seenOrigins = seenOrigins;
    this._warn = warn;
    this._timeoutMs = timeoutMs;
    this._warmupQuery = warmupQuery;
    this._warmupTtlMs = warmupTtlMs;
    this._blockCooldownMs = blockCooldownMs;
    this._settleMs = settleMs;
    this._acceptConsent = acceptConsent;
  }

  markBlocked(origin, containerId, reason = "blocked", tabId = null) {
    const tabInfo = typeof tabId === "number" ? tabId : "unknown";
    this._warn(
      `tainting ${origin} session for ${Math.round(this._blockCooldownMs() / 60000)}m (container=${containerId || "default"}, tab=${tabInfo}, reason: ${reason}); keeping container reserved for manual solve`,
    );
    this._store.setWarmupState(origin, containerId, {
      blockedUntil: Date.now() + this._blockCooldownMs(),
      reason,
    });
  }

  assertUsable(origin, containerId) {
    const state = this._store.warmupState(origin, containerId);
    if (state?.blockedUntil > Date.now()) {
      throw new OriginBlockedError(origin, state.reason);
    }
  }

  async ensureWarm(url, containerId, scrape = null) {
    const origin = originFor(url);
    if (!origin) return { origin: null, html: null };

    if (!this._seenOrigins.has(origin)) {
      this._seenOrigins.add(origin);
      this._store.persistOrigins([...this._seenOrigins]);
    }
    this.assertUsable(origin, containerId);

    await this._store.loadSessionFromCache(origin, containerId);

    const state = this._store.warmupState(origin, containerId);
    if (
      state?.warmedAt &&
      Date.now() - state.warmedAt < this._warmupTtlMs() &&
      this._store.usableHeaderSession(origin, containerId)
    ) {
      return { origin, html: null };
    }
    if (state?.promise) {
      await state.promise;
      return { origin, html: null };
    }

    const target = scrape && url !== `${origin}/` ? url : null;
    const promise = this._warmNow(origin, containerId, target, scrape);
    this._store.setWarmupState(origin, containerId, { promise });
    try {
      const { reached, html } = await promise;
      const session = this._store.usableHeaderSession(origin, containerId);
      if (reached && session) {
        this._store.setWarmupState(origin, containerId, { warmedAt: Date.now() });
      } else {
        this._store.dropWarmup(origin, containerId);
        this._warn(
          `origin warmup for ${origin} did not reach a usable search session (reached=${reached}, session=${Boolean(session)})`,
        );
      }
      return { origin, html };
    } catch (error) {
      if (error instanceof OriginBlockedError) throw error;
      this._store.dropWarmup(origin, containerId);
      this._warn(`origin warmup failed for ${origin}: ${error?.message || error}`);
      return { origin, html: null };
    }
  }

  async _timed(origin, phase, run) {
    const started = Date.now();
    try {
      return await run();
    } finally {
      this._warn(`warmup phase ${phase} for ${origin} took ${Date.now() - started}ms`);
    }
  }

  async _warmNow(origin, containerId, target = null, scrape = null) {
    let tabId = null;
    let keepTabOpen = false;
    try {
      tabId = await this._timed(origin, "open+consent", () =>
        this._openTab(origin, containerId),
      );

      if (target) {
        const html = await this._timed(origin, "cold-call", () =>
          this._coldCall(origin, containerId, tabId, target, scrape),
        );
        return { reached: Boolean(html), html };
      }

      const reachedSearch = await this._timed(origin, "form", () =>
        this._tryForm(origin, containerId, tabId),
      );
      if (reachedSearch) return { reached: true, html: null };
      await this._timed(origin, "inspect", () =>
        this._inspectPage(origin, containerId, tabId),
      );
      return { reached: false, html: null };
    } catch (error) {
      if (error instanceof OriginBlockedError) {
        keepTabOpen = true;
        if (typeof tabId === "number") {
          this._registerCaptcha(tabId, origin, "warmup");
          this._warn(
            `keeping warmup tab ${tabId} open for manual attention (${origin}, reason=${error.reason || error.message || "blocked"})`,
          );
        }
      }
      throw error;
    } finally {
      if (!keepTabOpen) {
        await this._closeTabQuietly(tabId);
        this._ownedTabIds.delete(tabId);
        this._tabContainerIds.delete(tabId);
      }
    }
  }

  async _coldCall(origin, containerId, tabId, target, scrape = {}) {
    const cap = Math.min(WARMUP_ACTION_TIMEOUT_MS, this._timeoutMs());
    const jump = await this._inject(tabId, navigateJs(target), cap);
    if (!jump?.navigating) {
      this._warn(
        `cold call for ${origin} could not navigate to the target (${jump?.reason || "unknown"}); falling back to the warmup form`,
      );
      return null;
    }

    await this._awaitMatch(tabId, {
      origin,
      awayFrom: jump.from,
      urlMatch: scrape?.urlMatch,
      domMatch: scrape?.domMatch,
      failUrlMatch: scrape?.failUrlMatch,
      timeoutMs: this._timeoutMs(),
    });
    await this._acceptConsent?.(tabId);
    await this._inspectPage(origin, containerId, tabId);

    const html = await this._inject(tabId, documentHtmlJs(), this._timeoutMs());
    if (!html) {
      this._warn(`cold call for ${origin} reached the target but returned no HTML`);
      return null;
    }
    this._warn(
      `cold call for ${origin} scraped the target page directly (tab=${tabId}, bytes=${html.length})`,
    );
    return html;
  }

  async _openTab(origin, containerId) {
    const tabResp = await this._cmd(
      "tab_open",
      tabSpell(`${origin}/`, containerId),
    );
    const tabId = tabResp?.data?.id;
    if (typeof tabId !== "number") {
      throw new Error(
        "lolcat-4play: warmup tab_open did not return a valid tab id",
      );
    }
    this._ownedTabIds.add(tabId);
    if (containerId) this._tabContainerIds.set(tabId, containerId);
    await this._awaitMatch(tabId, {
      origin,
      timeoutMs: Math.min(OPEN_READY_TIMEOUT_MS, this._timeoutMs()),
    });
    await sleep(this._settleMs());
    await this._acceptConsent?.(tabId);
    return tabId;
  }

  async _progressPage(origin, containerId, tabId, stage) {
    const cap = Math.min(WARMUP_ACTION_TIMEOUT_MS, this._timeoutMs());
    const navigated = this._awaitReady(tabId, cap);
    const progressed = await this._inject(tabId, progressPageJs(), cap);
    if (!progressed?.progressed) return false;
    this._warn(
      `warmup progressed ${origin} (${stage}, container=${containerId || "default"}, tab=${tabId}, via=${progressed.via || "unknown"}, target=${progressed.href || "unknown"})`,
    );
    await navigated;
    await sleep(this._settleMs());
    return true;
  }

  async _inspectPage(origin, containerId, tabId) {
    const page = await this._inject(
      tabId,
      inspectPageJs(),
      Math.min(WARMUP_ACTION_TIMEOUT_MS, this._timeoutMs()),
    );
    const haystack = `${page?.title || ""}\n${page?.href || ""}\n${page?.text || ""}`;
    if (looksConsent(haystack, page?.href)) {
      if (await this._acceptConsent?.(tabId)) {
        return this._inspectPage(origin, containerId, tabId);
      }
      throw new OriginBlockedError(origin, "warmup consent", tabId, "consent");
    }
    if (looksBlocked(haystack, page?.href)) {
      this.markBlocked(origin, containerId, "warmup page block/captcha", tabId);
      throw new OriginBlockedError(origin, "warmup page block/captcha", tabId);
    }
    return page;
  }

  async _tryForm(origin, containerId, tabId, progressAttempts = 0) {
    const cap = Math.min(WARMUP_ACTION_TIMEOUT_MS, this._timeoutMs());
    const submitted = await this._inject(tabId, warmupSearchJs(this._warmupQuery()), cap);
    if (!submitted?.submitted) {
      if (progressAttempts >= 2) return false;
      const progressed = await this._progressPage(
        origin,
        containerId,
        tabId,
        `search form unavailable (${submitted?.reason || "unknown"})`,
      );
      if (!progressed) return false;
      return this._tryForm(origin, containerId, tabId, progressAttempts + 1);
    }

    await sleep(this._settleMs());
    await this._inspectPage(origin, containerId, tabId);
    return true;
  }
}
