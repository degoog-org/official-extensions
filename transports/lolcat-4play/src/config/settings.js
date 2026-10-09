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
  Math.max(
    MIN_TIMEOUT_MS,
    Math.min(MAX_TIMEOUT_MS, Number(value) || DEFAULT_TIMEOUT_MS),
  );

export const clampPoolSize = (value) =>
  Math.max(MIN_POOL_SIZE, parseInt(value, 10) || DEFAULT_POOL_SIZE);

export const toContainerTtlMs = (value) => {
  const h = parseFloat(value);
  return !isNaN(h) && h > 0
    ? h * 60 * 60 * 1000
    : DEFAULT_CONTAINER_TTL_H * 60 * 60 * 1000;
};

export const toMinutesMs = (value, fallbackMinutes) => {
  const minutes = parseFloat(value);
  return !isNaN(minutes) && minutes > 0
    ? minutes * 60 * 1000
    : fallbackMinutes * 60 * 1000;
};

export const clampSettleMs = (value) =>
  Math.max(0, Math.min(10000, Number(value) || DEFAULT_WARMUP_SETTLE_MS));

export const toAutoWarmMs = (value) => {
  const hours = parseFloat(value);
  return !isNaN(hours) && hours > 0 ? hours * 60 * 60 * 1000 : 0;
};

export const clampFlareMs = (value) =>
  Math.max(
    MIN_FLARE_TIMEOUT_MS,
    Math.min(MAX_FLARE_TIMEOUT_MS, Number(value) || DEFAULT_FLARE_TIMEOUT_MS),
  );

export const normaliseSettings = (settings = {}) => ({
  timeoutMs: clampTimeout(settings.timeout),
  maxPoolSize: clampPoolSize(settings.maxPoolSize),
  containerTtlMs: toContainerTtlMs(settings.containerTtl),
  useContainer:
    settings.useContainer !== false && settings.useContainer !== "false",
  proxyType: PROXY_TYPES.includes(settings.proxyType)
    ? settings.proxyType
    : "none",
  proxyHost: (settings.proxyHost || "").trim(),
  proxyPort: parseInt(settings.proxyPort, 10) || 1080,
  proxyUsername: (settings.proxyUsername || "").trim(),
  proxyPassword: (settings.proxyPassword || "").trim(),
  proxyDns: settings.proxyDns !== false && settings.proxyDns !== "false",
  password: typeof settings.password === "string" ? settings.password : "",
  warmupQuery:
    String(settings.warmupQuery || DEFAULT_WARMUP_QUERY).trim() ||
    DEFAULT_WARMUP_QUERY,
  warmupTtlMs: toMinutesMs(settings.warmupTtl, DEFAULT_WARMUP_TTL_M),
  blockCooldownMs: toMinutesMs(
    settings.blockCooldown,
    DEFAULT_BLOCK_COOLDOWN_M,
  ),
  warmupSettleMs: clampSettleMs(settings.warmupSettle),
  autoWarmMs: toAutoWarmMs(settings.autoWarmInterval),
  flaresolverrUrl: (settings.flaresolverrUrl || "").trim(),
  flaresolverrTimeoutMs: clampFlareMs(settings.flaresolverrTimeout),
});

export const containerConfigKey = (settings) =>
  JSON.stringify({
    useContainer: settings.useContainer,
    proxyType: settings.proxyType,
    proxyHost: settings.proxyHost,
    proxyPort: settings.proxyPort,
    proxyDns: settings.proxyDns,
  });

const proxyCredentials = (settings) =>
  JSON.stringify([settings.proxyUsername, settings.proxyPassword]);

export const proxyChanged = (before, after) =>
  containerConfigKey(before) !== containerConfigKey(after) ||
  proxyCredentials(before) !== proxyCredentials(after);

export const settingsSchemaFor = (transportName) => [
  {
    key: "containerMath",
    label: "How many containers you need",
    type: "info",
    description: [
      "Every site gets its own Firefox container per proxy, so cookies never move between IPs. **Containers needed = sites x proxies.** Google web, images and videos count as one site, and no proxies in Settings -> Server -> Proxy counts as one. 5 proxies and 4 sites need 20.",
      "",
      "Below that, 4play recycles the idle container used least recently and warms it again on its next search. You can raise the limit, it'll use a bit more ram but tabs closes after warmup and an idle container should only count for cookies and storage. The background warmup will re-warm every container each interval.",
    ].join("\n"),
  },
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
      "Becomes the last segment of the WebSocket path, so password 'cnc' gives ws://host:4444/ws/lolcat-4play-transport/cnc. Use the same one in the extension popup.",
  },
  {
    key: "timeout",
    label: "Page load timeout (ms)",
    type: "number",
    placeholder: String(DEFAULT_TIMEOUT_MS),
    description: `How long to wait for a page to load, ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS} ms.`,
  },
  {
    key: "useContainer",
    label: "Container isolation",
    type: "toggle",
    default: "true",
    description:
      "Gives each search origin, like google.com or bing.com, its own Firefox container. Its cookies and any solved CAPTCHA stay in that container for later requests, so you solve a challenge once. Changing proxy settings resets the containers. Turn off only if you don't need cookies kept apart per origin.",
  },
  {
    key: "maxPoolSize",
    label: "Max containers",
    type: "number",
    placeholder: String(DEFAULT_POOL_SIZE),
    description: `How many containers can exist at once, minimum ${MIN_POOL_SIZE}. Set it to at least sites x proxies, see "How many containers you need" at the top. At the limit, the transport recycles the idle container used least recently.`,
    visibleWhen: {
      anyOf: [
        { key: "useContainer", equals: "true" },
        { key: "proxyType", notEquals: "none" },
      ],
    },
  },
  {
    key: "containerTtl",
    label: "Container TTL (hours)",
    type: "number",
    placeholder: String(DEFAULT_CONTAINER_TTL_H),
    description:
      "Hours a container lives before the transport recycles it. Longer helps avoid detection. Default 24.",
    visibleWhen: {
      anyOf: [
        { key: "useContainer", equals: "true" },
        { key: "proxyType", notEquals: "none" },
      ],
    },
  },
  {
    key: "warmupQuery",
    label: "Origin warmup search query",
    type: "text",
    placeholder: DEFAULT_WARMUP_QUERY,
    description:
      "Before the real request, warmup types this harmless query into the search box on the origin's homepage. Works without engine-specific rules.",
  },
  {
    key: "warmupTtl",
    label: "Origin warmup TTL (minutes)",
    type: "number",
    placeholder: String(DEFAULT_WARMUP_TTL_M),
    description:
      "Minutes a warmed session counts as warm for its origin before the transport warms it again.",
  },
  {
    key: "blockCooldown",
    label: "Blocked session cooldown (minutes)",
    type: "number",
    placeholder: String(DEFAULT_BLOCK_COOLDOWN_M),
    description:
      "After a CAPTCHA or bot check, the transport marks that origin's session as blocked for this long rather than returning an empty result list.",
  },
  {
    key: "warmupSettle",
    label: "Warmup settle delay (ms)",
    type: "number",
    placeholder: String(DEFAULT_WARMUP_SETTLE_MS),
    description:
      "Pause after warmup navigation so cookies and session scripts can finish before the real request.",
  },
  {
    key: "autoWarmInterval",
    label: "Background warmup interval (hours)",
    type: "number",
    placeholder: "0",
    description:
      "Every N hours, re-warms the origins the transport has already handled, so sessions are ready before anyone searches. 72 means every 3 days, 0 turns it off. To keep an origin warm the whole time, set this at or below the warmup TTL. A larger value leaves cold gaps.",
  },
  {
    key: "flaresolverrUrl",
    label: "FlareSolverr URL",
    type: "text",
    placeholder: "http://127.0.0.1:8191/v1",
    description:
      "Optional. On a CAPTCHA or bot check, the transport asks this FlareSolverr instance to clear JavaScript challenges like Cloudflare's before it opens a tab for you. FlareSolverr gets the same proxy settings. It can't solve image CAPTCHAs. Leave blank to turn off.",
  },
  {
    key: "flaresolverrTimeout",
    label: "FlareSolverr timeout (ms)",
    type: "number",
    placeholder: String(DEFAULT_FLARE_TIMEOUT_MS),
    description: `How long FlareSolverr gets to solve a challenge, ${MIN_FLARE_TIMEOUT_MS} to ${MAX_FLARE_TIMEOUT_MS} ms.`,
    visibleWhen: { key: "flaresolverrUrl", notEquals: "" },
  },
  {
    key: "proxyType",
    label: "Proxy type (deprecated)",
    type: "select",
    options: ["none", ...PROXY_TYPES],
    default: "none",
    description:
      "Deprecated, set proxies in Settings -> Server -> Proxy instead. When degoog picks a proxy for a search, 4play uses that one and gives every site and proxy pair its own container. This proxy is only used for engines degoog sends without one.",
  },
  {
    key: "proxyHost",
    label: "Proxy host",
    type: "text",
    placeholder: "127.0.0.1",
    description: "Proxy server hostname or IP address.",
    visibleWhen: { key: "proxyType", equals: PROXY_TYPES },
  },
  {
    key: "proxyPort",
    label: "Proxy port",
    type: "number",
    placeholder: "1080",
    description: "Proxy server port.",
    visibleWhen: { key: "proxyType", equals: PROXY_TYPES },
  },
  {
    key: "proxyUsername",
    label: "Proxy username",
    type: "text",
    description: "Optional proxy username.",
    visibleWhen: { key: "proxyType", equals: PROXY_TYPES },
  },
  {
    key: "proxyPassword",
    label: "Proxy password",
    type: "password",
    description: "Optional proxy password.",
    visibleWhen: { key: "proxyType", equals: PROXY_TYPES },
  },
  {
    key: "proxyDns",
    label: "Proxy DNS",
    type: "toggle",
    default: "true",
    description:
      "Sends DNS lookups through the proxy. Keep it on for SOCKS so DNS doesn't leak.",
    visibleWhen: { key: "proxyType", equals: ["socks5", "socks4"] },
  },
];
