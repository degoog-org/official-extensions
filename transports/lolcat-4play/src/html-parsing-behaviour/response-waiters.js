const decodeBody = (data = {}) => {
  const body = data.body;
  if (typeof body !== "string" || !body) return "";
  try {
    return Buffer.from(body, "base64").toString("utf8");
  } catch {
    return "";
  }
};

export class ResponseWaiters {
  constructor() {
    this._pending = new Map();
    this._latest = new Map();
  }

  settle(data = {}) {
    const tabId = typeof data?.id === "number" ? data.id : null;
    if (tabId === null) return;
    if (data.type && data.type !== "main_frame") return;

    const html = decodeBody(data);
    if (!html) return;

    const captured = { html, url: data.url || "", status: data.status ?? 0 };
    const waiter = this._pending.get(tabId);
    if (waiter) {
      clearTimeout(waiter.timer);
      this._pending.delete(tabId);
      waiter.resolve(captured);
      return;
    }
    this._latest.set(tabId, captured);
  }

  wait(tabId, timeoutMs) {
    if (typeof tabId !== "number") return Promise.resolve(null);

    const cached = this._latest.get(tabId);
    if (cached) {
      this._latest.delete(tabId);
      return Promise.resolve(cached);
    }

    const existing = this._pending.get(tabId);
    if (existing) {
      clearTimeout(existing.timer);
      this._pending.delete(tabId);
      existing.resolve(null);
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._pending.delete(tabId);
        resolve(null);
      }, timeoutMs);
      this._pending.set(tabId, { resolve, timer });
    });
  }

  forget(tabId) {
    if (typeof tabId !== "number") return;
    this._latest.delete(tabId);
    const waiter = this._pending.get(tabId);
    if (waiter) {
      clearTimeout(waiter.timer);
      this._pending.delete(tabId);
      waiter.resolve(null);
    }
  }

  drain() {
    for (const [tabId, waiter] of this._pending.entries()) {
      clearTimeout(waiter.timer);
      this._pending.delete(tabId);
      waiter.resolve(null);
    }
    this._latest.clear();
  }
}
