export class ContainerPool {
  constructor({ command, hasSession, buildProxy, proxyType, timeoutMs, maxPoolSize, ttlMs }) {
    this.command = command;
    this.hasSession = hasSession;
    this.buildProxy = buildProxy;
    this.proxyType = proxyType;
    this.timeoutMs = timeoutMs;
    this.maxPoolSize = maxPoolSize;
    this.ttlMs = ttlMs;

    this.pool = [];
    this.leased = new Set();
    this.retired = new Set();
    this.waiters = [];
    this._born = new Map();
  }

  _isExpired(id) {
    const ttl = this.ttlMs();
    const born = this._born.get(id);
    return born !== undefined && Date.now() - born > ttl;
  }

  clear(message = "lolcat-4play: browser extension disconnected") {
    this.pool = [];
    this.leased.clear();
    this.retired.clear();
    this._born.clear();
    this.rejectWaiters(message);
  }

  rejectWaiters(message) {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(message));
    }
  }

  yerOldGetOuttaHere() {
    for (const id of this.pool) this.retired.add(id);
    for (const id of this.leased) this.retired.add(id);
    this.pool = [];
    this.rejectWaiters("lolcat-4play: container settings changed while waiting");
  }

  retireContainer(id) {
    if (id) this.retired.add(id);
  }

  async banishContainer(id) {
    if (!id || !this.hasSession()) return;
    this.retired.delete(id);
    this._born.delete(id);
    await this.command("container_delete", { id: [id] }).catch(() => { });
  }

  async sweepRetiredContainers() {
    if (!this.retired.size) return;
    const retiredNow = [...this.retired].filter((id) => !this.leased.has(id));
    for (const id of retiredNow) {
      this.pool = this.pool.filter((pooledId) => pooledId !== id);
      await this.banishContainer(id);
    }
  }

  async hatchContainer() {
    const cr = await this.command("container_create");
    if (!cr?.id) {
      throw new Error("lolcat-4play: container_create did not return a container id");
    }

    this._born.set(cr.id, Date.now());

    if (this.proxyType() !== "none") {
      await this.command("container_attach_proxy", {
        id: cr.id,
        proxy: this.buildProxy(),
      });
    }

    return cr.id;
  }

  borrowContainer(containerId) {
    this.leased.add(containerId);
    return containerId;
  }

  async summonContainer() {
    await this.sweepRetiredContainers();

    const pooled = this.pool.shift();
    if (pooled) {
      if (this._isExpired(pooled)) {
        this.retired.add(pooled);
      } else {
        return this.borrowContainer(pooled);
      }
    }

    const knownCount = this.pool.length + this.leased.size;
    if (knownCount < this.maxPoolSize()) {
      return this.borrowContainer(await this.hatchContainer());
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.resolve !== resolve);
        reject(new Error("lolcat-4play: timed out waiting for an available browser container"));
      }, this.timeoutMs());
      this.waiters.push({ resolve, reject, timer });
    });
  }

  async passContainerToNextWaiter() {
    const waiter = this.waiters.shift();
    if (!waiter) return false;

    clearTimeout(waiter.timer);
    try {
      waiter.resolve(this.borrowContainer(await this.hatchContainer()));
    } catch (error) {
      waiter.reject(error);
    }
    return true;
  }

  async tuckContainerIn(containerId, keepWarm, hitBlock = false) {
    if (!containerId) return;
    this.leased.delete(containerId);

    const shouldDelete = !keepWarm || this.retired.has(containerId) || !this.hasSession() || this._isExpired(containerId);
    if (shouldDelete) {
      if (hitBlock) {
        this.retired.delete(containerId);
        // Put the blocked container back in the pool so that we reuse it next time.
        // This allows the user to solve the CAPTCHA inside this container's tab and reuse the session.
        if (this.pool.length < this.maxPoolSize() && !this.pool.includes(containerId)) {
          this.pool.push(containerId);
        }
        await this.passContainerToNextWaiter();
        return;
      }
      await this.banishContainer(containerId);
      await this.passContainerToNextWaiter();
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(this.borrowContainer(containerId));
      return;
    }

    if (this.pool.length < this.maxPoolSize()) {
      this.pool.push(containerId);
      return;
    }

    await this.banishContainer(containerId);
  }
}
