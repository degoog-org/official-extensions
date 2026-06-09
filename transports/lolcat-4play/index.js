import { ContainerPool } from "./src/container-pool.js";
import { tabSpell } from "./src/browser.js";
import {
  curlFetchWithBrowserHeaders,
  proxyUrlFromSettings,
  resolveCurlBinary,
  seedCookieJarFromHeaders,
} from "./src/curl-session.js";
import {
  OriginBlockedError,
  inspectPageJs,
  looksBlocked,
  originFor,
  sleep,
  warmupKeyFor,
  warmupSearchJs,
} from "./src/origin-warmup.js";
import { wrapResponse } from "./src/response.js";
import {
  FETCH_TIMEOUT_MS,
  containerConfigKey,
  normaliseSettings,
  settingsSchemaFor,
  DEFAULT_CONTAINER_TTL_H,
} from "./src/settings.js";

const WEB_RESPONSE_TYPES = ["main_frame", "xmlhttprequest"];

export default class FourPlayTransport {
  isClientExposed = true;
  name = "lolcat-4play";
  displayName = "4play (lolcat)";
  description =
    "Fetches pages using a real Firefox session via the official [lolcat 4play](https://git.lolcat.ca/lolcat/4play) browser extension. Point the extension at this transport's WebSocket address instead of a separate server.";

  _password = "";
  _timeoutMs = 30000;
  _useContainer = false;
  _proxyType = "none";
  _proxyHost = "";
  _proxyPort = 1080;
  _proxyUsername = "";
  _proxyPassword = "";
  _proxyDns = true;
  _session = null;
  _containerConfigKey = "";
  _maxPoolSize = 5;
  _containerTtlMs = DEFAULT_CONTAINER_TTL_H * 60 * 60 * 1000;
  _warmupQuery = "weather";
  _warmupTtlMs = 60 * 60 * 1000;
  _blockCooldownMs = 20 * 60 * 1000;
  _warmupSettleMs = 1500;

  _urlPending = new Map();
  _tabPending = new Map();
  _domPending = new Map();
  _originWarmups = new Map();
  _browserHeaderSessions = new Map();
  _ownedTabIds = new Set();

  _containers = new ContainerPool({
    command: (action, params, timeoutMs) => this._cmd(action, params, timeoutMs),
    hasSession: () => Boolean(this._session),
    buildProxy: () => this._dressProxy(),
    proxyType: () => this._proxyType,
    timeoutMs: () => this._timeoutMs,
    maxPoolSize: () => this._maxPoolSize,
    ttlMs: () => this._containerTtlMs,
  });

  get settingsSchema() {
    return settingsSchemaFor(this.name);
  }

  wsHandler = {
    onUpgrade: (passwordPath) => passwordPath === `/${this._password}`,

    onOpen: () => {
      this._cmd("web_response_whitelist", { list: WEB_RESPONSE_TYPES }).catch(() => { });
    },

    onMessage: (_ws, raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg?.action === "dom_ready" || msg?.action === "dom_load_fail") {
        this._settleDom(msg);
        return;
      }

      if (msg?.action === "web_request") {
        this._rememberBrowserHeaders(msg.data);
        return;
      }

      if (msg?.action !== "web_response") return;

      const { id: tabId, url, body } = msg?.data ?? {};

      const byTab = typeof tabId === "number" && this._tabPending.get(tabId);
      if (byTab) {
        this._settlePending(byTab, byTab.resolve, { url, body });
        return;
      }

      const byUrl =
        typeof url === "string" ? this._firstUrlPending(url) : null;
      if (byUrl) {
        this._settlePending(byUrl, byUrl.resolve, { url, body });
      }
    },

    onClose: () => {
      this._session = null;
      this._containers.clear();
      this._originWarmups.clear();
      this._browserHeaderSessions.clear();
      this._ownedTabIds.clear();
      this._drainDomPending("lolcat-4play: browser extension disconnected");
      this._drainPending("lolcat-4play: browser extension disconnected");
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
    this._password = next.password;
    this._warmupQuery = next.warmupQuery;
    this._warmupTtlMs = next.warmupTtlMs;
    this._blockCooldownMs = next.blockCooldownMs;
    this._warmupSettleMs = next.warmupSettleMs;
    this._containerConfigKey = containerConfigKey(next);

    if (oldKey && oldKey !== this._containerConfigKey) {
      this._containers.yerOldGetOuttaHere();
      this._originWarmups.clear();
      this._browserHeaderSessions.clear();
    }
  }

  available() {
    return this._session?.connected() === true;
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

  _firstUrlPending(url) {
    return this._urlPending.get(url)?.values().next().value ?? null;
  }

  _forgetUrlPending(entry) {
    const entries = this._urlPending.get(entry.url);
    if (!entries) return;

    entries.delete(entry);
    if (!entries.size) this._urlPending.delete(entry.url);
  }

  _settlePending(entry, settle, value) {
    if (!entry || entry.settled) return;

    entry.settled = true;
    clearTimeout(entry.timer);
    this._forgetUrlPending(entry);
    if (typeof entry.tabId === "number") this._tabPending.delete(entry.tabId);
    settle(value);
  }

  _registerPending(url) {
    let entry;
    const promise = new Promise((resolve, reject) => {
      entry = { url, resolve, reject, timer: null, tabId: null, settled: false };
    });
    promise.catch(() => { });

    entry.timer = setTimeout(() => {
      this._settlePending(entry, entry.reject, new Error("lolcat-4play: web_response timed out"));
    }, this._timeoutMs);

    const entries = this._urlPending.get(url) ?? new Set();
    entries.add(entry);
    this._urlPending.set(url, entries);
    return { entry, promise };
  }

  _upgradePending(entry, tabId) {
    if (!entry || entry.settled) return;

    this._forgetUrlPending(entry);
    entry.tabId = tabId;
    this._tabPending.set(tabId, entry);
  }

  _drainPending(reason) {
    const error = new Error(reason);
    const entries = new Set();
    for (const group of this._urlPending.values()) {
      for (const entry of group) entries.add(entry);
    }
    for (const entry of this._tabPending.values()) entries.add(entry);
    for (const entry of entries) this._settlePending(entry, entry.reject, error);
  }

  _drainDomPending(reason) {
    const error = new Error(reason);
    for (const [tabId, waiter] of this._domPending.entries()) {
      clearTimeout(waiter.timer);
      this._domPending.delete(tabId);
      waiter.reject(error);
    }
  }

  async _closeTabQuietly(tabId) {
    if (typeof tabId !== "number") return;
    await this._cmd("tab_close", { tabid: [tabId] }).catch(() => { });
  }

  _settleDom(msg) {
    const tabId = msg?.data?.id;
    const waiter = typeof tabId === "number" ? this._domPending.get(tabId) : null;
    if (!waiter) return;

    clearTimeout(waiter.timer);
    this._domPending.delete(tabId);
    if (msg.action === "dom_load_fail") {
      waiter.reject(new Error("lolcat-4play: warmup page failed to load"));
      return;
    }
    waiter.resolve(msg.data);
  }

  _awaitDom(tabId, timeoutMs = this._timeoutMs) {
    if (typeof tabId !== "number") return Promise.resolve(null);
    const existing = this._domPending.get(tabId);
    if (existing) {
      clearTimeout(existing.timer);
      this._domPending.delete(tabId);
      existing.resolve(null);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._domPending.delete(tabId);
        resolve(null);
      }, Math.min(timeoutMs, this._timeoutMs));
      this._domPending.set(tabId, { resolve, reject, timer });
    });
  }

  async _inject(tabId, js, timeoutMs = this._timeoutMs) {
    const result = await this._cmd("tab_inject_js", { tabid: tabId, js }, timeoutMs);
    if (result?.status !== true) return null;
    const frameResult = Array.isArray(result.result) ? result.result[0] : null;
    return frameResult?.result ?? null;
  }

  _warmupState(origin, containerId) {
    return this._originWarmups.get(warmupKeyFor(origin, containerId));
  }

  _headerSession(origin, containerId) {
    return this._browserHeaderSessions.get(warmupKeyFor(origin, containerId));
  }

  _rememberBrowserHeaders(data = {}) {
    if (!this._isReusableBrowserRequest(data)) return;
    if (typeof data.id !== "number" || !this._ownedTabIds.has(data.id)) return;
    const origin = originFor(data.url);
    if (!origin) return;

    const containerId = data.container || null;
    const cookieJar = seedCookieJarFromHeaders(origin, containerId, data.headers);
    const session = {
      headers: data.headers,
      url: data.url,
      cookieJar,
      capturedAt: Date.now(),
    };
    this._browserHeaderSessions.set(warmupKeyFor(origin, containerId), session);
    if (!containerId || containerId === "firefox-default") {
      this._browserHeaderSessions.set(warmupKeyFor(origin, null), session);
    }
  }

  _isReusableBrowserRequest(data = {}) {
    if (!Array.isArray(data.headers) || !data.url) return false;
    if (data.type !== "main_frame" || String(data.method || "GET").toUpperCase() !== "GET") return false;
    return Boolean(originFor(data.url));
  }

  _usableHeaderSession(origin, containerId) {
    const session = this._headerSession(origin, containerId);
    if (!session?.headers?.length) return null;
    if (Date.now() - session.capturedAt > this._warmupTtlMs) return null;
    return session;
  }

  _setWarmupState(origin, containerId, state) {
    this._originWarmups.set(warmupKeyFor(origin, containerId), state);
  }

  _markOriginBlocked(origin, containerId, reason = "blocked") {
    this._setWarmupState(origin, containerId, {
      blockedUntil: Date.now() + this._blockCooldownMs,
      reason,
    });
    this._containers.retireContainer(containerId);
  }

  _assertOriginUsable(origin, containerId) {
    const state = this._warmupState(origin, containerId);
    if (state?.blockedUntil > Date.now()) {
      throw new OriginBlockedError(origin, state.reason);
    }
  }

  async _inspectWarmupPage(origin, containerId, tabId) {
    const page = await this._inject(tabId, inspectPageJs(), Math.min(10000, this._timeoutMs));
    const haystack = `${page?.title || ""}\n${page?.href || ""}\n${page?.text || ""}`;
    if (looksBlocked(haystack)) {
      this._markOriginBlocked(origin, containerId, "warmup page block/captcha");
      throw new OriginBlockedError(origin, "warmup page block/captcha");
    }
    return page;
  }

  async _openWarmupTab(origin, containerId) {
    const tabResp = await this._cmd("tab_open", tabSpell(`${origin}/`, containerId));
    const tabId = tabResp?.data?.id;
    if (typeof tabId !== "number") {
      throw new Error("lolcat-4play: warmup tab_open did not return a valid tab id");
    }
    this._ownedTabIds.add(tabId);
    await this._awaitDom(tabId, this._timeoutMs).catch(() => null);
    await sleep(this._warmupSettleMs);
    return tabId;
  }

  async _tryFormWarmup(origin, containerId, tabId) {
    const submitted = await this._inject(
      tabId,
      warmupSearchJs(this._warmupQuery),
      Math.min(10000, this._timeoutMs),
    );
    if (!submitted?.submitted) return false;

    await this._awaitDom(tabId, Math.min(10000, this._timeoutMs)).catch(() => null);
    await sleep(this._warmupSettleMs);
    await this._inspectWarmupPage(origin, containerId, tabId);
    return true;
  }

  async _ensureOriginWarm(url, containerId) {
    const origin = originFor(url);
    if (!origin) return null;

    this._assertOriginUsable(origin, containerId);

    const state = this._warmupState(origin, containerId);
    if (state?.warmedAt && Date.now() - state.warmedAt < this._warmupTtlMs) {
      return origin;
    }
    if (state?.promise) {
      await state.promise;
      return origin;
    }

    const promise = this._warmOriginNow(origin, containerId);
    this._setWarmupState(origin, containerId, { promise });
    try {
      await promise;
      const session = this._usableHeaderSession(origin, containerId);
      if (session) {
        this._setWarmupState(origin, containerId, { warmedAt: Date.now() });
      } else {
        this._originWarmups.delete(warmupKeyFor(origin, containerId));
        console.warn(`[lolcat-4play] origin warmup for ${origin} did not capture a reusable main-frame browser session`);
      }
      return origin;
    } catch (error) {
      if (error instanceof OriginBlockedError) throw error;
      this._originWarmups.delete(warmupKeyFor(origin, containerId));
      console.warn(`[lolcat-4play] origin warmup failed for ${origin}: ${error?.message || error}`);
      return origin;
    }
  }

  async _warmOriginNow(origin, containerId) {
    let tabId = null;
    try {
      tabId = await this._openWarmupTab(origin, containerId);
      await this._inspectWarmupPage(origin, containerId, tabId);
      await this._tryFormWarmup(origin, containerId, tabId);
    } finally {
      await this._closeTabQuietly(tabId);
      this._ownedTabIds.delete(tabId);
    }
  }

  _wrapFetchedText(text, origin, containerId) {
    if (origin && looksBlocked(text)) {
      this._markOriginBlocked(origin, containerId, "response block/captcha");
      throw new OriginBlockedError(origin, "response block/captcha");
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

  async _curlFetchWarmed(url, origin, containerId) {
    const session = this._usableHeaderSession(origin, containerId);
    if (!session || !(await resolveCurlBinary())) return null;

    try {
      const response = await curlFetchWithBrowserHeaders({
        url,
        headers: session.headers,
        timeoutSeconds: this._timeoutMs / 1000,
        cookieJar: session.cookieJar,
        proxyUrl: this._curlProxyUrl(),
      });
      const text = await response.text();
      return this._wrapFetchedText(text, origin, containerId);
    } catch (error) {
      if (error instanceof OriginBlockedError) throw error;
      console.warn(`[lolcat-4play] warmed curl fetch failed for ${origin}: ${error?.message || error}; falling back to browser tab`);
      return null;
    }
  }

  async _browserFetch(url, origin, containerId) {
    let tabId = null;
    const pending = this._registerPending(url);

    try {
      const tabResp = await this._cmd("tab_open", tabSpell(url, containerId));
      tabId = tabResp?.data?.id;
      if (typeof tabId !== "number") {
        throw new Error("lolcat-4play: tab_open did not return a valid tab id");
      }

      this._ownedTabIds.add(tabId);
      this._upgradePending(pending.entry, tabId);

      const { body } = await pending.promise;
      const text = Buffer.from(body, "base64").toString("utf-8");
      return this._wrapFetchedText(text, origin, containerId);
    } finally {
      this._settlePending(
        pending.entry,
        pending.entry.reject,
        new Error("lolcat-4play: request ended before web_response arrived"),
      );
      await this._closeTabQuietly(tabId);
      this._ownedTabIds.delete(tabId);
    }
  }

  async _fetchOnce(url) {
    await this._containers.sweepRetiredContainers();

    const useContainer = this._proxyType !== "none" || this._useContainer;
    let containerId = null;

    try {
      if (useContainer) {
        containerId = await this._containers.summonContainer();
      }

      const origin = await this._ensureOriginWarm(url, containerId);
      return (
        (await this._curlFetchWarmed(url, origin, containerId)) ??
        (await this._browserFetch(url, origin, containerId))
      );
    } finally {
      await this._containers.tuckContainerIn(containerId, useContainer);
    }
  }

  async fetch(url) {
    try {
      return await this._fetchOnce(url);
    } catch (error) {
      const canRetry =
        error instanceof OriginBlockedError &&
        (this._proxyType !== "none" || this._useContainer);
      if (!canRetry) throw error;
      console.warn(`[lolcat-4play] retrying ${error.origin} with a fresh container after block detection`);
      return this._fetchOnce(url);
    }
  }
}
