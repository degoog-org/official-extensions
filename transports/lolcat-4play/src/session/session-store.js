import { cookieJarKeyFor, seedCookieJarTextFromHeaders } from "../net/curl-session.js";
import { originFor, warmupKeyFor } from "../warmup/origin-warmup.js";

const ORIGINS_KEY = "__origins";
const ORIGINS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class SessionStore {
  constructor({ configKey, warmupTtlMs, ownedTabIds, tabContainerIds, log }) {
    this._configKey = configKey;
    this._warmupTtlMs = warmupTtlMs;
    this._ownedTabIds = ownedTabIds;
    this._tabContainerIds = tabContainerIds;
    this._log = log;
    this._warmups = new Map();
    this._headerSessions = new Map();
    this._cookieJarTexts = new Map();
    this._cookieCache = null;
  }

  bindCache(cache) {
    if (!this._cookieCache) this._cookieCache = cache;
  }

  memKey(containerId) {
    return containerId || this._configKey() || "default";
  }

  cacheKey(containerId = null) {
    return containerId || this._configKey() || "default";
  }

  warmupState(origin, containerId) {
    return this._warmups.get(warmupKeyFor(origin, this.memKey(containerId)));
  }

  setWarmupState(origin, containerId, state) {
    this._warmups.set(warmupKeyFor(origin, this.memKey(containerId)), state);
  }

  dropWarmup(origin, containerId) {
    this._warmups.delete(warmupKeyFor(origin, this.memKey(containerId)));
  }

  headerSession(origin, containerId) {
    return this._headerSessions.get(warmupKeyFor(origin, this.memKey(containerId)));
  }

  usableHeaderSession(origin, containerId) {
    const session = this.headerSession(origin, containerId);
    if (!session?.headers?.length) return null;
    if (Date.now() - session.capturedAt > this._warmupTtlMs()) {
      this._log(
        `${origin} session expired (container=${containerId || "default"}, age=${Math.round((Date.now() - session.capturedAt) / 1000)}s); will rewarm`,
      );
      return null;
    }
    return session;
  }

  persistCookieJar(origin, containerId, cookieJarText, headers = null) {
    const memKey = cookieJarKeyFor(origin, this.memKey(containerId));
    const cacheKey = cookieJarKeyFor(origin, this.cacheKey(containerId));
    this._cookieJarTexts.set(memKey, cookieJarText);
    this._cookieCache
      ?.set(cacheKey, cookieJarText, this._warmupTtlMs())
      .catch((error) => {
        this._log(`failed to persist cookie jar for ${origin}: ${error?.message || error}`);
      });
    if (headers && this._cookieCache) {
      this._cookieCache
        .set(cacheKey + ":headers", JSON.stringify(headers), this._warmupTtlMs())
        .catch((error) => {
          this._log(`failed to persist headers for ${origin}: ${error?.message || error}`);
        });
    }
  }

  async loadCookieJar(origin, containerId) {
    const memKey = cookieJarKeyFor(origin, this.memKey(containerId));
    const cacheKey = cookieJarKeyFor(origin, this.cacheKey(containerId));
    if (this._cookieCache) {
      try {
        const cached = await this._cookieCache.get(cacheKey);
        if (cached) return cached;
      } catch (error) {
        this._log(`failed to read cookie jar for ${origin}: ${error?.message || error}`);
      }
    }
    return this._cookieJarTexts.get(memKey) || null;
  }

  async loadSessionFromCache(origin, containerId) {
    const cacheKey = cookieJarKeyFor(origin, this.cacheKey(containerId));
    const warmupKey = warmupKeyFor(origin, this.memKey(containerId));
    if (this._headerSessions.has(warmupKey)) return;
    if (!this._cookieCache) return;

    try {
      const cachedCookies = await this._cookieCache.get(cacheKey);
      const cachedHeadersJson = await this._cookieCache.get(cacheKey + ":headers");
      if (cachedCookies && cachedHeadersJson) {
        const headers = JSON.parse(cachedHeadersJson);
        this._headerSessions.set(warmupKey, {
          headers,
          url: origin,
          cookieJarText: cachedCookies,
          capturedAt: Date.now(),
        });
        this.setWarmupState(origin, containerId, { warmedAt: Date.now() });
        this._log(
          `restored warmed session for ${origin} from Valkey cache (skipped browser warmup)`,
        );
      }
    } catch (error) {
      this._log(
        `failed to restore warmed session from cache for ${origin}: ${error?.message || error}`,
      );
    }
  }

  rememberBrowserHeaders(data = {}) {
    if (typeof data.id !== "number" || !this._ownedTabIds.has(data.id)) return;
    if (data.type && data.type !== "main_frame") return;
    const origin = originFor(data.url);
    if (!origin) return;

    const containerId = data.container || this._tabContainerIds.get(data.id) || null;
    const cookieJarText = seedCookieJarTextFromHeaders(origin, data.headers);
    if (cookieJarText) {
      this.persistCookieJar(origin, containerId, cookieJarText);
    }

    const warmupKey = warmupKeyFor(origin, this.memKey(containerId));
    const previous = this._headerSessions.get(warmupKey);
    const session = {
      headers: data.headers,
      url: data.url,
      cookieJarText: cookieJarText || previous?.cookieJarText || null,
      capturedAt: Date.now(),
    };
    this._headerSessions.set(warmupKey, session);
    if (session.cookieJarText) {
      this.persistCookieJar(origin, containerId, session.cookieJarText, session.headers);
    }

    const state = this.warmupState(origin, containerId);
    if (!state?.warmedAt || state?.blockedUntil) {
      this.setWarmupState(origin, containerId, { warmedAt: Date.now() });
      this._log(
        `warmed ${origin} via captured main_frame request (container=${containerId || "default"}, url=${data.url})`,
      );
    }
  }

  persistOrigins(origins) {
    this._cookieCache
      ?.set(ORIGINS_KEY, JSON.stringify(origins), ORIGINS_TTL_MS)
      .catch((error) => {
        this._log(`failed to persist tracked origins: ${error?.message || error}`);
      });
  }

  async loadOrigins() {
    if (!this._cookieCache) return [];
    try {
      const raw = await this._cookieCache.get(ORIGINS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((o) => typeof o === "string") : [];
    } catch (error) {
      this._log(`failed to load tracked origins: ${error?.message || error}`);
      return [];
    }
  }

  sessionKeys() {
    return new Set([...this._headerSessions.keys(), ...this._warmups.keys()]);
  }

  sessionEntry(key, now) {
    const [memKey, origin] = key.split("\n");
    const session = this._headerSessions.get(key);
    const warm = this._warmups.get(key);
    const blocked = warm?.blockedUntil > now;
    const capturedAt = session?.capturedAt ?? warm?.warmedAt ?? null;
    const ageMs = capturedAt ? now - capturedAt : null;
    const ttlMs = this._warmupTtlMs();
    const container =
      memKey && memKey !== "default" && memKey !== this._configKey() ? memKey : null;
    return {
      key,
      origin: origin || key,
      container,
      ageMs,
      ttlMs,
      expiresInMs: ageMs === null ? null : Math.max(0, ttlMs - ageMs),
      blocked,
      cooldownLeftMs: blocked ? warm.blockedUntil - now : 0,
      reason: blocked ? warm.reason || "blocked" : null,
      alive: Boolean(session?.headers?.length) && !blocked && ageMs !== null && ageMs < ttlMs,
    };
  }

  clearMemory() {
    this._warmups.clear();
    this._headerSessions.clear();
    this._cookieJarTexts.clear();
  }

  clearAll() {
    this.clearMemory();
    this._cookieCache?.clear().catch((error) => {
      this._log(`failed to clear cookie cache: ${error?.message || error}`);
    });
  }

  clearKey(key) {
    const [memKey, origin] = key.split("\n");
    if (!origin) return null;
    this._warmups.delete(key);
    this._headerSessions.delete(key);
    this._cookieJarTexts.delete(`${memKey}:${origin}`);
    const cacheKey = cookieJarKeyFor(origin, memKey);
    this._cookieCache?.delete(cacheKey).catch(() => {});
    this._cookieCache?.delete(cacheKey + ":headers").catch(() => {});
    return memKey;
  }
}
