import { inspectPageJs, documentHtmlJs } from "../injectors/index.js";
import { looksBlocked, looksConsent } from "../browser/page-signals.js";
import { originFor } from "../util/url.js";

const htmlResponse = (html, status = 200) =>
  new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

export class CaptchaManager {
  constructor({ tabs, registry, releaseHold, timeoutMs, warn }) {
    this._tabs = tabs;
    this._registry = registry;
    this._releaseHold = releaseHold;
    this._timeoutMs = timeoutMs;
    this._warn = warn;

    this.captchaTabIds = new Set();
    this._originByTab = new Map();
    this._kindByTab = new Map();
  }

  clear() {
    this.captchaTabIds.clear();
    this._originByTab.clear();
    this._kindByTab.clear();
  }

  register(tabId, origin, kind = "fetch") {
    if (typeof tabId !== "number") return;
    this.captchaTabIds.add(tabId);
    const resolved = origin || originFor(this._tabs.tabUrls.get(tabId) || "");
    if (resolved) this._originByTab.set(tabId, resolved);
    this._kindByTab.set(tabId, kind);
  }

  _forget(tabId) {
    this.captchaTabIds.delete(tabId);
    this._originByTab.delete(tabId);
    this._kindByTab.delete(tabId);
  }

  _originForTab(tabId) {
    return (
      this._originByTab.get(tabId) ||
      originFor(this._tabs.tabUrls.get(tabId) || "")
    );
  }

  hasOpenTabForOrigin(origin) {
    if (!origin) return false;
    for (const tabId of this.captchaTabIds) {
      if (this._originForTab(tabId) === origin) return true;
    }
    return false;
  }

  _inspectTimeout() {
    return Math.min(10000, this._timeoutMs());
  }

  async _release(tabId) {
    const containerId = this._tabs.tabContainers.get(tabId) ?? null;
    this._forget(tabId);
    await this._tabs.close(tabId);
    if (containerId) await this._releaseHold?.(containerId);
  }

  async syncTab(tabId) {
    if (!this.captchaTabIds.has(tabId)) return false;

    let page = await this._tabs.inject(tabId, inspectPageJs(), this._inspectTimeout());
    if (!page?.href) return false;
    let haystack = `${page?.title || ""}\n${page?.href || ""}\n${page?.text || ""}`;

    if (looksConsent(haystack, page?.href)) {
      await this._tabs.acceptConsent(tabId);
      page = await this._tabs.inject(tabId, inspectPageJs(), this._inspectTimeout());
      if (!page?.href) return false;
      haystack = `${page?.title || ""}\n${page?.href || ""}\n${page?.text || ""}`;
    }

    const origin = originFor(page?.href || "");
    if (!origin || looksBlocked(haystack, page?.href) || looksConsent(haystack, page?.href)) {
      return false;
    }

    const containerId = this._tabs.tabContainers.get(tabId) ?? null;
    this._registry.markWarmed(origin, containerId, {});
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
        await this._release(tabId);
        return null;
      }

      const html = await this._tabs.inject(tabId, documentHtmlJs());
      if (!html) continue;
      await this._release(tabId);
      return htmlResponse(html);
    }
    return null;
  }

  async clearTabs() {
    if (!this.captchaTabIds.size) return;
    for (const tabId of [...this.captchaTabIds]) {
      await this._release(tabId);
    }
  }

  async clearTabsForOrigin(origin) {
    if (!origin) return;
    for (const tabId of [...this.captchaTabIds]) {
      if (this._originForTab(tabId) !== origin) continue;
      await this._release(tabId);
    }
  }
}
