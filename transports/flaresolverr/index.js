import {
  DEFAULT_SESSION_TTL_MIN,
  DEFAULT_TIMEOUT_MS,
  DIRECT_ROUTE,
  LOG_TAG,
  MS_PER_MINUTE,
  SOLVE_FAILED_STATUS,
  SOLVE_OK,
} from "./src/const.js";
import { createJar } from "./src/session-jar.js";
import { looksBlocked, replayFetch, wantsLocation } from "./src/replay.js";
import { flareProxy } from "./src/flare-proxy.js";

const _originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

const _isGet = (options) => !options.method || options.method.toUpperCase() === "GET";

const _jarKey = (origin, context) => `${context.proxyUrl || DIRECT_ROUTE}|${origin}`;

const _direct = (url, options, context) =>
  context.fetch(url, {
    method: options.method ?? "GET",
    redirect: options.redirect ?? "follow",
    signal: options.signal,
    headers: options.headers,
    body: options.body,
  });

export default class FlareSolverrTransport {
  isClientExposed = false;
  name = "flaresolverr";
  displayName = "FlareSolverr";
  description =
    "Bypass Cloudflare challenges via a FlareSolverr instance. Once configured, engines can select flaresolverr as their outgoing transport.";

  settingsSchema = [
    {
      key: "url",
      label: "FlareSolverr URL",
      type: "url",
      required: true,
      placeholder: "http://127.0.0.1:8191/v1",
      description: "The URL of your FlareSolverr instance.",
    },
    {
      key: "timeout",
      label: "Timeout (ms)",
      type: "number",
      placeholder: "12000",
      description: "Max time to wait for a FlareSolverr response (1000–60000).",
    },
    {
      key: "bypassProxy",
      label: "Bypass proxy for FlareSolverr endpoint",
      type: "toggle",
      default: "true",
      description: "Connect directly to the FlareSolverr instance instead of routing through the proxy. Enable this when FlareSolverr is on your local network.",
    },
    {
      key: "useEngineProxy",
      label: "Solve through the engine's proxy",
      type: "toggle",
      default: "true",
      description:
        "Passes the proxy degoog picked for the search to FlareSolverr, so the solve and every reused request leave from the same IP. Turn off if FlareSolverr can't reach your proxies.",
    },
    {
      key: "reuseSession",
      label: "Reuse solved sessions",
      type: "toggle",
      default: "true",
      description:
        "Keeps the cookies from each solve and sends later requests to the same site as plain requests with them. If the site blocks the plain request, FlareSolverr solves it again. Only works when FlareSolverr and degoog share a public IP.",
    },
    {
      key: "sessionTtl",
      label: "Session lifetime (minutes)",
      type: "number",
      placeholder: String(DEFAULT_SESSION_TTL_MIN),
      description: "How long to keep a solved session before solving again.",
      visibleWhen: { key: "reuseSession", equals: "true" },
    },
  ];

  _url = "";
  _bypassProxy = true;
  _reuseSession = true;
  _useEngineProxy = true;
  _sessionTtlMs = DEFAULT_SESSION_TTL_MIN * MS_PER_MINUTE;
  _jar = createJar();
  timeoutMs = DEFAULT_TIMEOUT_MS;

  configure(settings) {
    this._url = (settings.url || "").trim();
    this._bypassProxy = settings.bypassProxy !== "false";
    this._reuseSession = settings.reuseSession !== "false";
    this._useEngineProxy = settings.useEngineProxy !== "false";
    const ttlMin = Number(settings.sessionTtl) || DEFAULT_SESSION_TTL_MIN;
    this._sessionTtlMs = Math.max(1, ttlMin) * MS_PER_MINUTE;
    this.timeoutMs = Math.max(
      1000,
      Math.min(60000, Number(settings.timeout) || DEFAULT_TIMEOUT_MS),
    );
    this._jar.clear();
  }

  available() {
    return this._url.length > 0;
  }

  async fetch(url, options, context) {
    if (!this._url) return _direct(url, options, context);

    const origin = this._reuseSession && _isGet(options) ? _originOf(url) : "";
    const key = origin ? _jarKey(origin, context) : "";
    const session = key ? this._jar.find(key) : null;
    if (session) {
      const replayed = await replayFetch(url, options, session, context.fetch);
      if (replayed) return replayed;
      this._jar.drop(key);
    }

    if (wantsLocation(options)) return _direct(url, options, context);
    return this._solve(url, options, context, origin, key);
  }

  _payload(url, context) {
    const payload = { cmd: "request.get", url, maxTimeout: this.timeoutMs };
    const proxy = this._useEngineProxy ? flareProxy(context.proxyUrl) : null;
    if (proxy) payload.proxy = proxy;
    return JSON.stringify(payload);
  }

  async _solve(url, options, context, origin, key) {
    const payload = this._payload(url, context);

    const endpointFetch = this._bypassProxy ? fetch : context.fetch;
    const res = await endpointFetch(this._url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: payload,
      redirect: "follow",
      signal: options.signal,
    });

    if (!res.ok) return new Response("", { status: res.status });
    const data = await res.json();
    if (data?.status !== SOLVE_OK) {
      console.warn(`${LOG_TAG} solve failed for ${origin || "request"}: ${data?.message || "no message"}`);
      return new Response("", { status: SOLVE_FAILED_STATUS });
    }

    const solution = data.solution;
    const html = solution?.response ?? "";
    const status = solution?.status ?? 200;

    if (key && !looksBlocked(status, solution?.url, html)) {
      this._jar.stash(key, origin, solution, this._sessionTtlMs);
    }

    return new Response(html, {
      status,
      headers: { "Content-Type": "text/html" },
    });
  }
}
