export class EventRouter {
  constructor({ registry, tabs, warn }) {
    this._registry = registry;
    this._tabs = tabs;
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
