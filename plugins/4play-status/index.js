import { readdir } from "fs/promises";
import { dirname, join } from "path";

const AUTH_PATH = "/api/settings/auth";
const TRANSPORT_TEST_PATH = "/api/extensions/transports";
const TRANSPORT_LIST_PATH = "/api/extensions?type=transports";
const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
const CONTROL_TTL_MS = 60 * 1000;
const KNOWN_NAMESPACE = "4play-status:transports";
const KNOWN_KEY = "list";
const KNOWN_TTL_MS = 24 * 60 * 60 * 1000;
const KNOWN_REFRESH_MS = 60 * 1000;
const TRANSPORT_SUFFIX = "-transport";
const TRIGGER = "4play";
const CLEAR_SCOPES = ["all", "session", "captcha"];

let template = "";
let useCacheFn = null;
let firefoxUrl = "";
let accessMode = "admin";
let pluginApiBase = "";
let pluginDir = "";
let transportChoice = "";
let knownTransports = [];
let knownCheckedAt = 0;

const log = (msg) => {
  console.warn(`[4play-status] ${msg}`);
};

const statusCacheFor = (name) =>
  useCacheFn ? useCacheFn(`transport:${name}:status`, STATUS_TTL_MS) : null;

const controlCacheFor = (name) =>
  useCacheFn ? useCacheFn(`transport:${name}:control`, CONTROL_TTL_MS) : null;

const knownCache = () =>
  useCacheFn ? useCacheFn(KNOWN_NAMESPACE, KNOWN_TTL_MS) : null;

const DEFAULT_PORT = 4444;

const apiBaseFor = (reqUrl) => {
  const url = new URL(reqUrl);
  const base = url.pathname.split("/api/plugin/")[0];
  return `${url.origin}${base}`;
};

const loopbackBase = (reqUrl) => {
  const port = Number(process.env.DEGOOG_PORT) || DEFAULT_PORT;
  const base = new URL(reqUrl).pathname.split("/api/plugin/")[0];
  return `http://127.0.0.1:${port}${base}`;
};

const selfBases = (reqUrl) => [loopbackBase(reqUrl), apiBaseFor(reqUrl)];

const overSelf = async (req, run) => {
  let lastError = null;
  for (const base of selfBases(req.url)) {
    try {
      return await run(base);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("no reachable api base");
};

const SETTINGS_TOKEN_COOKIE = "settings-token";

const tokenFromCookie = (req) => {
  const raw = req.headers.get("cookie");
  if (!raw) return "";

  const match = raw
    .split(";")
    .find((part) => part.trim().startsWith(`${SETTINGS_TOKEN_COOKIE}=`));
  return match?.split("=")[1]?.trim() || "";
};

const tokenFromHeader = (req) => req.headers.get("x-settings-token") || "";

const tokenCandidates = (req) =>
  [tokenFromCookie(req), tokenFromHeader(req)].filter(Boolean);

const authHeadersForToken = (token) => {
  return token ? { "x-settings-token": token } : {};
};

const authHeaders = (req) => authHeadersForToken(tokenCandidates(req)[0] || "");

const VERDICT = Object.freeze({
  GRANTED: "granted",
  DENIED: "denied",
  UNREACHABLE: "unreachable",
});

const askAuth = async (base, req, token) => {
  const cookie = req.headers.get("cookie");
  const res = await fetch(`${base}${AUTH_PATH}`, {
    headers: {
      Accept: "application/json",
      ...(cookie ? { cookie } : {}),
      ...authHeadersForToken(token),
    },
  });
  if (!res.ok) return false;
  if (!(res.headers.get("content-type") || "").includes("application/json")) return false;
  const data = await res.json().catch(() => null);
  return data?.valid === true;
};

const gandalfVerdict = async (req) => {
  const candidates = tokenCandidates(req);
  const tokens = candidates.length > 0 ? candidates : [""];
  let reached = false;

  for (const base of selfBases(req.url)) {
    for (const token of tokens) {
      try {
        if (await askAuth(base, req, token)) return VERDICT.GRANTED;
        reached = true;
      } catch (error) {
        log(`auth check via ${base} failed: ${error?.message || error}`);
      }
    }
    if (reached) break;
  }

  return reached ? VERDICT.DENIED : VERDICT.UNREACHABLE;
};

const accessDecision = async (req) => {
  if (accessMode === "open") return { ok: true };
  if (accessMode === "locked") return { ok: false, status: 403 };

  const verdict = await gandalfVerdict(req);
  if (verdict === VERDICT.GRANTED) return { ok: true };
  if (verdict === VERDICT.UNREACHABLE) {
    return {
      ok: false,
      status: 503,
      error: "could not reach the settings auth endpoint to verify admin access",
    };
  }
  return { ok: false, status: 401, error: "You shall not pass!" };
};

const transportIdFor = (folderName) => {
  const lower = folderName.toLowerCase();
  return lower.endsWith(TRANSPORT_SUFFIX) ? lower : `${lower}${TRANSPORT_SUFFIX}`;
};

const rememberTransports = async (items) => {
  knownTransports = items;
  knownCheckedAt = Date.now();
  try {
    await knownCache()?.set(KNOWN_KEY, items, KNOWN_TTL_MS);
  } catch (error) {
    log(`failed to cache transport list: ${error?.message || error}`);
  }
};

const loadKnownList = async () => {
  try {
    const cached = await knownCache()?.get(KNOWN_KEY);
    if (Array.isArray(cached) && cached.length > 0) {
      knownTransports = cached;
      return;
    }
  } catch (error) {
    log(`failed to read cached transport list: ${error?.message || error}`);
  }
  await scanTransports();
};

const scanTransports = async () => {
  if (!pluginDir) return;
  try {
    const dir = join(dirname(dirname(pluginDir)), "transports");
    const entries = await readdir(dir, { withFileTypes: true });
    const items = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ id: transportIdFor(entry.name), label: entry.name }));
    if (items.length > 0) knownTransports = items;
  } catch (error) {
    log(`could not scan the transports folder: ${error?.message || error}`);
  }
};

const pullList = async (base, headers = {}) => {
  const res = await fetch(`${base}${TRANSPORT_LIST_PATH}`, {
    headers: { Accept: "application/json", ...headers },
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const data = await res.json().catch(() => null);
  const items = Array.isArray(data?.transports) ? data.transports : [];
  return items
    .filter((item) => typeof item?.id === "string")
    .map((item) => ({ id: item.id, label: item.displayName || item.id }));
};

const refreshKnown = async (req) => {
  if (Date.now() - knownCheckedAt < KNOWN_REFRESH_MS) return;
  try {
    await rememberTransports(
      await overSelf(req, (base) => pullList(base, authHeaders(req))),
    );
  } catch (error) {
    log(`transport list refresh failed: ${error?.message || error}`);
  }
};

const defaultTransport = () => {
  const match = knownTransports.find(
    (item) =>
      item.id.toLowerCase().includes(TRIGGER) ||
      item.label.toLowerCase().includes(TRIGGER),
  );
  return match?.id || "";
};

const transportField = () => {
  if (knownTransports.length === 0) {
    return {
      key: "transportName",
      label: "4play transport",
      type: "info",
      description:
        "The transport list is not loaded yet. Reopen this dialog in a few seconds, or run !4play once, and this becomes a dropdown of your installed transports.",
    };
  }
  return transportSelect();
};

const orderedTransports = () => {
  const preferred = defaultTransport();
  if (!preferred) return knownTransports;
  return [
    ...knownTransports.filter((item) => item.id === preferred),
    ...knownTransports.filter((item) => item.id !== preferred),
  ];
};

const transportSelect = () => {
  const ordered = orderedTransports();
  return {
    key: "transportName",
    label: "4play transport",
    type: "select",
    options: ordered.map((item) => item.id),
    optionLabels: ordered.map((item) => `${item.label} (${item.id})`),
    default: defaultTransport(),
    description:
      "Which installed transport this card reports on. It defaults to the first installed transport whose name mentions 4play. Change it if you run a renamed or third-party 4play transport.",
  };
};

const publishedStatus = async (name) => {
  const cache = statusCacheFor(name);
  if (!cache) return null;
  try {
    return await cache.get("current");
  } catch (error) {
    log(`status read failed for ${name}: ${error?.message || error}`);
    return null;
  }
};

const resolveTransport = async () => {
  const candidates = knownTransports.map((item) => item.id);
  const name = transportChoice || defaultTransport();
  if (!name) {
    log("no transport selected and no installed transport mentions 4play");
    return { name: null, status: null, candidates };
  }
  return { name, status: await publishedStatus(name), candidates };
};

const jsonResponse = (payload, status) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const statusHandler = async (req) => {
  const access = await accessDecision(req);
  if (!access.ok) {
    return jsonResponse({ error: access.error }, access.status);
  }
  if (!useCacheFn) {
    log("useCache was never provided by the app; cannot read transport status");
    return jsonResponse({ error: "cache unavailable" }, 503);
  }

  await refreshKnown(req);

  const resolved = await resolveTransport();
  if (!resolved.name) {
    return jsonResponse(
      {
        ok: true,
        transport: null,
        status: null,
        candidates: resolved.candidates,
        firefoxUrl,
        hint: "No 4play transport picked yet. Choose one in this plugin's settings.",
      },
      200,
    );
  }

  const hint = resolved.status
    ? null
    : "Transport found but it has not published a status yet. The app only hands transports a cache handle on their first fetch; run the test below or search through it once.";

  return jsonResponse(
    {
      ok: true,
      transport: resolved.name,
      status: resolved.status,
      candidates: resolved.candidates,
      firefoxUrl,
      hint,
    },
    200,
  );
};

const pingHandler = async (req) => {
  const access = await accessDecision(req);
  if (!access.ok) {
    return jsonResponse({ error: access.error }, access.status);
  }

  const resolved = await resolveTransport();
  if (!resolved.name) {
    return jsonResponse({ error: "no 4play transport found" }, 404);
  }

  try {
    const res = await overSelf(req, (base) =>
      fetch(
        `${base}${TRANSPORT_TEST_PATH}/${encodeURIComponent(resolved.name)}/test`,
        { method: "POST", headers: authHeaders(req) },
      ),
    );
    const data = await res.json().catch(() => ({}));
    log(
      `wake fetch through ${resolved.name}: ${data?.ok ? "ok" : `failed (${data?.message || res.status})`}`,
    );
    return jsonResponse(
      { ok: Boolean(data?.ok), transport: resolved.name, message: data?.message || null },
      200,
    );
  } catch (error) {
    log(`wake fetch through ${resolved.name} failed: ${error?.message || error}`);
    return jsonResponse({ error: "wake fetch failed" }, 502);
  }
};

const clearHandler = async (req) => {
  const access = await accessDecision(req);
  if (!access.ok) {
    return jsonResponse({ error: access.error }, access.status);
  }
  if (!useCacheFn) {
    return jsonResponse({ error: "cache unavailable" }, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }

  const scope = String(body?.scope || "");
  const key = typeof body?.key === "string" ? body.key : null;
  const tabId = Number.isInteger(body?.tabId) ? body.tabId : null;
  if (!CLEAR_SCOPES.includes(scope) || (scope === "session" && !key)) {
    return jsonResponse(
      { error: "expected {scope:\"all\"}, {scope:\"session\", key} or {scope:\"captcha\", tabId?}" },
      400,
    );
  }

  const resolved = await resolveTransport();
  if (!resolved.name) {
    return jsonResponse({ error: "no 4play transport found" }, 404);
  }

  const request = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scope,
  };
  if (key) request.key = key;
  if (scope === "captcha" && tabId !== null) request.tabId = tabId;

  try {
    await controlCacheFor(resolved.name).set("request", request, CONTROL_TTL_MS);
    log(`queued clear (${scope}) for ${resolved.name}`);
  } catch (error) {
    log(`failed to queue clear request: ${error?.message || error}`);
    return jsonResponse({ error: "failed to queue clear request" }, 500);
  }
  return jsonResponse({ ok: true, transport: resolved.name }, 200);
};

export default {
  isClientExposed: false,
  name: "4play status",
  description:
    "Shows the live status of the 4play transport (connection, warmed origins, blocked sessions, open captchas). Admin only.",
  trigger: TRIGGER,
  aliases: ["fourplay"],

  get settingsSchema() {
    return [
      {
        key: "accessMode",
        label: "Status view access",
        type: "select",
        options: ["admin", "open", "locked"],
        default: "admin",
        description:
          "admin requires a valid settings/admin session, open lets anyone who can run the bang view and clear 4play status, and locked disables the status API for everyone.",
      },
      transportField(),
      {
        key: "firefoxUrl",
        label: "Firefox browser link",
        type: "text",
        default: "",
        description:
          "Link to the Firefox instance running the 4play extension (e.g. a remote-desktop/VNC/noVNC URL like http://192.168.86.233:6080, or any URL that opens that browser). When set, the status card shows an 'Open Firefox' button and a jump link next to every captcha that needs attention, so you can hop straight over to solve it. Firefox cannot be deep-linked to a specific tab from outside, so this opens the browser and you pick the flagged tab.",
      },
    ];
  },

  routes: [
    { method: "get", path: "/status", handler: statusHandler },
    { method: "post", path: "/ping", handler: pingHandler },
    { method: "post", path: "/clear", handler: clearHandler },
  ],

  init(ctx) {
    template = ctx.template;
    useCacheFn = ctx.useCache;
    pluginApiBase = ctx.apiBase || "";
    pluginDir = ctx.dir || "";
    loadKnownList();
  },

  configure(settings) {
    const mode = String(settings?.accessMode || "admin").trim();
    accessMode = ["admin", "open", "locked"].includes(mode) ? mode : "admin";
    transportChoice = String(settings?.transportName || "").trim();
    firefoxUrl = String(settings?.firefoxUrl || "").trim();
  },

  execute() {
    return {
      title: "4play status",
      html: template.replace("{{apiBase}}", pluginApiBase),
    };
  },
};
