import { consentClickJs, sleep } from "../warmup/origin-warmup.js";

export class TabController {
  constructor({ command, dom, timeoutMs, settleMs, warn }) {
    this._command = command;
    this._dom = dom;
    this._timeoutMs = timeoutMs;
    this._settleMs = settleMs;
    this._warn = warn;

    this.ownedTabIds = new Set();
    this.tabContainerIds = new Map();
    this.containerLabels = new Map();
    this.tabDetails = new Map();
  }

  clear() {
    this.ownedTabIds.clear();
    this.tabContainerIds.clear();
    this.containerLabels.clear();
    this.tabDetails.clear();
  }

  rememberContainer(container = {}) {
    if (container.id && container.name) {
      this.containerLabels.set(container.id, container.name);
    }
  }

  containerLabel(containerId) {
    return containerId
      ? this.containerLabels.get(containerId) || containerId
      : null;
  }

  rememberTab(tab = {}) {
    if (typeof tab.id !== "number") return;
    this.tabDetails.set(tab.id, {
      id: tab.id,
      title: tab.title || "",
      url: tab.url || "",
      container: tab.container || null,
    });
    if (tab.container) this.tabContainerIds.set(tab.id, tab.container);
  }

  forgetTab(tabId) {
    if (typeof tabId !== "number") return;
    this.ownedTabIds.delete(tabId);
    this.tabContainerIds.delete(tabId);
    this.tabDetails.delete(tabId);
  }

  async closeTabQuietly(tabId) {
    if (typeof tabId !== "number") return;
    this.tabDetails.delete(tabId);
    this.tabContainerIds.delete(tabId);
    try {
      const result = await this._command("tab_close", { tabid: [tabId] });
      const closed = Number(result?.closed_tab_count) || 0;
      if (closed > 0) {
        this._warn(`closed browser tab ${tabId}`);
      } else {
        this._warn(
          `browser tab ${tabId} was already gone or was not closed by 4play`,
        );
      }
    } catch (error) {
      this._warn(
        `failed to close browser tab ${tabId}: ${error?.message || error}`,
      );
    }
  }

  awaitDom(tabId, timeoutMs = this._timeoutMs()) {
    return this._dom.wait(tabId, Math.min(timeoutMs, this._timeoutMs()));
  }

  async inject(tabId, js, timeoutMs = this._timeoutMs()) {
    const result = await this._command(
      "tab_inject_js",
      { tabid: tabId, js },
      timeoutMs,
    );
    if (result?.status !== true) return null;
    const frameResult = Array.isArray(result.result) ? result.result[0] : null;
    return frameResult?.result ?? null;
  }

  async acceptConsent(tabId) {
    const consentTimeout = () => Math.min(10000, this._timeoutMs());
    for (let i = 0; i < 3; i++) {
      const result = await this.inject(tabId, consentClickJs(), consentTimeout());
      if (!result) return false;
      if (!result.consent) return true;
      if (!result.progressed) return false;
      this._warn(
        `accepted consent on tab ${tabId} (${result.label || result.via || "unknown"})`,
      );
      await this.awaitDom(tabId, consentTimeout()).catch(() => null);
      await sleep(this._settleMs());
    }
    const result = await this.inject(tabId, consentClickJs(), consentTimeout());
    return !result?.consent;
  }
}
