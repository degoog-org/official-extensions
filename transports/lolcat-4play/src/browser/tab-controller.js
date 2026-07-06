import { consentClickJs, readyStateJs } from "../injectors/index.js";
import { sleep } from "../warmup/origin-warmup.js";

const READY_POLL_MS = 400;
const READY_POLL_GRACE_MS = 1200;
const CONSENT_NAVIGATION_TIMEOUT_MS = 1500;

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

  armDom(tabId, timeoutMs = this._timeoutMs()) {
    return this._dom.wait(tabId, Math.min(timeoutMs, this._timeoutMs())).catch(() => null);
  }

  async awaitReady(tabId, timeoutMs = this._timeoutMs()) {
    if (typeof tabId !== "number") return null;
    const cap = Math.min(timeoutMs, this._timeoutMs());
    return Promise.race([this.armDom(tabId, cap), this._pollReady(tabId, cap)]);
  }

  async _pollReady(tabId, cap) {
    const deadline = Date.now() + cap;
    await sleep(Math.min(READY_POLL_GRACE_MS, Math.max(0, cap / 4)));
    while (Date.now() < deadline) {
      const state = await this.inject(tabId, readyStateJs()).catch(() => null);
      if (state === "complete") return { id: tabId, via: "poll" };
      await sleep(READY_POLL_MS);
    }
    return null;
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
    const consentTimeout = () => Math.min(CONSENT_NAVIGATION_TIMEOUT_MS, this._timeoutMs());
    const result = await this.inject(tabId, consentClickJs(), consentTimeout());
    if (!result) return false;
    if (!result.consent) return true;
    if (!result.progressed) return false;
    this._warn(
      `accepted consent on tab ${tabId} (${result.label || result.via || "unknown"})`,
    );
    await sleep(this._settleMs());
    return true;
  }
}
