import { ContainerPool } from "./src/container-pool.js";
import { tabSpell } from "./src/browser.js";
import {
  cookieJarFromCookieHeader,
  cookieJarKeyFor,
  curlFetchWithBrowserHeaders,
  emptyCookieJar,
  proxyUrlFromSettings,
  resolveCurlBinary,
  seedCookieJarTextFromHeaders,
} from "./src/curl-session.js";
import { solveChallenge } from "./src/flaresolverr.js";
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



function normalizeUrl(url) {
  if (typeof url !== "string") return url;
  try {
    const parsed = new URL(url);
    let path = parsed.pathname;
    if (path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

export default class FourPlayTransport {
  isClientExposed = true;
  name = "lolcat-4play";
  displayName = "4play (lolcat)";
  description =
    "Fetches pages using a real Firefox session via the official [lolcat 4play](https://addons.mozilla.org/en-GB/firefox/addon/4play/) browser extension. Point the extension at this transport's WebSocket address instead of a separate server.";

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

  _urlPending = new Map();
  _tabPending = new Map();
  _domPending = new Map();
  _originWarmups = new Map();
  _browserHeaderSessions = new Map();
  _ownedTabIds = new Set();
  _captchaTabIds = new Set();
  _cookieCache = null;
  _cookieJarTextSessions = new Map();

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

  get settingsSchema() {
    return settingsSchemaFor(this.name);
  }

  wsHandler = {
    onUpgrade: (passwordPath) => passwordPath === `/${this._password}`,

    onOpen: () => {
      this._startHeartbeat();
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

      const byUrl = typeof url === "string" ? this._firstUrlPending(normalizeUrl(url)) : null;
      if (byUrl) {
        this._settlePending(byUrl, byUrl.resolve, { url, body });
      }
    },

    onClose: () => {
      this._stopHeartbeat();
      this._containers.clear();
      this._originWarmups.clear();
      this._browserHeaderSessions.clear();
      this._cookieJarTextSessions.clear();
      this._ownedTabIds.clear();
      this._captchaTabIds.clear();
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
    this._flaresolverrUrl = next.flaresolverrUrl;
    this._flaresolverrTimeoutMs = next.flaresolverrTimeoutMs;
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
      this._cookieJarTextSessions.clear();
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
    const norm = normalizeUrl(url);
    return this._urlPending.get(norm)?.values().next().value ?? null;
  }

  _forgetUrlPending(entry) {
    const norm = normalizeUrl(entry.url);
    const entries = this._urlPending.get(norm);
    if (!entries) return;

    entries.delete(entry);
    if (!entries.size) this._urlPending.delete(norm);
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
      entry = {
        url,
        resolve,
        reject,
        timer: null,
        tabId: null,
        settled: false,
      };
    });
    promise.catch(() => {});

    entry.timer = setTimeout(() => {
      this._settlePending(
        entry,
        entry.reject,
        new Error("lolcat-4play: web_response timed out"),
      );
    }, this._timeoutMs);

    const norm = normalizeUrl(url);
    const entries = this._urlPending.get(norm) ?? new Set();
    entries.add(entry);
    this._urlPending.set(norm, entries);
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
    for (const entry of entries)
      this._settlePending(entry, entry.reject, error);
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

  _settleDom(msg) {
    const tabId = msg?.data?.id;
    const waiter =
      typeof tabId === "number" ? this._domPending.get(tabId) : null;
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
      const timer = setTimeout(
        () => {
          this._domPending.delete(tabId);
          resolve(null);
        },
        Math.min(timeoutMs, this._timeoutMs),
      );
      this._domPending.set(tabId, { resolve, reject, timer });
    });
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

  _warmupState(origin, containerId) {
    return this._originWarmups.get(warmupKeyFor(origin, this._containerConfigKey || "default"));
  }

  _headerSession(origin, containerId) {
    return this._browserHeaderSessions.get(warmupKeyFor(origin, this._containerConfigKey || "default"));
  }

  _persistCookieJar(origin, containerId, cookieJarText, headers = null) {
    const key = cookieJarKeyFor(origin, this._containerConfigKey || "default");
    this._cookieJarTextSessions.set(key, cookieJarText);
    this._cookieCache
      ?.set(key, cookieJarText, this._warmupTtlMs)
      .catch((error) => {
        console.warn(
          `[lolcat-4play] failed to persist cookie jar for ${origin}: ${error?.message || error}`,
        );
      });
    if (headers && this._cookieCache) {
      this._cookieCache
        .set(key + ":headers", JSON.stringify(headers), this._warmupTtlMs)
        .catch((error) => {
          console.warn(
            `[lolcat-4play] failed to persist headers for ${origin}: ${error?.message || error}`,
          );
        });
    }
  }

  async _loadCookieJar(origin, containerId) {
    const key = cookieJarKeyFor(origin, this._containerConfigKey || "default");
    if (this._cookieCache) {
      try {
        const cached = await this._cookieCache.get(key);
        if (cached) return cached;
      } catch (error) {
        console.warn(
          `[lolcat-4play] failed to read cookie jar for ${origin}: ${error?.message || error}`,
        );
      }
    }
    return this._cookieJarTextSessions.get(key) || null;
  }

  async _loadSessionFromCache(origin, containerId) {
    const key = cookieJarKeyFor(origin, this._containerConfigKey || "default");
    const warmupKey = warmupKeyFor(origin, this._containerConfigKey || "default");
    if (this._browserHeaderSessions.has(warmupKey)) {
      return;
    }

    if (this._cookieCache) {
      try {
        const cachedCookies = await this._cookieCache.get(key);
        const cachedHeadersJson = await this._cookieCache.get(key + ":headers");
        if (cachedCookies && cachedHeadersJson) {
          const headers = JSON.parse(cachedHeadersJson);
          const session = {
            headers,
            url: origin,
            cookieJarText: cachedCookies,
            capturedAt: Date.now(),
          };
          this._browserHeaderSessions.set(warmupKey, session);
          this._setWarmupState(origin, containerId, { warmedAt: Date.now() });
          console.warn(
            `[lolcat-4play] restored warmed session for ${origin} from Valkey cache (skipped browser warmup)`,
          );
        }
      } catch (error) {
        console.warn(
          `[lolcat-4play] failed to restore warmed session from cache for ${origin}: ${error?.message || error}`,
        );
      }
    }
  }

  _rememberBrowserHeaders(data = {}) {
    if (typeof data.id !== "number" || !this._ownedTabIds.has(data.id)) return;
    const origin = originFor(data.url);
    if (!origin) return;

    const containerId = data.container || null;
    const cookieJarText = seedCookieJarTextFromHeaders(origin, data.headers);
    if (cookieJarText) {
      this._persistCookieJar(origin, containerId, cookieJarText);
    }

    const warmupKey = warmupKeyFor(origin, this._containerConfigKey || "default");

    // If it's a main_frame GET/POST, capture headers as well for curl
    const isMainFrame = data.type === "main_frame";

    let session = this._browserHeaderSessions.get(warmupKey);
    if (isMainFrame || !session) {
      session = {
        headers: isMainFrame ? data.headers : (session?.headers || data.headers),
        url: data.url,
        cookieJarText: cookieJarText || session?.cookieJarText || null,
        capturedAt: Date.now(),
      };
      this._browserHeaderSessions.set(warmupKey, session);
      if (session.cookieJarText) {
        this._persistCookieJar(origin, containerId, session.cookieJarText, session.headers);
      }
    } else {
      if (cookieJarText) {
        session.cookieJarText = cookieJarText;
      }
      session.capturedAt = Date.now();
      if (session.cookieJarText) {
        this._persistCookieJar(origin, containerId, session.cookieJarText, session.headers);
      }
    }

    const state = this._warmupState(origin, containerId);
    if (!state?.warmedAt || state?.blockedUntil) {
      this._setWarmupState(origin, containerId, { warmedAt: Date.now() });
      console.warn(
        `[lolcat-4play] unblocked/warmed ${origin} via captured browser request (container=${containerId || "default"}, url=${data.url})`,
      );
    }
  }

  _isReusableBrowserRequest(data = {}) {
    if (!Array.isArray(data.headers) || !data.url) return false;
    if (
      data.type !== "main_frame" ||
      String(data.method || "GET").toUpperCase() !== "GET"
    )
      return false;
    return Boolean(originFor(data.url));
  }

  _usableHeaderSession(origin, containerId) {
    const session = this._headerSession(origin, containerId);
    if (!session?.headers?.length) return null;
    if (Date.now() - session.capturedAt > this._warmupTtlMs) {
      console.warn(
        `[lolcat-4play] ${origin} session expired (container=${containerId || "default"}, age=${Math.round((Date.now() - session.capturedAt) / 1000)}s); will rewarm`,
      );
      return null;
    }
    return session;
  }

  _setWarmupState(origin, containerId, state) {
    this._originWarmups.set(warmupKeyFor(origin, this._containerConfigKey || "default"), state);
  }

  _markOriginBlocked(origin, containerId, reason = "blocked") {
    console.warn(
      `[lolcat-4play] tainting ${origin} session for ${Math.round(this._blockCooldownMs / 60000)}m (container=${containerId || "default"}, reason: ${reason}); retiring container`,
    );
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
    const page = await this._inject(
      tabId,
      inspectPageJs(),
      Math.min(10000, this._timeoutMs),
    );
    const haystack = `${page?.title || ""}\n${page?.href || ""}\n${page?.text || ""}`;
    if (looksBlocked(haystack)) {
      this._markOriginBlocked(origin, containerId, "warmup page block/captcha");
      throw new OriginBlockedError(origin, "warmup page block/captcha");
    }
    return page;
  }

  async _openWarmupTab(origin, containerId) {
    const tabResp = await this._cmd(
      "tab_open",
      tabSpell(`${origin}/`, containerId),
    );
    const tabId = tabResp?.data?.id;
    if (typeof tabId !== "number") {
      throw new Error(
        "lolcat-4play: warmup tab_open did not return a valid tab id",
      );
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

    await this._awaitDom(tabId, Math.min(10000, this._timeoutMs)).catch(
      () => null,
    );
    await sleep(this._warmupSettleMs);
    await this._inspectWarmupPage(origin, containerId, tabId);
    return true;
  }

  async _ensureOriginWarm(url, containerId) {
    const origin = originFor(url);
    if (!origin) return null;

    this._assertOriginUsable(origin, containerId);

    await this._loadSessionFromCache(origin, containerId);

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
        this._originWarmups.delete(warmupKeyFor(origin, this._containerConfigKey || "default"));
        console.warn(
          `[lolcat-4play] origin warmup for ${origin} did not capture a reusable main-frame browser session`,
        );
      }
      return origin;
    } catch (error) {
      if (error instanceof OriginBlockedError) throw error;
      this._originWarmups.delete(warmupKeyFor(origin, this._containerConfigKey || "default"));
      console.warn(
        `[lolcat-4play] origin warmup failed for ${origin}: ${error?.message || error}`,
      );
      return origin;
    }
  }

  async _warmOriginNow(origin, containerId) {
    let tabId = null;
    let keepTabOpen = false;
    try {
      tabId = await this._openWarmupTab(origin, containerId);
      await this._inspectWarmupPage(origin, containerId, tabId);
      await this._tryFormWarmup(origin, containerId, tabId);
    } catch (error) {
      if (error instanceof OriginBlockedError) {
        keepTabOpen = true;
        if (typeof tabId === "number") {
          this._captchaTabIds.add(tabId);
        }
      }
      throw error;
    } finally {
      if (!keepTabOpen) {
        await this._closeTabQuietly(tabId);
        this._ownedTabIds.delete(tabId);
      }
    }
  }

  _wrapFetchedText(text, origin, containerId, url = "") {
    if (origin && looksBlocked(text, url)) {
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
        console.warn(
          `[lolcat-4play] FlareSolverr could not clear the challenge for ${origin}; falling back to manual tab`,
        );
        return null;
      }

      if (solution.cookieHeader) {
        const jar = cookieJarFromCookieHeader(origin, solution.cookieHeader);
        const session = this._headerSession(origin, containerId);
        if (session) session.cookieJarText = jar;
        this._persistCookieJar(origin, containerId, jar, session?.headers || null);
      }
      this._setWarmupState(origin, containerId, { warmedAt: Date.now() });

      console.warn(`[lolcat-4play] FlareSolverr cleared the challenge for ${origin}`);
      return wrapResponse(solution.html);
    } catch (error) {
      console.warn(
        `[lolcat-4play] FlareSolverr request failed for ${origin}: ${error?.message || error}; falling back to manual tab`,
      );
      return null;
    }
  }

  async _curlFetchWarmed(url, origin, containerId) {
    const session = this._usableHeaderSession(origin, containerId);
    if (!session || !(await resolveCurlBinary())) return null;

    const cookieJarText =
      (await this._loadCookieJar(origin, containerId)) || session.cookieJarText || emptyCookieJar();

    try {
      const response = await curlFetchWithBrowserHeaders({
        url,
        headers: session.headers,
        timeoutSeconds: this._timeoutMs / 1000,
        cookieJarText,
        onCookieJarText: (updated) => {
          session.cookieJarText = updated;
          this._persistCookieJar(origin, containerId, updated);
        },
        proxyUrl: this._curlProxyUrl(),
      });
      const text = await response.text();
      return this._wrapFetchedText(text, origin, containerId, url);
    } catch (error) {
      if (error instanceof OriginBlockedError) {
        const solved = await this._solveWithFlare(url, origin, containerId);
        if (solved) return solved;
        console.warn(
          `[lolcat-4play] curl fetch got blocked for ${origin}. Opening browser tab at ${url} to let user solve CAPTCHA.`,
        );
        this._cmd("tab_open", tabSpell(url, containerId))
          .then((tabResp) => {
            const tabId = tabResp?.data?.id;
            if (typeof tabId === "number") {
              this._ownedTabIds.add(tabId);
              this._captchaTabIds.add(tabId);
            }
          })
          .catch(() => {});
        throw error;
      }
      console.warn(
        `[lolcat-4play] warmed curl fetch failed for ${origin}: ${error?.message || error}; falling back to browser tab`,
      );
      return null;
    }
  }

  async _browserFetch(url, origin, containerId) {
    console.warn(
      `[lolcat-4play] direct browser tab fetch for ${url} (container=${containerId || "default"}): no warmed curl session for this origin, fetching DOM outerHTML via tab injection`,
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
        return this._wrapFetchedText(html, origin, containerId, url);
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

  async _fetchOnce(url, options = {}, context = {}) {
    if (context.useCache && !this._cookieCache) {
      this._cookieCache = context.useCache(
        "transport:lolcat-4play:cookies",
        this._warmupTtlMs,
      );
    }

    await this._containers.sweepRetiredContainers();

    const useContainer = this._proxyType !== "none" || this._useContainer;
    let containerId = null;
    let hitBlock = false;

    try {
      if (useContainer) {
        containerId = await this._containers.summonContainer();
      }

      const origin = await this._ensureOriginWarm(url, containerId);
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
      console.warn(
        `[lolcat-4play] retrying ${error.origin} with a fresh container after block detection`,
      );
      return this._fetchOnce(url, options, context);
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this._session?.browser) {
        try {
          this._session.browser.send(JSON.stringify({ action: "ping" }));
        } catch {
          // ignore
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
