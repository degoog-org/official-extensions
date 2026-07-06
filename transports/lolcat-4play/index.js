import { ContainerPool } from "./src/browser/container-pool.js";
import { DomWaiters } from "./src/browser/dom-waiters.js";
import { TabController } from "./src/browser/tab-controller.js";
import { SessionStore } from "./src/session/session-store.js";
import { CaptchaManager } from "./src/runtime/captcha-manager.js";
import { ControlChannel, CONTROL_TTL_MS } from "./src/runtime/control-channel.js";
import { PageFetcher } from "./src/runtime/page-fetcher.js";
import { ResponseCapture } from "./src/runtime/response-capture.js";
import { TriggerRouter } from "./src/runtime/trigger-router.js";
import { Scheduler } from "./src/runtime/scheduler.js";
import { StatusReporter, STATUS_TTL_MS } from "./src/runtime/status-reporter.js";
import { buildExtensionProxy, curlProxyUrlFor } from "./src/net/proxy.js";
import { OriginBlockedError, originFor } from "./src/warmup/origin-warmup.js";
import { WarmupDriver } from "./src/warmup/warmup-driver.js";
import {
  DEFAULT_CONTAINER_TTL_H,
  FETCH_TIMEOUT_MS,
  containerConfigKey,
  normaliseSettings,
  settingsSchemaFor,
} from "./src/config/settings.js";

const DEFAULT_SETTINGS = {
  timeoutMs: 30000,
  maxPoolSize: 10,
  containerTtlMs: DEFAULT_CONTAINER_TTL_H * 60 * 60 * 1000,
  useContainer: false,
  proxyType: "none",
  proxyHost: "",
  proxyPort: 1080,
  proxyUsername: "",
  proxyPassword: "",
  proxyDns: true,
  flaresolverrUrl: "",
  flaresolverrTimeoutMs: 60000,
  password: "",
  warmupQuery: "weather",
  warmupTtlMs: 60 * 60 * 1000,
  blockCooldownMs: 20 * 60 * 1000,
  warmupSettleMs: 1500,
  autoWarmMs: 0,
  rawHtmlFromTab: false,
  triggers: [],
};

export default class FourPlayTransport {
  isClientExposed = true;
  name = "lolcat-4play";
  displayName = "4play (lolcat)";
  description =
    "Fetches pages using a real Firefox session via the official [lolcat 4play](https://addons.mozilla.org/en-GB/firefox/addon/4play/) browser extension. Point the extension at this transport's WebSocket address instead of a separate server.";
  needsAppRestart = true;

  _session = null;
  _sessionId = Math.random().toString(36).slice(2, 8);
  _settings = { ...DEFAULT_SETTINGS };
  _containerConfigKey = "";
  _cachesBound = false;

  _seenOrigins = new Set();
  _dom = new DomWaiters();

  _capture = new ResponseCapture({
    command: (action, params, timeoutMs) => this._cmd(action, params, timeoutMs),
    warn: (msg) => this._warn(msg),
  });

  _triggers = new TriggerRouter({
    triggers: () => this._settings.triggers,
  });

  _tabs = new TabController({
    command: (action, params, timeoutMs) => this._cmd(action, params, timeoutMs),
    dom: this._dom,
    timeoutMs: () => this._settings.timeoutMs,
    settleMs: () => this._settings.warmupSettleMs,
    warn: (msg) => this._warn(msg),
  });

  _store = new SessionStore({
    configKey: () => this._containerConfigKey,
    warmupTtlMs: () => this._settings.warmupTtlMs,
    ownedTabIds: this._tabs.ownedTabIds,
    tabContainerIds: this._tabs.tabContainerIds,
    log: (msg) => this._warn(msg),
  });

  _containers = new ContainerPool({
    command: (action, params, timeoutMs) => this._cmd(action, params, timeoutMs),
    hasSession: () => Boolean(this._session),
    buildProxy: () => buildExtensionProxy(this._settings),
    proxyType: () => this._settings.proxyType,
    timeoutMs: () => this._settings.timeoutMs,
    maxPoolSize: () => this._settings.maxPoolSize,
    ttlMs: () => this._settings.containerTtlMs,
    rememberContainer: (container) => this._tabs.rememberContainer(container),
    warn: (msg) => this._warn(msg),
  });

  _captcha = new CaptchaManager({
    tabs: this._tabs,
    store: this._store,
    timeoutMs: () => this._settings.timeoutMs,
    warn: (msg) => this._warn(msg),
  });

  _warmer = new WarmupDriver({
    cmd: (action, params, timeoutMs) => this._cmd(action, params, timeoutMs),
    inject: (tabId, js, timeoutMs) => this._tabs.inject(tabId, js, timeoutMs),
    awaitDom: (tabId, timeoutMs) => this._tabs.awaitDom(tabId, timeoutMs),
    awaitReady: (tabId, timeoutMs) => this._tabs.awaitReady(tabId, timeoutMs),
    closeTabQuietly: (tabId) => this._tabs.closeTabQuietly(tabId),
    store: this._store,
    ownedTabIds: this._tabs.ownedTabIds,
    tabContainerIds: this._tabs.tabContainerIds,
    registerCaptcha: (tabId, origin, kind) => this._captcha.register(tabId, origin, kind),
    seenOrigins: this._seenOrigins,
    warn: (msg) => this._warn(msg),
    timeoutMs: () => this._settings.timeoutMs,
    warmupQuery: () => this._settings.warmupQuery,
    warmupTtlMs: () => this._settings.warmupTtlMs,
    blockCooldownMs: () => this._settings.blockCooldownMs,
    settleMs: () => this._settings.warmupSettleMs,
    acceptConsent: (tabId) => this._tabs.acceptConsent(tabId),
  });

  _fetcher = new PageFetcher({
    command: (action, params, timeoutMs) => this._cmd(action, params, timeoutMs),
    tabs: this._tabs,
    captcha: this._captcha,
    capture: this._capture,
    store: this._store,
    markBlocked: (origin, containerId, reason, tabId) =>
      this._warmer.markBlocked(origin, containerId, reason, tabId),
    flaresolverrUrl: () => this._settings.flaresolverrUrl,
    flaresolverrTimeoutMs: () => this._settings.flaresolverrTimeoutMs,
    curlProxyUrl: () => curlProxyUrlFor(this._settings),
    timeoutMs: () => this._settings.timeoutMs,
    warn: (msg) => this._warn(msg),
  });

  _status = new StatusReporter({
    connected: () => this.available(),
    command: (action, params, timeoutMs) => this._cmd(action, params, timeoutMs),
    store: this._store,
    containers: this._containers,
    tabs: this._tabs,
    captcha: this._captcha,
    seenOrigins: this._seenOrigins,
    maxPoolSize: () => this._settings.maxPoolSize,
    autoWarmMs: () => this._settings.autoWarmMs,
    timeoutMs: () => this._settings.timeoutMs,
    warn: (msg) => this._warn(msg),
  });

  _control = new ControlChannel({
    store: this._store,
    containers: this._containers,
    seenOrigins: this._seenOrigins,
    publish: () => this._status.publish(),
    containerConfigKey: () => this._containerConfigKey,
    warn: (msg) => this._warn(msg),
  });

  _scheduler = new Scheduler({
    session: () => this._session,
    containers: this._containers,
    warmer: this._warmer,
    seenOrigins: this._seenOrigins,
    autoWarmMs: () => this._settings.autoWarmMs,
    useContainer: () => this._useContainer(),
    publish: () => this._status.publish(),
    warn: (msg) => this._warn(msg),
  });

  get settingsSchema() {
    return settingsSchemaFor(this.name);
  }

  wsHandler = {
    onUpgrade: (passwordPath) => passwordPath === `/${this._settings.password}`,

    onOpen: () => {
      this._warn(
        `browser extension connected (transport name=${this.name}, status namespace=transport:${this.name}:status)`,
      );
      this._scheduler.startHeartbeat();
      this._scheduler.startAutoWarm();
      this._control.start();
      this._status.publish();
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
        if (msg?.action === "dom_ready") {
          this._tabs.rememberTab(msg.data);
          const tabId = msg.data?.id;
          if (typeof tabId === "number" && this._captcha.captchaTabIds.has(tabId)) {
            this._captcha.syncTab(tabId).catch(() => {});
          }
        }
        this._dom.settle(msg);
        return;
      }

      if (msg?.action === "web_request") {
        this._tabs.rememberTab(msg.data);
        this._store.rememberBrowserHeaders(msg.data);
        return;
      }

      if (msg?.action === "web_response") {
        this._capture.route(msg.data);
      }
    },

    onClose: () => {
      this._warn("browser extension disconnected; clearing in-memory sessions");
      this._scheduler.stopHeartbeat();
      this._scheduler.stopAutoWarm();
      this._control.stop();
      this._containers.clear();
      this._store.clearMemory();
      this._tabs.clear();
      this._captcha.clear();
      this._capture.drain();
      this._dom.drain("lolcat-4play: browser extension disconnected");
      this._status.publish();
    },
  };

  bindWsSession(session) {
    this._session = session;
  }

  configure(settings = {}) {
    const oldKey = this._containerConfigKey;
    this._settings = normaliseSettings(settings);
    this._containerConfigKey = containerConfigKey(this._settings);

    if (oldKey && oldKey !== this._containerConfigKey) {
      this._containers.yerOldGetOuttaHere();
      this._store.clearMemory();
    }

    if (this._session?.connected()) this._scheduler.startAutoWarm();
  }

  available() {
    return this._session?.connected() === true;
  }

  _useContainer() {
    return this._settings.proxyType !== "none" || this._settings.useContainer;
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

  _bindCaches(context) {
    if (this._cachesBound || !context.useCache) return;
    this._cachesBound = true;
    this._store.bindCache(
      context.useCache(`transport:${this.name}:cookies`, this._settings.warmupTtlMs),
    );
    this._status.bindCache(
      context.useCache(`transport:${this.name}:status`, STATUS_TTL_MS),
    );
    this._control.bindCache(
      context.useCache(`transport:${this.name}:control`, CONTROL_TTL_MS),
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
    this._status.publish();
  }

  async _fetchOnce(url, _options = {}, context = {}) {
    this._bindCaches(context);
    await this._containers.sweepRetiredContainers();

    const origin = originFor(url);
    const trigger = this._triggers.match(context?.engineId, url);
    const useContainer = this._useContainer();
    let containerId = null;

    try {
      const captchaRes = await this._captcha.tryFetch(url);
      if (captchaRes) return captchaRes;

      if (origin && this._captcha.hasOpenTabForOrigin(origin)) {
        throw new OriginBlockedError(origin, "awaiting manual captcha solve");
      }

      if (useContainer && origin) {
        containerId = await this._containers.summonContainer(origin);
      }

      await this._captcha.syncAllTabs();

      if (trigger) {
        const res = await this._fetcher.triggerFetch(url, origin, containerId, trigger);
        await this._captcha.clearTabsForOrigin(origin);
        return res;
      }

      const warmedOrigin = await this._warmer.ensureWarm(url, containerId);
      const res = this._settings.rawHtmlFromTab
        ? await this._fetcher.rawBrowserFetch(url, warmedOrigin, containerId)
        : (await this._fetcher.curlFetchWarmed(url, warmedOrigin, containerId)) ??
          (await this._fetcher.browserFetch(url, warmedOrigin, containerId));
      await this._captcha.clearTabsForOrigin(warmedOrigin);
      return res;
    } catch (error) {
      if (error instanceof OriginBlockedError) {
        await this._captcha.syncAllTabs();
        const captchaRes = await this._captcha.tryFetch(url);
        if (captchaRes) return captchaRes;
      }
      throw error;
    } finally {
      await this._containers.tuckContainerIn(containerId);
      this._status.publish();
    }
  }

  async fetch(url, options = {}, context = {}) {
    try {
      return await this._fetchOnce(url, options, context);
    } catch (error) {
      if (!(error instanceof OriginBlockedError)) throw error;

      const captchaOpen = this._captcha.hasOpenTabForOrigin(error.origin);
      const canRetry =
        this._useContainer() && !captchaOpen && error.status !== "consent";
      if (!canRetry) throw error;

      const retryTab = typeof error.tabId === "number" ? error.tabId : "unknown";
      this._warn(
        `retrying ${error.origin} with a fresh container after block detection (tab=${retryTab})`,
      );
      return this._fetchOnce(url, options, context);
    }
  }
}
