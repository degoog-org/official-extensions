export const CONTROL_TTL_MS = 60 * 1000;
const CONTROL_POLL_MS = 3000;

export class ControlChannel {
  constructor({ store, containers, captcha, seenOrigins, publish, containerConfigKey, warn }) {
    this._store = store;
    this._containers = containers;
    this._captcha = captcha;
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

    let outcome;
    try {
      outcome = await this._handle(request);
    } catch (error) {
      outcome = { ok: false, message: error?.message || String(error) };
    }
    await this._cache
      .set("result", { id: request.id, scope: request.scope, ...outcome, at: Date.now() }, CONTROL_TTL_MS)
      .catch((error) => this._warn(`control result publish failed: ${error?.message || error}`));
  }

  async _handle(request) {
    if (request.scope === "all") {
      await this._clearAll();
      return { ok: true, message: "cleared every session, captcha flag and container" };
    }
    if (request.scope === "session" && typeof request.key === "string") {
      return (await this._clearByKey(request.key))
        ? { ok: true, message: "session cleared" }
        : { ok: false, message: "that session was already gone" };
    }
    if (request.scope === "captcha") {
      const tabId = typeof request.tabId === "number" ? request.tabId : null;
      return (await this._clearCaptcha(tabId))
        ? { ok: true, message: tabId === null ? "every captcha flag dismissed" : "captcha flag dismissed" }
        : { ok: false, message: `captcha tab ${tabId} was not flagged` };
    }
    return { ok: false, message: `unknown scope ${request.scope}` };
  }

  async _clearAll() {
    this._warn("clearing all warmed sessions, captcha flags and retiring containers");
    await this._captcha.clearTabs();
    this._store.clearAll();
    this._seenOrigins.clear();
    this._containers.yerOldGetOuttaHere();
    await this._containers.sweepRetiredContainers();
    this._publish();
  }

  async _clearCaptcha(tabId) {
    let dropped = true;
    if (tabId === null) {
      this._warn("clearing all captcha flags");
      await this._captcha.clearTabs();
    } else if (!(await this._captcha.dropTab(tabId))) {
      this._warn(`captcha tab ${tabId} was not flagged; nothing to clear`);
      dropped = false;
    }
    this._publish();
    return dropped;
  }

  async _clearByKey(key) {
    const memKey = this._store.clearKey(key);
    if (!memKey) return false;
    this._warn(
      `cleared warmed session ${key.split("\n").pop()} (container=${memKey})`,
    );
    if (memKey !== "default" && memKey !== this._containerConfigKey()) {
      this._containers.retireContainer(memKey);
      await this._containers.sweepRetiredContainers();
    }
    this._publish();
    return true;
  }
}
