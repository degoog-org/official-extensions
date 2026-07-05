import { ContainerPool } from "./src/container-pool.js";
import { DomWaiters } from "./src/dom-waiters.js";
import { SessionStore } from "./src/session-store.js";
import { WarmupDriver } from "./src/warmup-driver.js";
import { tabSpell } from "./src/browser.js";
import {
  cookieJarFromCookieHeader,
  curlFetchWithBrowserHeaders,
  emptyCookieJar,
  proxyUrlFromSettings,
  resolveCurlBinary,
} from "./src/curl-session.js";
import { solveChallenge } from "./src/flaresolverr.js";
import { OriginBlockedError, looksBlocked, sleep } from "./src/origin-warmup.js";
import { wrapResponse } from "./src/response.js";
import {
  FETCH_TIMEOUT_MS,
  containerConfigKey,
  normaliseSettings,
  settingsSchemaFor,
  DEFAULT_CONTAINER_TTL_H,
} from "./src/settings.js";

const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
const CONTROL_TTL_MS = 60 * 1000;
const CONTROL_POLL_MS = 3000;

export default class FourPlayTransport {
  isClientExposed = true;
  name = "lolcat-4play";
  displayName = "4play (lolcat)";
  description =
    "Fetches pages using a real Firefox session via the official [lolcat 4play](https://addons.mozilla.org/en-GB/firefox/addon/4play/) browser extension. Point the extension at this transport's WebSocket address instead of a separate server.";
  needsAppRestart = true;

  _password = "";
  _timeoutMs = 30000;
  _useContainer = false;
  _proxyType = "none";
  _proxyHost = "";
  _proxyPort = 1080;
  _proxyUsername = "";
  _proxyPassword = "";
  _proxyDns = true;
  _flaresolverrUrl = "";
  _flaresolverrTimeoutMs = 60000;
  _session = null;
  _containerConfigKey = "";
  _maxPoolSize = 5;
  _containerTtlMs = DEFAULT_CONTAINER_TTL_H * 60 * 60 * 1000;
  _warmupQuery = "weather";
  _warmupTtlMs = 60 * 60 * 1000;
  _blockCooldownMs = 20 * 60 * 1000;
  _warmupSettleMs = 1500;
  _autoWarmMs = 0;
  _autoWarmTimer = null;
  _sessionId = Math.random().toString(36).slice(2, 8);
  _seenOrigins = new Set();
  _statusCache = null;
  _controlCache = null;
  _controlTimer = null;
  _lastControlId = null;
  _cachesBound = false;

  _dom = new DomWaiters();
  _ownedTabIds = new Set();
  _captchaTabIds = new Set();

  _store = new SessionStore({
    configKey: () => this._containerConfigKey,
    warmupTtlMs: () => this._warmupTtlMs,
    ownedTabIds: this._ownedTabIds,
    log: (msg) => this._warn(msg),
  });

  _containers = new ContainerPool({
    command: (action, params, timeoutMs) =>
      this._cmd(action, params, timeoutMs),
    hasSession: () => Boolean(this._session),
    buildProxy: () => this._dressProxy(),
    proxyType: () => this._proxyType,
    timeoutMs: () => this._timeoutMs,
    maxPoolSize: () => this._maxPoolSize,
    ttlMs: () => this._containerTtlMs,
  });

  _warmer = new WarmupDriver({
    cmd: (action, params, timeoutMs) => this._cmd(action, params, timeoutMs),
    inject: (tabId, js, timeoutMs) => this._inject(tabId, js, timeoutMs),
    awaitDom: (tabId, timeoutMs) => this._awaitDom(tabId, timeoutMs),
    closeTabQuietly: (tabId) => this._closeTabQuietly(tabId),
    store: this._store,
    retireContainer: (containerId) => this._containers.retireContainer(containerId),
    ownedTabIds: this._ownedTabIds,
    captchaTabIds: this._captchaTabIds,
    seenOrigins: this._seenOrigins,
    warn: (msg) => this._warn(msg),
    timeoutMs: () => this._timeoutMs,
    warmupQuery: () => this._warmupQuery,
    warmupTtlMs: () => this._warmupTtlMs,
    blockCooldownMs: () => this._blockCooldownMs,
    settleMs: () => this._warmupSettleMs,
  });

  get settingsSchema() {
    return settingsSchemaFor(this.name);
  }

  wsHandler = {
    onUpgrade: (passwordPath) => passwordPath === `/${this._password}`,

    onOpen: () => {
      this._warn(
        `browser extension connected (transport name=${this.name}, status namespace=transport:${this.name}:status)`,
      );
      this._startHeartbeat();
      this._startAutoWarm();
      this._startControlPoll();
      this._publishStatus();
      this._cmd("web_response_whitelist", { list: [] }).catch(() => {});
    },

    onMessage: (_ws, raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg?.action === "dom_ready" || msg?.action === "dom_load_fail") {
        this._dom.settle(msg);
        return;
      }

      if (msg?.action === "web_request") {
        this._store.rememberBrowserHeaders(msg.data);
      }
    },

    onClose: () => {
      this._warn("browser extension disconnected; clearing in-memory sessions");
      this._stopHeartbeat();
      this._stopAutoWarm();
      this._stopControlPoll();
      this._containers.clear();
      this._store.clearMemory();
      this._ownedTabIds.clear();
      this._captchaTabIds.clear();
      this._dom.drain("lolcat-4play: browser extension disconnected");
      this._publishStatus();
    },
  };

  bindWsSession(session) {
    this._session = session;
  }

  configure(settings = {}) {
    const oldKey = this._containerConfigKey;
    const next = normaliseSettings(settings);

    this._timeoutMs = next.timeoutMs;
    this._maxPoolSize = next.maxPoolSize;
    this._containerTtlMs = next.containerTtlMs;
    this._useContainer = next.useContainer;
    this._proxyType = next.proxyType;
    this._proxyHost = next.proxyHost;
    this._proxyPort = next.proxyPort;
    this._proxyUsername = next.proxyUsername;
    this._proxyPassword = next.proxyPassword;
    this._proxyDns = next.proxyDns;
    this._flaresolverrUrl = next.flaresolverrUrl;
    this._flaresolverrTimeoutMs = next.flaresolverrTimeoutMs;
    this._password = next.password;
    this._warmupQuery = next.warmupQuery;
    this._warmupTtlMs = next.warmupTtlMs;
    this._blockCooldownMs = next.blockCooldownMs;
    this._warmupSettleMs = next.warmupSettleMs;
    this._autoWarmMs = next.autoWarmMs;
    this._containerConfigKey = containerConfigKey(next);

    if (oldKey && oldKey !== this._containerConfigKey) {
      this._containers.yerOldGetOuttaHere();
      this._store.clearMemory();
    }

    if (this._session?.connected()) this._startAutoWarm();
  }

  available() {
    return this._session?.connected() === true;
  }

  _warn(msg) {
    console.warn(`[lolcat-4play sesh=${this._sessionId}] ${msg}`);
  }

  _cmd(action, params = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    if (!this._session) {
      return Promise.reject(
        new Error("lolcat-4play: transport session not initialized"),
      );
    }
    return this._session.cmd(action, params, timeoutMs);
  }

  _dressProxy() {
    const proxy = {
      type: this._proxyType === "socks5" ? "socks" : this._proxyType,
      host: this._proxyHost,
      port: this._proxyPort,
      proxyDNS: this._proxyDns,
    };
    if (this._proxyUsername) proxy.username = this._proxyUsername;
    if (this._proxyPassword) proxy.password = this._proxyPassword;
    return proxy;
  }

  async _closeTabQuietly(tabId) {
    if (typeof tabId !== "number") return;
    await this._cmd("tab_close", { tabid: [tabId] }).catch(() => {});
  }

  async _clearCaptchaTabs() {
    if (!this._captchaTabIds.size) return;
    const ids = [...this._captchaTabIds];
    this._captchaTabIds.clear();
    for (const id of ids) {
      this._ownedTabIds.delete(id);
      await this._closeTabQuietly(id);
    }
  }

  _awaitDom(tabId, timeoutMs = this._timeoutMs) {
    return this._dom.wait(tabId, Math.min(timeoutMs, this._timeoutMs));
  }

  async _inject(tabId, js, timeoutMs = this._timeoutMs) {
    const result = await this._cmd(
      "tab_inject_js",
      { tabid: tabId, js },
      timeoutMs,
    );
    if (result?.status !== true) return null;
    const frameResult = Array.isArray(result.result) ? result.result[0] : null;
    return frameResult?.result ?? null;
  }

  _wrapFetchedText(text, origin, containerId, url = "", tabId = null) {
    if (origin && looksBlocked(text, url)) {
      this._warmer.markBlocked(origin, containerId, "response block/captcha", tabId);
      throw new OriginBlockedError(origin, "response block/captcha", tabId);
    }
    return wrapResponse(text);
  }

  _curlProxyUrl() {
    return proxyUrlFromSettings({
      type: this._proxyType,
      host: this._proxyHost,
      port: this._proxyPort,
      username: this._proxyUsername,
      password: this._proxyPassword,
      proxyDns: this._proxyDns,
    });
  }

  async _solveWithFlare(url, origin, containerId) {
    if (!this._flaresolverrUrl) return null;

    try {
      const solution = await solveChallenge({
        endpoint: this._flaresolverrUrl,
        url,
        timeoutMs: this._flaresolverrTimeoutMs,
        proxyUrl: this._curlProxyUrl(),
      });

      if (!solution?.html || looksBlocked(solution.html, url)) {
        this._warn(
          `FlareSolverr could not clear the challenge for ${origin}; falling back to manual tab`,
        );
        return null;
      }

      if (solution.cookieHeader) {
        const jar = cookieJarFromCookieHeader(origin, solution.cookieHeader);
        const session = this._store.headerSession(origin, containerId);
        if (session) session.cookieJarText = jar;
        this._store.persistCookieJar(origin, containerId, jar, session?.headers || null);
      }
      this._store.setWarmupState(origin, containerId, { warmedAt: Date.now() });

      this._warn(`FlareSolverr cleared the challenge for ${origin}`);
      return wrapResponse(solution.html);
    } catch (error) {
      this._warn(
        `FlareSolverr request failed for ${origin}: ${error?.message || error}; falling back to manual tab`,
      );
      return null;
    }
  }

  async _curlFetchWarmed(url, origin, containerId) {
    const session = this._store.usableHeaderSession(origin, containerId);
    if (!session || !(await resolveCurlBinary())) return null;

    const cookieJarText =
      (await this._store.loadCookieJar(origin, containerId)) ||
      session.cookieJarText ||
      emptyCookieJar();

    try {
      const response = await curlFetchWithBrowserHeaders({
        url,
        headers: session.headers,
        timeoutSeconds: this._timeoutMs / 1000,
        cookieJarText,
        onCookieJarText: (updated) => {
          session.cookieJarText = updated;
          this._store.persistCookieJar(origin, containerId, updated);
        },
        proxyUrl: this._curlProxyUrl(),
      });
      const text = await response.text();

      if (origin && looksBlocked(text, url)) {
        const solved = await this._solveWithFlare(url, origin, containerId);
        if (solved) return solved;
        this._warn(
          `warmed curl fetch for ${origin} looks blocked (IP/fingerprint challenge); falling back to the live browser session`,
        );
        return null;
      }
      return wrapResponse(text);
    } catch (error) {
      this._warn(
        `warmed curl fetch failed for ${origin}: ${error?.message || error}; falling back to browser tab`,
      );
      return null;
    }
  }

  async _browserFetch(url, origin, containerId) {
    this._warn(
      `direct browser tab fetch for ${url} (container=${containerId || "default"}): no warmed curl session for this origin, fetching DOM outerHTML via tab injection`,
    );
    let tabId = null;
    let keepTabOpen = false;

    try {
      const tabResp = await this._cmd("tab_open", tabSpell(url, containerId));
      tabId = tabResp?.data?.id;
      if (typeof tabId !== "number") {
        throw new Error("lolcat-4play: tab_open did not return a valid tab id");
      }

      this._ownedTabIds.add(tabId);

      await this._awaitDom(tabId, this._timeoutMs).catch(() => null);
      await sleep(1000);

      const html = await this._inject(tabId, "document.documentElement.outerHTML");
      if (!html) {
        throw new Error("lolcat-4play: failed to retrieve page HTML content from browser tab");
      }

      try {
        return this._wrapFetchedText(html, origin, containerId, url, tabId);
      } catch (error) {
        if (error instanceof OriginBlockedError) {
          const solved = await this._solveWithFlare(url, origin, containerId);
          if (solved) return solved;
          keepTabOpen = true;
          if (typeof tabId === "number") {
            this._captchaTabIds.add(tabId);
          }
        }
        throw error;
      }
    } finally {
      if (!keepTabOpen) {
        await this._closeTabQuietly(tabId);
        this._ownedTabIds.delete(tabId);
      }
    }
  }

  _bindCaches(context) {
    if (this._cachesBound || !context.useCache) return;
    this._cachesBound = true;
    this._store.bindCache(
      context.useCache(`transport:${this.name}:cookies`, this._warmupTtlMs),
    );
    this._statusCache = context.useCache(
      `transport:${this.name}:status`,
      STATUS_TTL_MS,
    );
    this._controlCache = context.useCache(
      `transport:${this.name}:control`,
      CONTROL_TTL_MS,
    );
    this._warn(
      `caches bound on first fetch; publishing status under transport:${this.name}:status`,
    );
    this._rehydrate().catch((error) => {
      this._warn(`session rehydration failed: ${error?.message || error}`);
    });
  }

  async _rehydrate() {
    const origins = await this._store.loadOrigins();
    if (!origins.length) return;
    for (const origin of origins) {
      this._seenOrigins.add(origin);
      await this._store.loadSessionFromCache(origin, null);
    }
    this._warn(
      `rehydrated ${origins.length} tracked origin(s) from cache after startup`,
    );
    this._publishStatus();
  }

  async _fetchOnce(url, options = {}, context = {}) {
    this._bindCaches(context);

    await this._containers.sweepRetiredContainers();

    const useContainer = this._proxyType !== "none" || this._useContainer;
    let containerId = null;
    let hitBlock = false;

    try {
      if (useContainer) {
        containerId = await this._containers.summonContainer();
      }

      const origin = await this._warmer.ensureWarm(url, containerId);
      const res = (
        (await this._curlFetchWarmed(url, origin, containerId)) ??
        (await this._browserFetch(url, origin, containerId))
      );
      this._clearCaptchaTabs().catch(() => {});
      return res;
    } catch (error) {
      if (error instanceof OriginBlockedError) {
        hitBlock = true;
      }
      throw error;
    } finally {
      await this._containers.tuckContainerIn(containerId, useContainer, hitBlock);
      this._publishStatus();
    }
  }

  async fetch(url, options = {}, context = {}) {
    try {
      return await this._fetchOnce(url, options, context);
    } catch (error) {
      const canRetry =
        error instanceof OriginBlockedError &&
        (this._proxyType !== "none" || this._useContainer);
      if (!canRetry) throw error;
      const retryTab = typeof error.tabId === "number" ? error.tabId : "unknown";
      this._warn(
        `retrying ${error.origin} with a fresh container after block detection (tab=${retryTab})`,
      );
      return this._fetchOnce(url, options, context);
    }
  }

  _buildStatus() {
    const now = Date.now();
    const sessions = [...this._store.sessionKeys()]
      .map((key) => this._store.sessionEntry(key, now))
      .sort((a, b) => a.origin.localeCompare(b.origin));

    return {
      connected: this.available(),
      sessions,
      containers: {
        idle: this._containers.pool.length,
        leased: this._containers.leased.size,
        max: this._maxPoolSize,
      },
      captchaTabs: this._captchaTabIds.size,
      autoWarm: {
        intervalMs: this._autoWarmMs,
        tracked: [...this._seenOrigins],
      },
      updatedAt: now,
    };
  }

  _publishStatus() {
    if (!this._statusCache) return;
    this._statusCache
      .set("current", this._buildStatus(), STATUS_TTL_MS)
      .catch(() => {});
  }

  async _clearAllSessions() {
    this._warn("clearing all warmed sessions and retiring containers");
    this._store.clearAll();
    this._seenOrigins.clear();
    this._containers.yerOldGetOuttaHere();
    await this._containers.sweepRetiredContainers();
    this._publishStatus();
  }

  async _clearSessionByKey(key) {
    const memKey = this._store.clearKey(key);
    if (!memKey) return;
    this._warn(`cleared warmed session ${key.split("\n").pop()} (container=${memKey})`);
    if (memKey !== "default" && memKey !== this._containerConfigKey) {
      this._containers.retireContainer(memKey);
      await this._containers.sweepRetiredContainers();
    }
    this._publishStatus();
  }

  _startControlPoll() {
    this._stopControlPoll();
    this._controlTimer = setInterval(() => {
      this._controlTick().catch(() => {});
    }, CONTROL_POLL_MS);
  }

  _stopControlPoll() {
    if (this._controlTimer) {
      clearInterval(this._controlTimer);
      this._controlTimer = null;
    }
  }

  async _controlTick() {
    if (!this._controlCache) return;
    const request = await this._controlCache.get("request").catch(() => null);
    if (!request?.id || request.id === this._lastControlId) return;
    this._lastControlId = request.id;

    if (request.scope === "all") {
      await this._clearAllSessions();
      return;
    }
    if (request.scope === "session" && typeof request.key === "string") {
      await this._clearSessionByKey(request.key);
    }
  }

  _startAutoWarm() {
    this._stopAutoWarm();
    if (!this._autoWarmMs) return;
    this._autoWarmTimer = setInterval(() => {
      this._autoWarmTick().catch(() => {});
    }, this._autoWarmMs);
  }

  _stopAutoWarm() {
    if (this._autoWarmTimer) {
      clearInterval(this._autoWarmTimer);
      this._autoWarmTimer = null;
    }
  }

  async _autoWarmTick() {
    if (!this._session?.connected() || !this._seenOrigins.size) return;
    const origins = [...this._seenOrigins];
    this._warn(`background warmup sweeping ${origins.length} origin(s)`);
    for (const origin of origins) {
      await this._autoWarmOrigin(origin).catch(() => {});
    }
    this._publishStatus();
  }

  async _autoWarmOrigin(origin) {
    await this._containers.sweepRetiredContainers();
    const useContainer = this._proxyType !== "none" || this._useContainer;
    let containerId = null;
    let hitBlock = false;
    try {
      if (useContainer) containerId = await this._containers.summonContainer();
      await this._warmer.ensureWarm(`${origin}/`, containerId);
    } catch (error) {
      if (error instanceof OriginBlockedError) hitBlock = true;
    } finally {
      await this._containers.tuckContainerIn(containerId, useContainer, hitBlock);
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this._session?.browser) {
        try {
          this._session.browser.send(JSON.stringify({ action: "ping" }));
        } catch {
          return;
        }
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }
}
