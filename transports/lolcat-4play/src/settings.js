export const FETCH_TIMEOUT_MS = 30000;
export const DEFAULT_TIMEOUT_MS = 30000;
export const MIN_TIMEOUT_MS = 5000;
export const MAX_TIMEOUT_MS = 120000;
export const PROXY_TYPES = ["socks5", "socks4", "http", "https"];
export const MAX_CONTAINER_POOL_SIZE = 5;
export const DEFAULT_POOL_SIZE = 5;
export const MIN_POOL_SIZE = 1;
export const DEFAULT_CONTAINER_TTL_H = 24;
export const DEFAULT_WARMUP_TTL_M = 60;
export const DEFAULT_BLOCK_COOLDOWN_M = 20;
export const DEFAULT_WARMUP_SETTLE_MS = 1500;
export const DEFAULT_WARMUP_QUERY = "weather";

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

export const normaliseSettings = (settings = {}) => ({
  timeoutMs: clampTimeout(settings.timeout),
  maxPoolSize: clampPoolSize(settings.maxPoolSize),
  containerTtlMs: toContainerTtlMs(settings.containerTtl),
  useContainer: settings.useContainer !== "false",
  proxyType: PROXY_TYPES.includes(settings.proxyType) ? settings.proxyType : "none",
  proxyHost: (settings.proxyHost || "").trim(),
  proxyPort: parseInt(settings.proxyPort, 10) || 1080,
  proxyUsername: (settings.proxyUsername || "").trim(),
  proxyPassword: (settings.proxyPassword || "").trim(),
  proxyDns: settings.proxyDns !== "false",
  password: typeof settings.password === "string" ? settings.password : "",
  warmupQuery: String(settings.warmupQuery || DEFAULT_WARMUP_QUERY).trim() || DEFAULT_WARMUP_QUERY,
  warmupTtlMs: toMinutesMs(settings.warmupTtl, DEFAULT_WARMUP_TTL_M),
  blockCooldownMs: toMinutesMs(settings.blockCooldown, DEFAULT_BLOCK_COOLDOWN_M),
  warmupSettleMs: clampSettleMs(settings.warmupSettle),
});

export const containerConfigKey = (settings) =>
  JSON.stringify({
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
      "Open each request in an isolated Firefox container. Containers are reused from a warm pool and reset whenever proxy settings change. Disable only if you do not care about cookie isolation.",
  },
  {
    key: "maxPoolSize",
    label: "Max container pool size",
    type: "number",
    placeholder: String(DEFAULT_POOL_SIZE),
    description: `Maximum number of warm containers to keep alive concurrently (minimum ${MIN_POOL_SIZE}). Requests beyond this limit queue until a container is free.`,
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
      "Automatic per-origin browser warmup tries this harmless query through a discovered homepage search box before the real request. No engine changes or Google-specific rules are required.",
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
