const WAIT_UNTIL_MAP = {
  load: "load",
  domcontentloaded: "domcontentloaded",
  networkidle: "networkidle0",
};

const _REACT_HYDRATION = /<!--\$\??!?-->|<!--\/\$\??!?-->/g;
const _SHADOW_TEMPLATE =
  /<template\s+shadowroot(?:mode)?="[^"]*"[^>]*>([\s\S]*?)<\/template>/gi;

const _normalizeHtml = (html) => {
  if (!html) return html;
  return html.replace(_REACT_HYDRATION, "").replace(_SHADOW_TEMPLATE, "$1");
};

const _parseCookies = (cookieHeader, url) => {
  if (!cookieHeader) return [];
  let domain = "";
  try {
    domain = `.${new URL(url).hostname}`;
  } catch {}
  return cookieHeader
    .split(";")
    .map((part) => {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) return null;
      return {
        name: part.slice(0, eqIdx).trim(),
        value: part.slice(eqIdx + 1).trim(),
        domain,
        path: "/",
      };
    })
    .filter((c) => c && c.name && c.value);
};

const _pickHeader = (headers, name) => {
  if (!headers) return undefined;
  return headers[name] ?? headers[name.toLowerCase()];
};

const _normalizeUserAgent = (value) => {
  if (typeof value === "string") return value.trim();
  if (value && typeof value.userAgent === "string") return value.userAgent.trim();
  return "";
};

const _originOf = (url) => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
};

export default class BrowserlessTransport {
  isClientExposed = false;
  name = "browserless";
  displayName = "Browserless";
  description =
    "Fetches pages through a self-hosted Browserless instance (or any compatible headless browser service). Compatible with browserless/chromium, CloakBrowser wrappers, and any service exposing POST /content. See the plugin's README.md for the full setup (Docker compose and configuration steps).";

  settingsSchema = [
    {
      key: "url",
      label: "Browserless URL",
      type: "url",
      required: true,
      placeholder: "http://127.0.0.1:3000",
      description:
        "Base URL of your Browserless instance (without /content path).",
    },
    {
      key: "token",
      label: "API Token",
      type: "password",
      secret: true,
      description:
        "Optional API token. Sent as Bearer authorization header if provided.",
    },
    {
      key: "warmupEnabled",
      label: "Warm up before request",
      type: "toggle",
      default: "false",
      description:
        "Visit the target origin before the actual request. Helps with sites that watch for cold sessions. Note: Browserless /content does not share state across calls, so this only exercises the IP.",
    },
    {
      key: "timeout",
      label: "Timeout (ms)",
      type: "number",
      placeholder: "15000",
      description: "Maximum time to wait for the page to load (3000–60000 ms).",
    },
    {
      key: "waitUntil",
      label: "Wait until",
      type: "select",
      options: ["load", "domcontentloaded", "networkidle"],
      default: "networkidle",
      description:
        "When to consider the page fully loaded. Use 'networkidle' for JavaScript-heavy pages.",
    },
    {
      key: "bypassProxy",
      label: "Bypass proxy for Browserless endpoint",
      type: "toggle",
      default: "true",
      description:
        "Connect directly to the Browserless service instead of routing through the degoog proxy.",
    },
  ];

  _url = "";
  _token = "";
  _timeoutMs = 15000;
  _waitUntil = "networkidle";
  _bypassProxy = true;
  _warmupEnabled = false;

  configure(settings) {
    this._url = (settings.url || "").replace(/\/+$/, "").trim();
    this._token = (settings.token || "").trim();
    this._bypassProxy = settings.bypassProxy !== "false";
    this._warmupEnabled = settings.warmupEnabled === "true";
    this._timeoutMs = Math.max(
      3000,
      Math.min(60000, Number(settings.timeout) || 15000),
    );
    if (settings.waitUntil in WAIT_UNTIL_MAP) {
      this._waitUntil = settings.waitUntil;
    }
  }

  available() {
    return this._url.length > 0;
  }

  _buildRequestHeaders() {
    const h = {
      "Content-Type": "application/json",
      Accept: "text/html,application/xhtml+xml,*/*",
    };
    if (this._token) h["Authorization"] = `Bearer ${this._token}`;
    return h;
  }

  _buildPayload(url, options) {
    const headers = options?.headers || {};
    const cookies = _parseCookies(_pickHeader(headers, "Cookie"), url);
    const userAgent = _normalizeUserAgent(_pickHeader(headers, "User-Agent"));
    const acceptLanguage = _pickHeader(headers, "Accept-Language");
    const referer = _pickHeader(headers, "Referer");

    const extraHeaders = {};
    if (acceptLanguage) extraHeaders["Accept-Language"] = acceptLanguage;
    if (referer) extraHeaders["Referer"] = referer;

    const payload = {
      url,
      gotoOptions: {
        waitUntil: WAIT_UNTIL_MAP[this._waitUntil] ?? "networkidle0",
        timeout: this._timeoutMs,
      },
    };

    if (userAgent) payload.userAgent = userAgent;
    if (Object.keys(extraHeaders).length > 0)
      payload.setExtraHTTPHeaders = extraHeaders;
    if (cookies.length > 0) payload.cookies = cookies;
    return payload;
  }

  async fetch(url, options, context) {
    const doFetch = this._bypassProxy ? fetch : context.fetch;
    const headers = this._buildRequestHeaders();

    if (this._warmupEnabled) {
      const origin = _originOf(url);
      if (origin && origin !== url) {
        try {
          await doFetch(`${this._url}/content`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              url: origin,
              gotoOptions: {
                waitUntil: "domcontentloaded",
                timeout: this._timeoutMs,
              },
            }),
            signal: options?.signal,
          });
        } catch {}
      }
    }

    let res;
    try {
      res = await doFetch(`${this._url}/content`, {
        method: "POST",
        headers,
        body: JSON.stringify(this._buildPayload(url, options)),
        signal: options?.signal,
      });
    } catch {
      return new Response("", { status: 503 });
    }

    if (!res.ok) return new Response("", { status: res.status });

    const html = await res.text();
    return new Response(_normalizeHtml(html), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}
