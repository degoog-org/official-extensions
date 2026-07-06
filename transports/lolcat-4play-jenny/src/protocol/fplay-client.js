export class FplayClient {
  constructor({ session, timeoutMs, warn }) {
    this._session = session;
    this._timeoutMs = timeoutMs;
    this._warn = warn;
  }

  async command(action, params = {}, timeoutMs = this._timeoutMs()) {
    const session = this._session();
    if (!session) throw new Error("lolcat-4play: browser extension is not connected");
    return session.cmd(action, params, timeoutMs);
  }

  async webResponseWhitelist(list = []) {
    return this.command("web_response_whitelist", { list });
  }

  async getContainerList(timeoutMs) {
    return this.command("get_container_list", {}, timeoutMs);
  }

  async getTabs(timeoutMs) {
    return this.command("get_tabs", {}, timeoutMs);
  }

  async openTab(url, container = null, timeoutMs) {
    const params = { url };
    if (container) params.container = container;
    return this.command("tab_open", params, timeoutMs);
  }

  async closeTabs(tabid) {
    return this.command("tab_close", { tabid });
  }

  async inject(tabid, js, timeoutMs) {
    return this.command("tab_inject_js", { tabid, js }, timeoutMs);
  }

  async createContainer(name = null) {
    const params = name ? { name } : {};
    return this.command("container_create", params);
  }

  async attachProxy(id, proxy) {
    return this.command("container_attach_proxy", { id, proxy });
  }

  async deleteContainers(id) {
    return this.command("container_delete", { id: Array.isArray(id) ? id : [id] });
  }
}
