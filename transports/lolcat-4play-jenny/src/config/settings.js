export const numberSetting = (value, fallback, min = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
};

export const boolSetting = (value, fallback = false) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
};

export const normaliseSettings = (settings = {}) => ({
  ...settings,
  timeoutMs: numberSetting(settings.timeoutMs, 30000, 1000),
  maxPoolSize: numberSetting(settings.maxPoolSize, 4, 1),
  cleanTtlMs: numberSetting(settings.cleanTtlMs, 60 * 60 * 1000, 1000),
  degradedTtlMs: numberSetting(settings.degradedTtlMs, 10 * 60 * 1000, 1000),
  humanMinDelayMs: numberSetting(settings.humanMinDelayMs, 45, 0),
  humanMaxDelayMs: numberSetting(settings.humanMaxDelayMs, 130, 0),
  autoWarmMs: numberSetting(settings.autoWarmMs, 0, 0),
  flaresolverrUrl: typeof settings.flaresolverrUrl === "string" ? settings.flaresolverrUrl.trim() : "",
  flaresolverrTimeoutMs: numberSetting(settings.flaresolverrTimeoutMs, 60000, 10000),
  rawHtmlFromTab: boolSetting(settings.rawHtmlFromTab, false),
  useContainer: boolSetting(settings.useContainer, true),
  proxyDns: boolSetting(settings.proxyDns, true),
});

export const settingsSchemaFor = (name) => [
  { key: "wsUrl", label: "WebSocket path", type: "info", default: `/ws/${name}` },
  { key: "password", label: "Password", type: "password", default: "" },
  { key: "useContainer", label: "Use Firefox containers", type: "toggle", default: "true" },
  { key: "maxPoolSize", label: "Max clean containers", type: "number", default: "4" },
  { key: "cleanTtlMs", label: "Clean session TTL (ms)", type: "number", default: "3600000" },
  { key: "degradedTtlMs", label: "CAPTCHA-solved/degraded TTL (ms)", type: "number", default: "600000" },
  { key: "warmupQuery", label: "Human warmup query", type: "text", default: "weather" },
  { key: "humanMinDelayMs", label: "Minimum typing delay (ms)", type: "number", default: "45" },
  { key: "humanMaxDelayMs", label: "Maximum typing delay (ms)", type: "number", default: "130" },
  { key: "autoWarmMs", label: "Auto warm interval (ms, 0 off)", type: "number", default: "0" },
  {
    key: "rawHtmlFromTab",
    label: "Always open a tab to fetch raw HTML",
    type: "toggle",
    default: "false",
    description: "When on, warmup still runs normally but fetches then open a real browser tab and read the site's raw base64 HTML response through 4play instead of replaying the warmed session with curl-impersonate. This is slower, but may have less chance of being detected.",
  },
  { key: "flaresolverrUrl", label: "FlareSolverr URL", type: "url", default: "", description: "Optional fallback challenge solver endpoint, e.g. http://flaresolverr:8191" },
  { key: "flaresolverrTimeoutMs", label: "FlareSolverr timeout (ms)", type: "number", default: "60000" },
  { key: "proxyType", label: "Proxy type", type: "select", default: "none", options: ["none", "http", "https", "socks5", "socks4"] },
  { key: "proxyHost", label: "Proxy host", type: "text", default: "" },
  { key: "proxyPort", label: "Proxy port", type: "number", default: "" },
  { key: "proxyUsername", label: "Proxy username", type: "text", default: "" },
  { key: "proxyPassword", label: "Proxy password", type: "password", default: "" },
  { key: "proxyDns", label: "Proxy DNS", type: "toggle", default: "true" },
];
