export const CONTROL_TTL_MS = 60 * 1000;
const CONTROL_POLL_MS = 3000;

export class ControlChannel {
  constructor({ store, containers, seenOrigins, publish, containerConfigKey, warn }) {
    this._store = store;
    this._containers = containers;
    this._seenOrigins = seenOrigins;
    this._publish = publish;
    this._containerConfigKey = containerConfigKey;
    this._warn = warn;

    this._cache = null;
    this._timer = null;
    this._lastId = null;
  }

  bindCache(cache) {
    this._cache = cache;
  }

  start() {
    this.stop();
    this._timer = setInterval(() => {
      this._tick().catch(() => {});
    }, CONTROL_POLL_MS);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  async _tick() {
    if (!this._cache) return;
    const request = await this._cache.get("request").catch(() => null);
    if (!request?.id || request.id === this._lastId) return;
    this._lastId = request.id;

    if (request.scope === "all") {
      await this._clearAll();
      return;
    }
    if (request.scope === "session" && typeof request.key === "string") {
      await this._clearByKey(request.key);
    }
  }

  async _clearAll() {
    this._warn("clearing all warmed sessions and retiring containers");
    this._store.clearAll();
    this._seenOrigins.clear();
    this._containers.yerOldGetOuttaHere();
    await this._containers.sweepRetiredContainers();
    this._publish();
  }

  async _clearByKey(key) {
    const memKey = this._store.clearKey(key);
    if (!memKey) return;
    this._warn(
      `cleared warmed session ${key.split("\n").pop()} (container=${memKey})`,
    );
    if (memKey !== "default" && memKey !== this._containerConfigKey()) {
      this._containers.retireContainer(memKey);
      await this._containers.sweepRetiredContainers();
    }
    this._publish();
  }
}
