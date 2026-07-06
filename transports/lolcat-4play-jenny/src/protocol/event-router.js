export class EventRouter {
  constructor({ registry, tabs, captcha, warn }) {
    this._registry = registry;
    this._tabs = tabs;
    this._captcha = captcha;
    this._warn = warn;
  }

  handle(raw) {
    let msg;
    try {
      msg = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg?.action === "dom_ready" || msg?.action === "dom_load_fail") {
      if (msg.action === "dom_ready") {
        this._tabs.rememberTab(msg.data);
        const tabId = msg.data?.id;
        if (typeof tabId === "number" && this._captcha?.captchaTabIds.has(tabId)) {
          this._captcha.syncTab(tabId).catch(() => {});
        }
      }
      this._tabs.settleDom(msg);
      return;
    }
    if (msg?.action === "web_request") {
      this._tabs.rememberTab(msg.data);
      this._registry.captureRequest(msg.data, this._tabs.ownedTabs, this._tabs.tabContainers);
      return;
    }
    if (msg?.action === "web_response") {
      this._tabs.settleWebResponse(msg.data);
    }
  }
}
