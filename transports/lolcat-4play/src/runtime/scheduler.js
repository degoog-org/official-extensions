const HEARTBEAT_MS = 30000;

export class Scheduler {
  constructor({
    session,
    containers,
    warmer,
    seenOrigins,
    autoWarmMs,
    useContainer,
    publish,
    warn,
  }) {
    this._session = session;
    this._containers = containers;
    this._warmer = warmer;
    this._seenOrigins = seenOrigins;
    this._autoWarmMs = autoWarmMs;
    this._useContainer = useContainer;
    this._publish = publish;
    this._warn = warn;

    this._heartbeatTimer = null;
    this._autoWarmTimer = null;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      const browser = this._session()?.browser;
      if (!browser) return;
      try {
        browser.send(JSON.stringify({ action: "ping" }));
      } catch {
        return;
      }
    }, HEARTBEAT_MS);
  }

  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  startAutoWarm() {
    this.stopAutoWarm();
    const interval = this._autoWarmMs();
    if (!interval) return;
    this._autoWarmTimer = setInterval(() => {
      this._autoWarmTick().catch(() => {});
    }, interval);
  }

  stopAutoWarm() {
    if (this._autoWarmTimer) {
      clearInterval(this._autoWarmTimer);
      this._autoWarmTimer = null;
    }
  }

  async _autoWarmTick() {
    if (!this._session()?.connected() || !this._seenOrigins.size) return;
    const origins = [...this._seenOrigins];
    this._warn(`background warmup sweeping ${origins.length} origin(s)`);
    for (const origin of origins) {
      await this._autoWarmOrigin(origin).catch(() => {});
    }
    this._publish();
  }

  async _autoWarmOrigin(origin) {
    await this._containers.sweepRetiredContainers();
    const useContainer = this._useContainer();
    let containerId = null;
    try {
      if (useContainer) containerId = await this._containers.summonContainer(origin);
      await this._warmer.ensureWarm(`${origin}/`, containerId);
    } catch {
    } finally {
      await this._containers.tuckContainerIn(containerId);
    }
  }
}
