export const STATUS_TTL_MS = 5 * 60 * 1000;

export class StatusPublisher {
  constructor({ name, connected, client, registry, containers, seenOrigins, autoWarmMs, warn }) {
    this._name = name;
    this._connected = connected;
    this._client = client;
    this._registry = registry;
    this._containers = containers;
    this._seenOrigins = seenOrigins;
    this._autoWarmMs = autoWarmMs;
    this._warn = warn;
    this._cache = null;
  }

  bindCache(cache) {
    this._cache = cache;
  }

  snapshot() {
    const pool = this._containers.snapshot?.() || { idle: [], leased: [], manual: [], max: 0 };
    const sessions = this._registry.all();
    return {
      name: this._name(),
      connected: this._connected(),
      updatedAt: Date.now(),
      autoWarmMs: this._autoWarmMs(),
      origins: [...this._seenOrigins],
      containers: {
        idle: pool.idle.length,
        leased: pool.leased.length,
        manual: pool.manual.length,
        max: pool.max,
        ids: pool,
      },
      sessions: sessions.map((entry) => ({
        origin: entry.origin,
        containerId: entry.containerId,
        state: entry.state,
        via: entry.via || "",
        reason: entry.reason || "",
        updatedAt: entry.updatedAt,
        capturedUrl: entry.capturedUrl || "",
        tabId: entry.tabId || null,
      })),
    };
  }

  async publish() {
    const data = this.snapshot();
    if (this._cache?.set) await this._cache.set("latest", data).catch(() => {});
    return data;
  }
}
