export const CONTROL_TTL_MS = 5 * 60 * 1000;

export class ControlChannel {
  constructor({ registry, containers, seenOrigins, publish, warn }) {
    this._registry = registry;
    this._containers = containers;
    this._seenOrigins = seenOrigins;
    this._publish = publish;
    this._warn = warn;
    this._cache = null;
    this._timer = null;
    this._lastCommandId = null;
  }

  bindCache(cache) {
    this._cache = cache;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._poll().catch((error) => this._warn?.(`control poll failed: ${error?.message || error}`)), 2500);
    this._timer.unref?.();
  }

  stop() {
    if (!this._timer) return;
    clearInterval(this._timer);
    this._timer = null;
  }

  async _poll() {
    if (!this._cache?.get) return;
    const command = await this._cache.get("command").catch(() => null);
    if (!command || command.id === this._lastCommandId) return;
    this._lastCommandId = command.id;
    await this._apply(command);
    await this._publish?.();
  }

  async _apply(command = {}) {
    const origin = command.origin;
    switch (command.action) {
      case "clear-origin":
        if (origin) this._registry.clearOrigin(origin);
        break;
      case "mark-degraded":
        if (origin) this._registry.markDegraded(origin, command.containerId || null, command.reason || "manual");
        break;
      case "retire-container":
        if (command.containerId) await this._containers.retire(command.containerId);
        break;
      case "forget-origin":
        if (origin) {
          this._registry.clearOrigin(origin);
          this._seenOrigins.delete(origin);
        }
        break;
      default:
        this._warn?.(`unknown control action: ${command.action || "missing"}`);
    }
  }
}
