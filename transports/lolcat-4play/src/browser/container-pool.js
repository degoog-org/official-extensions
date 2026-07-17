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
  }

  yerOldGetOuttaHere() {
    for (const id of this._byOrigin.values()) this.retired.add(id);
    this._byOrigin.clear();
    this._inUse.clear();
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

  async summonContainer(origin) {
    await this.sweepRetiredContainers();

    const reserved = origin ? this._byOrigin.get(origin) : null;
    if (reserved && !this.retired.has(reserved) && !this._isExpired(reserved)) {
      this._inUse.set(reserved, (this._inUse.get(reserved) || 0) + 1);
      return reserved;
    }
    if (reserved) {
      this.retireContainer(reserved);
      await this.sweepRetiredContainers();
    }

    await this._evictForCapacity(origin);

    const id = await this.hatchContainer();
    if (origin) this._byOrigin.set(origin, id);
    this._inUse.set(id, 1);
    return id;
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
}
