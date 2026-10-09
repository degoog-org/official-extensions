const LEASE_TTL_MS = 11 * 60 * 1000;

export class ContainerPool {
  constructor({
    command,
    hasSession,
    buildProxy,
    proxyType,
    timeoutMs,
    maxPoolSize,
    ttlMs,
    rememberContainer,
    dropCaptchas,
    warn,
  }) {
    this.command = command;
    this.hasSession = hasSession;
    this.buildProxy = buildProxy;
    this.proxyType = proxyType;
    this.timeoutMs = timeoutMs;
    this.maxPoolSize = maxPoolSize;
    this.ttlMs = ttlMs;
    this.rememberContainer = rememberContainer;
    this.dropCaptchas = dropCaptchas;
    this._warn = warn || (() => {});

    this._byOrigin = new Map();
    this._inUse = new Map();
    this.retired = new Set();
    this._born = new Map();
    this._hatching = new Map();
    this._leases = new Map();
  }

  _isExpired(id) {
    const born = this._born.get(id);
    return born !== undefined && Date.now() - born > this.ttlMs();
  }

  _busy(id) {
    return (this._inUse.get(id) || 0) > 0;
  }

  idleCount() {
    let count = 0;
    for (const id of new Set(this._byOrigin.values())) {
      if (!this._busy(id)) count += 1;
    }
    return count;
  }

  busyCount() {
    let count = 0;
    for (const id of new Set(this._byOrigin.values())) {
      if (this._busy(id)) count += 1;
    }
    return count;
  }

  size() {
    return new Set(this._byOrigin.values()).size;
  }

  clear() {
    this._byOrigin.clear();
    this._inUse.clear();
    this.retired.clear();
    this._born.clear();
    this._hatching.clear();
    this._leases.clear();
  }

  yerOldGetOuttaHere() {
    for (const id of this._byOrigin.values()) this.retired.add(id);
    this._byOrigin.clear();
  }

  retireContainer(id) {
    if (!id) return;
    for (const [origin, containerId] of [...this._byOrigin]) {
      if (containerId === id) this._byOrigin.delete(origin);
    }
    this.retired.add(id);
  }

  async banishContainer(id) {
    if (!id || !this.hasSession()) return;
    this.retired.delete(id);
    this._born.delete(id);
    this._inUse.delete(id);
    await this.dropCaptchas?.(id);
    await this.command("container_delete", { id: [id] }).catch(() => {});
  }

  async sweepRetiredContainers() {
    if (!this.retired.size) return;
    for (const id of [...this.retired]) {
      if (this._busy(id)) continue;
      await this.banishContainer(id);
    }
  }

  async hatchContainer() {
    const cr = await this.command("container_create");
    if (!cr?.id) {
      throw new Error("lolcat-4play: container_create did not return a container id");
    }

    this._born.set(cr.id, Date.now());
    this.rememberContainer?.(cr);

    if (this.proxyType() !== "none") {
      await this.command("container_attach_proxy", {
        id: cr.id,
        proxy: this.buildProxy(),
      });
    }

    return cr.id;
  }

  async _evictForCapacity(origin) {
    const max = this.maxPoolSize();
    while (this.size() >= max) {
      let victim = null;
      for (const [reservedOrigin, id] of this._byOrigin) {
        if (reservedOrigin !== origin && !this._busy(id)) {
          victim = { origin: reservedOrigin, id };
          break;
        }
      }
      if (!victim) return;
      this._warn(
        `evicting idle container for ${victim.origin} to free a slot for ${origin} (pool full at ${max})`,
      );
      this._byOrigin.delete(victim.origin);
      this.retired.add(victim.id);
      await this.banishContainer(victim.id);
    }
  }

  _hold(id) {
    this._inUse.set(id, (this._inUse.get(id) || 0) + 1);
    return id;
  }

  _usable(id) {
    return Boolean(id) && !this.retired.has(id) && !this._isExpired(id);
  }

  async _reserve(origin) {
    const reserved = origin ? this._byOrigin.get(origin) : null;
    if (this._usable(reserved)) return reserved;
    if (reserved) {
      this.retireContainer(reserved);
      await this.sweepRetiredContainers();
    }

    await this._evictForCapacity(origin);
    const id = await this.hatchContainer();
    if (origin) this._byOrigin.set(origin, id);
    return id;
  }

  async _reserveOnce(origin) {
    if (!origin) return this._reserve(origin);
    const pending = this._hatching.get(origin);
    if (pending) return pending;

    const hatching = this._reserve(origin).finally(() => {
      this._hatching.delete(origin);
    });
    this._hatching.set(origin, hatching);
    return hatching;
  }

  async _leaseFor(sessionKey, origin) {
    const leases = this._leases.get(sessionKey);
    const lease = leases?.get(origin);
    if (!lease) return null;
    if (!this.retired.has(lease.id)) {
      lease.at = Date.now();
      return lease.id;
    }
    leases.delete(origin);
    await this.tuckContainerIn(lease.id);
    return null;
  }

  async _recordLease(sessionKey, origin, id) {
    if (!this._leases.has(sessionKey)) this._leases.set(sessionKey, new Map());
    const leases = this._leases.get(sessionKey);
    const previous = leases.get(origin);
    if (previous?.id === id) return;

    leases.set(origin, { id, at: Date.now() });
    this._hold(id);
    if (previous) await this.tuckContainerIn(previous.id);
  }

  async summonContainer(origin, sessionKey = "") {
    await this.sweepRetiredContainers();
    this._expireLeases();

    const leased = sessionKey && origin ? await this._leaseFor(sessionKey, origin) : null;
    if (leased) return this._hold(leased);

    const id = await this._reserveOnce(origin);
    if (sessionKey && origin) await this._recordLease(sessionKey, origin, id);
    return this._hold(id);
  }

  async tuckContainerIn(containerId) {
    if (!containerId) return;
    const next = (this._inUse.get(containerId) || 0) - 1;
    this._inUse.set(containerId, next > 0 ? next : 0);

    if (!this._busy(containerId) && this._isExpired(containerId)) {
      this.retireContainer(containerId);
      await this.sweepRetiredContainers();
    }
  }

  async endSession(sessionKey) {
    const leases = this._leases.get(sessionKey);
    if (!leases) return;
    this._leases.delete(sessionKey);
    for (const { id } of leases.values()) {
      await this.tuckContainerIn(id);
    }
  }

  _expireLeases() {
    const cutoff = Date.now() - LEASE_TTL_MS;
    for (const [sessionKey, leases] of this._leases) {
      const stale = [...leases.values()].every((lease) => lease.at < cutoff);
      if (!stale) continue;
      this._warn(`releasing containers for session ${sessionKey.slice(0, 8)}; it never ended`);
      this.endSession(sessionKey).catch((error) => {
        this._warn(`failed to release stale session lease: ${error?.message || error}`);
      });
    }
  }
}
