export const FETCH_TIMEOUT_MS = 30000;
export const DEFAULT_TIMEOUT_MS = 30000;
export const MIN_TIMEOUT_MS = 5000;
export const MAX_TIMEOUT_MS = 120000;
export const PROXY_TYPES = ["socks5", "socks4", "http", "https"];
export const MAX_CONTAINER_POOL_SIZE = 10;
export const DEFAULT_POOL_SIZE = 10;
export const MIN_POOL_SIZE = 1;
export const DEFAULT_CONTAINER_TTL_H = 24;
export const DEFAULT_WARMUP_TTL_M = 60;
export const DEFAULT_BLOCK_COOLDOWN_M = 20;
export const DEFAULT_WARMUP_SETTLE_MS = 1500;
export const DEFAULT_WARMUP_QUERY = "weather";
export const DEFAULT_AUTO_WARM_H = 0;
export const DEFAULT_FLARE_TIMEOUT_MS = 60000;
export const MIN_FLARE_TIMEOUT_MS = 10000;
export const MAX_FLARE_TIMEOUT_MS = 180000;

export const clampTimeout = (value) =>
  Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Number(value) || DEFAULT_TIMEOUT_MS));

export const clampPoolSize = (value) =>
  Math.max(MIN_POOL_SIZE, parseInt(value, 10) || DEFAULT_POOL_SIZE);

export const toContainerTtlMs = (value) => {
  const h = parseFloat(value);
  return !isNaN(h) && h > 0 ? h * 60 * 60 * 1000 : DEFAULT_CONTAINER_TTL_H * 60 * 60 * 1000;
};

export const toMinutesMs = (value, fallbackMinutes) => {
  const minutes = parseFloat(value);
  return !isNaN(minutes) && minutes > 0 ? minutes * 60 * 1000 : fallbackMinutes * 60 * 1000;
};

export const clampSettleMs = (value) =>
  Math.max(0, Math.min(10000, Number(value) || DEFAULT_WARMUP_SETTLE_MS));

export const toAutoWarmMs = (value) => {
  const hours = parseFloat(value);
  return !isNaN(hours) && hours > 0 ? hours * 60 * 60 * 1000 : 0;
};

export const clampFlareMs = (value) =>
  Math.max(MIN_FLARE_TIMEOUT_MS, Math.min(MAX_FLARE_TIMEOUT_MS, Number(value) || DEFAULT_FLARE_TIMEOUT_MS));

export const parseTriggers = (value) => {
  let rows = value;
  if (typeof value === "string") {
    try {
      rows = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      trigger: String(row?.trigger || "").trim(),
      engine: String(row?.engine || "").trim(),
    }))
    .filter((row) => row.trigger && row.engine);
};

export const normaliseSettings = (settings = {}) => ({
  timeoutMs: clampTimeout(settings.timeout),
  maxPoolSize: clampPoolSize(settings.maxPoolSize),
  containerTtlMs: toContainerTtlMs(settings.containerTtl),
  useContainer: settings.useContainer !== false && settings.useContainer !== "false",
  proxyType: PROXY_TYPES.includes(settings.proxyType) ? settings.proxyType : "none",
  proxyHost: (settings.proxyHost || "").trim(),
  proxyPort: parseInt(settings.proxyPort, 10) || 1080,
  proxyUsername: (settings.proxyUsername || "").trim(),
  proxyPassword: (settings.proxyPassword || "").trim(),
  proxyDns: settings.proxyDns !== false && settings.proxyDns !== "false",
  password: typeof settings.password === "string" ? settings.password : "",
  warmupQuery: String(settings.warmupQuery || DEFAULT_WARMUP_QUERY).trim() || DEFAULT_WARMUP_QUERY,
  warmupTtlMs: toMinutesMs(settings.warmupTtl, DEFAULT_WARMUP_TTL_M),
  blockCooldownMs: toMinutesMs(settings.blockCooldown, DEFAULT_BLOCK_COOLDOWN_M),
  warmupSettleMs: clampSettleMs(settings.warmupSettle),
  autoWarmMs: toAutoWarmMs(settings.autoWarmInterval),
  flaresolverrUrl: (settings.flaresolverrUrl || "").trim(),
  flaresolverrTimeoutMs: clampFlareMs(settings.flaresolverrTimeout),
  rawHtmlFromTab: settings.rawHtmlFromTab === true || settings.rawHtmlFromTab === "true",
  triggers: parseTriggers(settings.triggers),
});

export const containerConfigKey = (settings) =>
  JSON.stringify({
    useContainer: settings.useContainer,
    proxyType: settings.proxyType,
    proxyHost: settings.proxyHost,
    proxyPort: settings.proxyPort,
    proxyUsername: settings.proxyUsername,
    proxyPassword: settings.proxyPassword,
    proxyDns: settings.proxyDns,
  });

export const settingsSchemaFor = (transportName) => [
  {
    key: "wsUrl",
    label: "WebSocket path",
    type: "info",
    default: `/ws/${transportName}`,
  },
  {
    key: "password",
    label: "Password",
    type: "password",
    default: "",
    description:
      "Acts as the WebSocket path segment (e.g. password 'cnc' -> ws://host:4444/ws/lolcat-4play-transport/cnc). Must match what you set in the extension popup.",
  },
  {
    key: "timeout",
    label: "Page load timeout (ms)",
    type: "number",
    placeholder: String(DEFAULT_TIMEOUT_MS),
    description: `Maximum time to wait for a page to fully load (${MIN_TIMEOUT_MS}-${MAX_TIMEOUT_MS} ms).`,
  },
  {
    key: "useContainer",
    label: "Container isolation",
    type: "toggle",
    default: "true",
    description:
      "Give every search origin (google.com, bing.com, startpage.com, ...) its own dedicated, isolated Firefox container. Each origin's cookies, session and any solved CAPTCHA stay pinned to that one container and are reused for every later request to the same origin, so you only solve a challenge once. Containers are reset whenever proxy settings change. Disable only if you do not care about per-origin cookie isolation.",
  },
  {
    key: "maxPoolSize",
    label: "Max containers (one per origin)",
    type: "number",
    placeholder: String(DEFAULT_POOL_SIZE),
    description: `How many origins can hold a dedicated container at once (minimum ${MIN_POOL_SIZE}). One container is reserved per search origin and reused across all its requests; when this limit is reached the least-recently-used idle origin's container is recycled to make room. Set this at or above the number of search engines you route through 4play.`,
  },
  {
    key: "containerTtl",
    label: "Container TTL (hours)",
    type: "number",
    placeholder: String(DEFAULT_CONTAINER_TTL_H),
    description: "How long a container lives before being recycled (in hours). Longer is better for avoiding detection. Default is 24 hours.",
  },
  {
    key: "warmupQuery",
    label: "Origin warmup search query",
    type: "text",
    placeholder: DEFAULT_WARMUP_QUERY,
    description:
      "Automatic per-origin browser warmup tries this harmless query through a discovered homepage search box before the real request. No engine-specific rules are required.",
  },
  {
    key: "warmupTtl",
    label: "Origin warmup TTL (minutes)",
    type: "number",
    placeholder: String(DEFAULT_WARMUP_TTL_M),
    description:
      "How long a browser/container session is considered warmed for the same origin before refreshing it.",
  },
  {
    key: "blockCooldown",
    label: "Blocked session cooldown (minutes)",
    type: "number",
    placeholder: String(DEFAULT_BLOCK_COOLDOWN_M),
    description:
      "When a CAPTCHA or bot-check page is detected, this origin/session is tainted for this long instead of returning fake zero results.",
  },
  {
    key: "warmupSettle",
    label: "Warmup settle delay (ms)",
    type: "number",
    placeholder: String(DEFAULT_WARMUP_SETTLE_MS),
    description:
      "Short pause after homepage/form warmup navigation so browser-set cookies and session scripts can settle before the real request.",
  },
  {
    key: "autoWarmInterval",
    label: "Background warmup interval (hours)",
    type: "number",
    placeholder: "0",
    description:
      "Keep sessions ready without waiting for a user search. Every N hours the transport re-warms the origins it has already handled (e.g. 72 = every 3 days). 0 disables it. For an origin to stay continuously warm, set this at or below the warmup TTL above; a larger value still leaves a cold gap between refreshes.",
  },
  {
    key: "rawHtmlFromTab",
    label: "Always fetch raw HTML from a browser tab",
    type: "toggle",
    default: "false",
    description:
      "When on, origin warmup still runs but every fetch opens a real Firefox tab and returns the site's raw base64 HTML response captured through 4play, instead of replaying the warmed session with curl. Slower and more visible, but the response matches exactly what Firefox received.",
  },
  {
    key: "triggers",
    label: "Firefox search triggers",
    type: "list",
    addLabel: "+ Add trigger",
    description:
      "Map a Firefox search engine to a Degoog engine id. When that engine runs a search through this transport, the transport opens a Firefox tab, runs the query through that Firefox search engine (via browser.search), and returns the page's raw HTML. A configured row is active for its engine, no toggle needed. The trigger must be the Firefox search engine's exact name (e.g. 'Bing', 'Google', 'DuckDuckGo') or an '@keyword' you have assigned it under Firefox Settings -> Search. The engine field must match the Degoog engine id exactly (e.g. 'google', or a store engine id like 'author-repo-engine'). Requires the degoog fork of the 4play extension (it adds the 'search_query' command). Leave the list empty to keep the normal warmed-session behaviour.",
    itemSchema: [
      { key: "trigger", label: "Firefox engine name (e.g. Bing) or @keyword", type: "text" },
      { key: "engine", label: "Engine id (e.g. google)", type: "text" },
    ],
  },
  {
    key: "flaresolverrUrl",
    label: "FlareSolverr URL",
    type: "text",
    placeholder: "http://127.0.0.1:8191/v1",
    description:
      "Optional. When a CAPTCHA/bot-check is hit, try this FlareSolverr instance first to clear JavaScript challenges (e.g. Cloudflare) before falling back to opening a manual browser tab. The transport's proxy settings are forwarded to FlareSolverr. Leave blank to disable. Note: only solves automated JS challenges, not interactive image CAPTCHAs.",
  },
  {
    key: "flaresolverrTimeout",
    label: "FlareSolverr timeout (ms)",
    type: "number",
    placeholder: String(DEFAULT_FLARE_TIMEOUT_MS),
    description: `How long FlareSolverr may spend solving a challenge (${MIN_FLARE_TIMEOUT_MS}-${MAX_FLARE_TIMEOUT_MS} ms).`,
  },
  {
    key: "proxyType",
    label: "Proxy type",
    type: "select",
    options: ["none", ...PROXY_TYPES],
    default: "none",
    description:
      "Proxy protocol to attach to the container. Enabling any proxy type turns on container isolation automatically.",
  },
  {
    key: "proxyHost",
    label: "Proxy host",
    type: "text",
    placeholder: "127.0.0.1",
    description: "Proxy server hostname or IP address.",
  },
  {
    key: "proxyPort",
    label: "Proxy port",
    type: "number",
    placeholder: "1080",
    description: "Proxy server port.",
  },
  {
    key: "proxyUsername",
    label: "Proxy username",
    type: "text",
    description: "Optional proxy username.",
  },
  {
    key: "proxyPassword",
    label: "Proxy password",
    type: "password",
    description: "Optional proxy password.",
  },
  {
    key: "proxyDns",
    label: "Proxy DNS",
    type: "toggle",
    default: "true",
    description: "Route DNS lookups through the proxy. Recommended for SOCKS to avoid DNS leaks.",
  },
];
