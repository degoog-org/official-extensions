import { originFor } from "../util/url.js";
import { seedCookieJarFromHeaders } from "../net/curl-impersonate.js";

const now = () => Date.now();

export class SessionRegistry {
  constructor({ cleanTtlMs, degradedTtlMs, warn }) {
    this._cleanTtlMs = cleanTtlMs;
    this._degradedTtlMs = degradedTtlMs;
    this._warn = warn;
    this._memory = new Map();
    this._cache = null;
  }

  bindCache(cache) {
    this._cache = cache;
  }

  clearMemory() {
    this._memory.clear();
  }

  key(origin, containerId = null) {
    return `${origin}::${containerId || "default"}`;
  }

  entry(origin, containerId = null) {
    return this._memory.get(this.key(origin, containerId)) || null;
  }

  usable(origin, containerId = null) {
    const entry = this.entry(origin, containerId);
    if (!entry) return null;
    if (entry.state !== "warm" && entry.state !== "degraded") return null;
    const hasReplayMaterial = (Array.isArray(entry.headers) && entry.headers.length > 0) || Boolean(entry.cookieJarText);
    if (!hasReplayMaterial) return null;
    const ttl = entry.state === "degraded" ? this._degradedTtlMs() : this._cleanTtlMs();
    if (entry.updatedAt + ttl < now()) {
      this.markRetired(origin, containerId, "ttl expired");
      return null;
    }
    return entry;
  }

  markWarming(origin, containerId = null) {
    this._set(origin, containerId, { state: "warming" });
  }

  markWarmed(origin, containerId = null, details = {}) {
    this._set(origin, containerId, { state: "warm", ...details });
  }

  markDegraded(origin, containerId = null, reason = "degraded", details = {}) {
    this._set(origin, containerId, { state: "degraded", reason, ...details });
  }

  markCaptcha(origin, containerId = null, reason = "captcha", details = {}) {
    this._set(origin, containerId, { state: "captcha", reason, ...details });
  }

  markRetired(origin, containerId = null, reason = "retired") {
    this._set(origin, containerId, { state: "retired", reason });
  }

  captureRequest(data = {}, ownedTabs, tabContainers) {
    if (typeof data.id !== "number" || !ownedTabs.has(data.id)) return;
    const origin = originFor(data.url);
    if (!origin) return;
    const containerId = tabContainers.get(data.id) || data.container || null;
    const jar = seedCookieJarFromHeaders(origin, data.headers || []);
    const current = this.entry(origin, containerId) || {};
    const headers = data.type === "main_frame" || !current.headers ? data.headers : current.headers;
    this.markWarmed(origin, containerId, { headers, cookieJarText: jar || current.cookieJarText || null, capturedUrl: data.url });
  }

  all() {
    return [...this._memory.values()];
  }

  byOrigin(origin) {
    return this.all().filter((entry) => entry.origin === origin);
  }

  clearOrigin(origin) {
    for (const key of [...this._memory.keys()]) {
      if (key.startsWith(`${origin}::`)) this._memory.delete(key);
    }
  }

  _set(origin, containerId = null, patch = {}) {
    if (!origin) return null;
    const key = this.key(origin, containerId);
    const current = this._memory.get(key) || { origin, containerId, createdAt: now() };
    const entry = { ...current, ...patch, origin, containerId, updatedAt: now() };
    this._memory.set(key, entry);
    return entry;
  }
}
