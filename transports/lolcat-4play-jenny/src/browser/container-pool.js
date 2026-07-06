export class ContainerPool {
  constructor({ client, maxPoolSize, useContainer, proxySettings, warn }) {
    this._client = client;
    this._maxPoolSize = maxPoolSize;
    this._useContainer = useContainer;
    this._proxySettings = proxySettings;
    this._warn = warn;
    this._idle = [];
    this._leased = new Set();
    this._manual = new Set();
    this._configKey = "";
  }

  snapshot() {
    return {
      idle: [...this._idle],
      leased: [...this._leased],
      manual: [...this._manual],
      max: this._maxPoolSize(),
    };
  }

  clear() {
    this._idle = [];
    this._leased.clear();
    this._manual.clear();
  }

  async borrow() {
    if (!this._useContainer()) return null;
    await this._retireIfConfigChanged();
    const existing = this._idle.shift();
    if (existing) {
      this._leased.add(existing);
      return existing;
    }
    const total = this._idle.length + this._leased.size + this._manual.size;
    if (total >= this._maxPoolSize() && this._idle.length === 0) return null;
    const id = await this._createContainer();
    this._leased.add(id);
    return id;
  }

  async release(id, { keep = true, degraded = false } = {}) {
    if (!id) return;
    this._leased.delete(id);
    if (!keep || degraded) {
      await this.retire(id);
      return;
    }
    if (!this._idle.includes(id) && !this._manual.has(id)) this._idle.push(id);
  }

  holdForManualAttention(id) {
    if (!id) return;
    this._leased.delete(id);
    this._idle = this._idle.filter((item) => item !== id);
    this._manual.add(id);
  }

  async retire(id) {
    if (!id) return;
    this._leased.delete(id);
    this._manual.delete(id);
    this._idle = this._idle.filter((item) => item !== id);
    await this._client.deleteContainers(id).catch((error) => this._warn?.(`container_delete failed for ${id}: ${error?.message || error}`));
  }

  async _retireIfConfigChanged() {
    const key = this._proxyKey();
    if (!this._configKey) {
      this._configKey = key;
      return;
    }
    if (key === this._configKey) return;
    const old = [...this._idle];
    this._idle = [];
    this._configKey = key;
    await Promise.all(old.map((id) => this.retire(id)));
  }

  async _createContainer() {
    const res = await this._client.createContainer(`degoog-${Date.now()}`);
    const id = res?.data?.id || res?.id || res?.data;
    if (!id) throw new Error("4play container_create did not return container id");
    const proxy = this._proxyPayload();
    if (proxy) {
      const attached = await this._client.attachProxy(id, proxy);
      if (attached?.status === false) throw new Error("4play container_attach_proxy failed");
    }
    return id;
  }

  _proxyPayload() {
    const settings = this._proxySettings?.() || {};
    if (!settings.proxyType || settings.proxyType === "none" || !settings.proxyHost) return null;
    return {
      type: settings.proxyType,
      host: settings.proxyHost,
      port: Number(settings.proxyPort) || 1080,
      username: settings.proxyUsername || "",
      password: settings.proxyPassword || "",
      dns: settings.proxyDns !== false,
    };
  }

  _proxyKey() {
    return JSON.stringify(this._proxyPayload() || { type: "none" });
  }
}
