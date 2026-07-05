export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

const asList = (res) =>
  Array.isArray(res) ? res : res?.containers || res?.tabs || res?.list || res?.data || [];

export class StatusReporter {
  constructor({
    connected,
    command,
    store,
    containers,
    tabs,
    captcha,
    seenOrigins,
    maxPoolSize,
    autoWarmMs,
    timeoutMs,
    warn,
  }) {
    this._connected = connected;
    this._command = command;
    this._store = store;
    this._containers = containers;
    this._tabs = tabs;
    this._captcha = captcha;
    this._seenOrigins = seenOrigins;
    this._maxPoolSize = maxPoolSize;
    this._autoWarmMs = autoWarmMs;
    this._timeoutMs = timeoutMs;
    this._warn = warn;
    this._cache = null;
  }

  bindCache(cache) {
    this._cache = cache;
  }

  async _refreshBrowserState() {
    if (!this._connected()) return;
    const shortTimeout = Math.min(5000, this._timeoutMs());
    try {
      const res = await this._command("get_container_list", {}, shortTimeout);
      for (const container of asList(res)) {
        this._tabs.rememberContainer({ id: container.id, name: container.name });
      }
    } catch (error) {
      this._warn(`container label refresh failed: ${error?.message || error}`);
    }
    try {
      const res = await this._command("get_tabs", {}, shortTimeout);
      for (const tab of asList(res)) this._tabs.rememberTab(tab);
    } catch (error) {
      this._warn(`tab label refresh failed: ${error?.message || error}`);
    }
  }

  build() {
    const now = Date.now();
    const sessions = [...this._store.sessionKeys()]
      .map((key) => this._store.sessionEntry(key, now))
      .map((session) => ({
        ...session,
        containerLabel: this._tabs.containerLabel(session.container),
      }))
      .sort((a, b) => a.origin.localeCompare(b.origin));

    const captchaTabs = [...this._captcha.captchaTabIds].map((tabId) => {
      const tab = this._tabs.tabDetails.get(tabId) || { id: tabId };
      const container = tab.container || this._tabs.tabContainerIds.get(tabId) || null;
      return {
        id: tabId,
        title: tab.title || tab.url || `Tab ${tabId}`,
        url: tab.url || "",
        container,
        containerLabel: this._tabs.containerLabel(container),
      };
    });

    return {
      connected: this._connected(),
      sessions,
      containers: {
        idle: this._containers.idleCount(),
        leased: this._containers.busyCount(),
        max: this._maxPoolSize(),
      },
      captchaTabs,
      autoWarm: {
        intervalMs: this._autoWarmMs(),
        tracked: [...this._seenOrigins],
      },
      updatedAt: now,
    };
  }

  async publish() {
    if (!this._cache) return;
    await this._refreshBrowserState();
    this._cache.set("current", this.build(), STATUS_TTL_MS).catch(() => {});
  }
}
