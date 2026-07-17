import { documentHtmlJs, inspectPageJs } from "../injectors/index.js";
import { looksBlocked, looksConsent, originFor } from "../warmup/origin-warmup.js";
import { wrapResponse } from "../net/response.js";

const UNREACHABLE_LIMIT = 3;

export class CaptchaManager {
  constructor({ tabs, store, timeoutMs, warn }) {
    this._tabs = tabs;
    this._store = store;
    this._timeoutMs = timeoutMs;
    this._warn = warn;

    this.captchaTabIds = new Set();
    this._originByTab = new Map();
    this._kindByTab = new Map();
    this._missByTab = new Map();
  }

  clear() {
    this.captchaTabIds.clear();
    this._originByTab.clear();
    this._kindByTab.clear();
    this._missByTab.clear();
  }

  register(tabId, origin, kind = "fetch") {
    if (typeof tabId !== "number") return;
    this.captchaTabIds.add(tabId);
    const resolved =
      origin || originFor(this._tabs.tabDetails.get(tabId)?.url || "");
    if (resolved) this._originByTab.set(tabId, resolved);
    this._kindByTab.set(tabId, kind);
  }

  _forget(tabId) {
    this.captchaTabIds.delete(tabId);
    this._originByTab.delete(tabId);
    this._kindByTab.delete(tabId);
    this._missByTab.delete(tabId);
  }

  _originForTab(tabId) {
    return (
      this._originByTab.get(tabId) ||
      originFor(this._tabs.tabDetails.get(tabId)?.url || "")
    );
  }

  _containerFor(tabId) {
    return this._tabs.tabContainerIds.get(tabId) ?? null;
  }

  hasOpenTabForOrigin(origin) {
    if (!origin) return false;
    for (const tabId of this.captchaTabIds) {
      if (this._originForTab(tabId) === origin) return true;
    }
    return false;
  }

  hasOpenTab(origin, containerId = null) {
    if (!origin) return false;
    for (const tabId of this.captchaTabIds) {
      if (this._originForTab(tabId) !== origin) continue;
      if (containerId && this._containerFor(tabId) !== containerId) continue;
      return true;
    }
    return false;
  }

  async dropTabsFor(containerId) {
    if (!containerId) return;
    for (const tabId of [...this.captchaTabIds]) {
      if (this._containerFor(tabId) !== containerId) continue;
      this._warn(
        `dropping captcha flag on tab ${tabId}; its container ${containerId} is gone`,
      );
      this._forget(tabId);
      this._tabs.forgetTab(tabId);
    }
  }

  async dropTab(tabId) {
    if (!this.captchaTabIds.has(tabId)) return false;
    this._forget(tabId);
    this._tabs.forgetTab(tabId);
    await this._tabs.closeTabQuietly(tabId);
    this._warn(`dismissed captcha tab ${tabId} on request`);
    return true;
  }

  _inspectTimeout() {
    return Math.min(10000, this._timeoutMs());
  }

  _countMiss(tabId) {
    const misses = (this._missByTab.get(tabId) || 0) + 1;
    this._missByTab.set(tabId, misses);
    if (misses < UNREACHABLE_LIMIT) return false;

    const origin = this._originForTab(tabId);
    this._forget(tabId);
    this._tabs.forgetTab(tabId);
    this._warn(
      `captcha tab ${tabId} unreachable ${misses}x; dropping the flag so ${origin || "its origin"} stops being gated`,
    );
    return false;
  }

  async syncTab(tabId) {
    if (!this.captchaTabIds.has(tabId)) return false;

    let page = await this._tabs.inject(tabId, inspectPageJs(), this._inspectTimeout());
    if (!page?.href) {
      return this._countMiss(tabId);
    }
    this._missByTab.delete(tabId);
    let haystack = `${page?.title || ""}\n${page?.href || ""}\n${page?.text || ""}`;

    if (looksConsent(haystack, page?.href)) {
      await this._tabs.acceptConsent(tabId);
      page = await this._tabs.inject(tabId, inspectPageJs(), this._inspectTimeout());
      if (!page?.href) {
        return false;
      }
      haystack = `${page?.title || ""}\n${page?.href || ""}\n${page?.text || ""}`;
    }

    const origin = originFor(page?.href || "");
    if (!origin || looksBlocked(haystack, page?.href) || looksConsent(haystack, page?.href)) {
      return false;
    }

    const containerId = this._tabs.tabContainerIds.get(tabId) ?? null;
    this._store.setWarmupState(origin, containerId, { warmedAt: Date.now() });
    this._warn(
      `unblocked ${origin} after solve (container=${containerId || "default"}, tab=${tabId})`,
    );
    return true;
  }

  async syncAllTabs() {
    for (const tabId of [...this.captchaTabIds]) {
      await this.syncTab(tabId);
    }
  }

  async tryFetch(url) {
    const origin = originFor(url);
    if (!origin || !this.captchaTabIds.size) return null;
    for (const tabId of [...this.captchaTabIds]) {
      if (this._originForTab(tabId) !== origin) continue;
      const solved = await this.syncTab(tabId);
      if (!solved) continue;

      if (this._kindByTab.get(tabId) === "warmup") {
        this._warn(
          `${origin} warmup tab ${tabId} solved; session is warm, deferring to normal fetch`,
        );
        this._forget(tabId);
        this._tabs.forgetTab(tabId);
        await this._tabs.closeTabQuietly(tabId);
        return null;
      }

      const html = await this._tabs.inject(tabId, documentHtmlJs());
      if (!html) continue;
      this._forget(tabId);
      this._tabs.forgetTab(tabId);
      await this._tabs.closeTabQuietly(tabId);
      return wrapResponse(html);
    }
    return null;
  }

  async clearTabs() {
    if (!this.captchaTabIds.size) return;
    const ids = [...this.captchaTabIds];
    this.clear();
    for (const id of ids) {
      this._tabs.forgetTab(id);
      await this._tabs.closeTabQuietly(id);
    }
  }

  async clearTabsForOrigin(origin) {
    if (!origin) return;
    for (const tabId of [...this.captchaTabIds]) {
      if (this._originForTab(tabId) !== origin) continue;
      this._forget(tabId);
      this._tabs.forgetTab(tabId);
      await this._tabs.closeTabQuietly(tabId);
    }
  }
}
