import { tabSpell } from "./browser.js";
import {
  OriginBlockedError,
  inspectPageJs,
  looksBlocked,
  originFor,
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
    retireContainer,
    ownedTabIds,
    captchaTabIds,
    seenOrigins,
    warn,
    timeoutMs,
    warmupQuery,
    warmupTtlMs,
    blockCooldownMs,
    settleMs,
  }) {
    this._cmd = cmd;
    this._inject = inject;
    this._awaitDom = awaitDom;
    this._closeTabQuietly = closeTabQuietly;
    this._store = store;
    this._retireContainer = retireContainer;
    this._ownedTabIds = ownedTabIds;
    this._captchaTabIds = captchaTabIds;
    this._seenOrigins = seenOrigins;
    this._warn = warn;
    this._timeoutMs = timeoutMs;
    this._warmupQuery = warmupQuery;
    this._warmupTtlMs = warmupTtlMs;
    this._blockCooldownMs = blockCooldownMs;
    this._settleMs = settleMs;
  }

  markBlocked(origin, containerId, reason = "blocked", tabId = null) {
    const tabInfo = typeof tabId === "number" ? tabId : "unknown";
    this._warn(
      `tainting ${origin} session for ${Math.round(this._blockCooldownMs() / 60000)}m (container=${containerId || "default"}, tab=${tabInfo}, reason: ${reason}); retiring container`,
    );
    this._store.setWarmupState(origin, containerId, {
      blockedUntil: Date.now() + this._blockCooldownMs(),
      reason,
    });
    this._retireContainer(containerId);
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
      await promise;
      const session = this._store.usableHeaderSession(origin, containerId);
      if (session) {
        this._store.setWarmupState(origin, containerId, { warmedAt: Date.now() });
      } else {
        this._store.dropWarmup(origin, containerId);
        this._warn(
          `origin warmup for ${origin} did not capture a reusable main-frame browser session`,
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
      await this._inspectPage(origin, containerId, tabId);
      await this._tryForm(origin, containerId, tabId);
    } catch (error) {
      if (error instanceof OriginBlockedError) {
        keepTabOpen = true;
        if (typeof tabId === "number") {
          this._captchaTabIds.add(tabId);
        }
      }
      throw error;
    } finally {
      if (!keepTabOpen) {
        await this._closeTabQuietly(tabId);
        this._ownedTabIds.delete(tabId);
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
    await this._awaitDom(tabId, this._timeoutMs()).catch(() => null);
    await sleep(this._settleMs());
    return tabId;
  }

  async _inspectPage(origin, containerId, tabId) {
    const page = await this._inject(
      tabId,
      inspectPageJs(),
      Math.min(10000, this._timeoutMs()),
    );
    const haystack = `${page?.title || ""}\n${page?.href || ""}\n${page?.text || ""}`;
    if (looksBlocked(haystack)) {
      this.markBlocked(origin, containerId, "warmup page block/captcha", tabId);
      throw new OriginBlockedError(origin, "warmup page block/captcha", tabId);
    }
    return page;
  }

  async _tryForm(origin, containerId, tabId) {
    const submitted = await this._inject(
      tabId,
      warmupSearchJs(this._warmupQuery()),
      Math.min(10000, this._timeoutMs()),
    );
    if (!submitted?.submitted) return false;

    await this._awaitDom(tabId, Math.min(10000, this._timeoutMs())).catch(
      () => null,
    );
    await sleep(this._settleMs());
    await this._inspectPage(origin, containerId, tabId);
    return true;
  }
}
