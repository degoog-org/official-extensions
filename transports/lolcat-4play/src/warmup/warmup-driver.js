import { tabSpell } from "../browser/browser.js";
import {
  OriginBlockedError,
  inspectPageJs,
  looksBlocked,
  looksConsent,
  originFor,
  progressPageJs,
  sleep,
  warmupSearchJs,
} from "./origin-warmup.js";

export class WarmupDriver {
  constructor({
    cmd,
    inject,
    awaitDom,
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

  async ensureWarm(url, containerId) {
    const origin = originFor(url);
    if (!origin) return null;

    if (!this._seenOrigins.has(origin)) {
      this._seenOrigins.add(origin);
      this._store.persistOrigins([...this._seenOrigins]);
    }
    this.assertUsable(origin, containerId);

    await this._store.loadSessionFromCache(origin, containerId);

    const state = this._store.warmupState(origin, containerId);
    if (state?.warmedAt && Date.now() - state.warmedAt < this._warmupTtlMs()) {
      return origin;
    }
    if (state?.promise) {
      await state.promise;
      return origin;
    }

    const promise = this._warmNow(origin, containerId);
    this._store.setWarmupState(origin, containerId, { promise });
    try {
      const reachedSearch = await promise;
      const session = this._store.usableHeaderSession(origin, containerId);
      if (reachedSearch && session) {
        this._store.setWarmupState(origin, containerId, { warmedAt: Date.now() });
      } else {
        this._store.dropWarmup(origin, containerId);
        this._warn(
          `origin warmup for ${origin} did not reach a usable search session (reachedSearch=${reachedSearch}, session=${Boolean(session)})`,
        );
      }
      return origin;
    } catch (error) {
      if (error instanceof OriginBlockedError) throw error;
      this._store.dropWarmup(origin, containerId);
      this._warn(`origin warmup failed for ${origin}: ${error?.message || error}`);
      return origin;
    }
  }

  async _warmNow(origin, containerId) {
    let tabId = null;
    let keepTabOpen = false;
    try {
      tabId = await this._openTab(origin, containerId);
      await this._progressPage(origin, containerId, tabId, "opened warmup page");
      await this._inspectPage(origin, containerId, tabId);
      return await this._tryForm(origin, containerId, tabId);
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
    await this._awaitDom(tabId, this._timeoutMs()).catch(() => null);
    await sleep(this._settleMs());
    await this._acceptConsent?.(tabId);
    return tabId;
  }

  async _progressPage(origin, containerId, tabId, stage) {
    const progressed = await this._inject(
      tabId,
      progressPageJs(),
      Math.min(10000, this._timeoutMs()),
    );
    if (!progressed?.progressed) return false;
    this._warn(
      `warmup progressed ${origin} (${stage}, container=${containerId || "default"}, tab=${tabId}, via=${progressed.via || "unknown"}, target=${progressed.href || "unknown"})`,
    );
    await this._awaitDom(tabId, Math.min(10000, this._timeoutMs())).catch(
      () => null,
    );
    await sleep(this._settleMs());
    return true;
  }

  async _inspectPage(origin, containerId, tabId) {
    const page = await this._inject(
      tabId,
      inspectPageJs(),
      Math.min(10000, this._timeoutMs()),
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
    const submitted = await this._inject(
      tabId,
      warmupSearchJs(this._warmupQuery()),
      Math.min(10000, this._timeoutMs()),
    );
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

    await this._awaitDom(tabId, Math.min(10000, this._timeoutMs())).catch(
      () => null,
    );
    await sleep(this._settleMs());
    await this._progressPage(origin, containerId, tabId, "after warmup search submit");
    await this._inspectPage(origin, containerId, tabId);
    return true;
  }
}
