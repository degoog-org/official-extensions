import { settingsSchemaFor, normaliseSettings } from "./src/config/settings.js";
import { FplayClient } from "./src/protocol/fplay-client.js";
import { EventRouter } from "./src/protocol/event-router.js";
import { ContainerPool } from "./src/browser/container-pool.js";
import { TabSession } from "./src/browser/tab-session.js";
import { SessionRegistry } from "./src/session/session-registry.js";
import { CaptchaManager } from "./src/runtime/captcha-manager.js";
import { FetchPipeline } from "./src/runtime/fetch-pipeline.js";
import {
  StatusPublisher,
  STATUS_TTL_MS,
} from "./src/status/status-publisher.js";
import {
  ControlChannel,
  CONTROL_TTL_MS,
} from "./src/status/control-channel.js";
import { originFor } from "./src/util/url.js";

const DEFAULT_SETTINGS = {
  timeoutMs: 30000,
  password: "",
  proxyType: "none",
  proxyHost: "",
  proxyPort: "",
  proxyUsername: "",
  proxyPassword: "",
  proxyDns: true,
  useContainer: true,
  maxPoolSize: 4,
  cleanTtlMs: 60 * 60 * 1000,
  degradedTtlMs: 10 * 60 * 1000,
  warmupQuery: "weather",
  humanMinDelayMs: 45,
  humanMaxDelayMs: 130,
  autoWarmMs: 0,
  rawHtmlFromTab: false,
  flaresolverrUrl: "",
  flaresolverrTimeoutMs: 60000,
};

export default class Lolcat4playTransport {
  isClientExposed = true;
  name = "lolcat-4play";
  displayName = "4play (lolcat)";
  description =
    "Fetches pages using a real Firefox session via the official [lolcat 4play](https://addons.mozilla.org/en-GB/firefox/addon/4play/) browser extension. Point the extension at this transport's WebSocket address instead of a separate server.";
  needsAppRestart = true;

  _session = null;
  _settings = { ...DEFAULT_SETTINGS };
  _seenOrigins = new Set();
  _cachesBound = false;

  _client = new FplayClient({
    session: () => this._session,
    timeoutMs: () => this._settings.timeoutMs,
    warn: (msg) => this._warn(msg),
  });

  _registry = new SessionRegistry({
    cleanTtlMs: () => this._settings.cleanTtlMs,
    degradedTtlMs: () => this._settings.degradedTtlMs,
    warn: (msg) => this._warn(msg),
  });

  _containers = new ContainerPool({
    client: this._client,
    maxPoolSize: () => this._settings.maxPoolSize,
    useContainer: () =>
      this._settings.useContainer || this._settings.proxyType !== "none",
    proxySettings: () => this._settings,
    warn: (msg) => this._warn(msg),
  });

  _tabs = new TabSession({
    client: this._client,
    registry: this._registry,
    timeoutMs: () => this._settings.timeoutMs,
    warmupQuery: () => this._settings.warmupQuery,
    humanDelayRange: () => [
      this._settings.humanMinDelayMs,
      this._settings.humanMaxDelayMs,
    ],
    warn: (msg) => this._warn(msg),
  });

  _captcha = new CaptchaManager({
    tabs: this._tabs,
    registry: this._registry,
    releaseHold: (containerId) => this._containers.releaseManual(containerId),
    timeoutMs: () => this._settings.timeoutMs,
    warn: (msg) => this._warn(msg),
  });

  _events = new EventRouter({
    registry: this._registry,
    tabs: this._tabs,
    captcha: this._captcha,
    warn: (msg) => this._warn(msg),
  });

  _pipeline = new FetchPipeline({
    registry: this._registry,
    containers: this._containers,
    tabs: this._tabs,
    captcha: this._captcha,
    seenOrigins: this._seenOrigins,
    proxySettings: () => this._settings,
    rawHtmlFromTab: () => this._settings.rawHtmlFromTab,
    flaresolverrUrl: () => this._settings.flaresolverrUrl,
    flaresolverrTimeoutMs: () => this._settings.flaresolverrTimeoutMs,
    warn: (msg) => this._warn(msg),
  });

  _status = new StatusPublisher({
    name: () => this.name,
    connected: () => this.available(),
    client: this._client,
    registry: this._registry,
    containers: this._containers,
    seenOrigins: this._seenOrigins,
    autoWarmMs: () => this._settings.autoWarmMs,
    warn: (msg) => this._warn(msg),
  });

  _control = new ControlChannel({
    registry: this._registry,
    containers: this._containers,
    seenOrigins: this._seenOrigins,
    publish: () => this._status.publish(),
    warn: (msg) => this._warn(msg),
  });

  get settingsSchema() {
    return settingsSchemaFor(this.name);
  }

  wsHandler = {
    onUpgrade: (passwordPath) => passwordPath === `/${this._settings.password}`,

    onOpen: () => {
      this._warn("browser extension connected");
      this._client.webResponseWhitelist([]).catch(() => {});
      this._control.start();
      this._status.publish();
    },

    onMessage: (_ws, raw) => {
      this._events.handle(raw);
    },

    onClose: () => {
      this._warn("browser extension disconnected");
      this._control.stop();
      this._containers.clear();
      this._registry.clearMemory();
      this._captcha.clear();
      this._tabs.clear();
      this._status.publish();
    },
  };

  bindWsSession(session) {
    this._session = session;
  }

  configure(settings = {}) {
    this._settings = normaliseSettings({ ...DEFAULT_SETTINGS, ...settings });
  }

  available() {
    return this._session?.connected() === true;
  }

  async fetch(url, options = {}, context = {}) {
    this._bindCaches(context);
    const origin = originFor(url);
    if (origin) this._seenOrigins.add(origin);
    const response = await this._pipeline.fetch(url, options, context);
    this._status.publish();
    return response;
  }

  _bindCaches(context = {}) {
    if (this._cachesBound || typeof context.useCache !== "function") return;
    this._cachesBound = true;
    this._registry.bindCache(
      context.useCache(`transport:${this.name}:sessions`, STATUS_TTL_MS),
    );
    this._status.bindCache(
      context.useCache(`transport:${this.name}:status`, STATUS_TTL_MS),
    );
    this._control.bindCache(
      context.useCache(`transport:${this.name}:control`, CONTROL_TTL_MS),
    );
  }

  _warn(msg) {
    console.warn(`[lolcat-4play] ${msg}`);
  }
}
