export class DomWaiters {
  constructor() {
    this._pending = new Map();
  }

  settle(msg) {
    const tabId = msg?.data?.id;
    const waiter = typeof tabId === "number" ? this._pending.get(tabId) : null;
    if (!waiter) return;

    clearTimeout(waiter.timer);
    this._pending.delete(tabId);
    if (msg.action === "dom_load_fail") {
      waiter.reject(new Error("lolcat-4play: warmup page failed to load"));
      return;
    }
    waiter.resolve(msg.data);
  }

  wait(tabId, timeoutMs) {
    if (typeof tabId !== "number") return Promise.resolve(null);
    const existing = this._pending.get(tabId);
    if (existing) {
      clearTimeout(existing.timer);
      this._pending.delete(tabId);
      existing.resolve(null);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(tabId);
        resolve(null);
      }, timeoutMs);
      this._pending.set(tabId, { resolve, reject, timer });
    });
  }

  drain(reason) {
    const error = new Error(reason);
    for (const [tabId, waiter] of this._pending.entries()) {
      clearTimeout(waiter.timer);
      this._pending.delete(tabId);
      waiter.reject(error);
    }
  }
}
