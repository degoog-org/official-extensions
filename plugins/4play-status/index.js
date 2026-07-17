const AUTH_PATH = "/api/settings/auth";
const TRANSPORT_TEST_PATH = "/api/extensions/transports";
const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
const CONTROL_TTL_MS = 60 * 1000;
const DISCOVERY_NAMESPACE = "transport:4play:discovery";
const DISCOVERY_KEY = "names";
const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000;
const CLEAR_SCOPES = ["all", "session", "captcha"];

let template = "";
let useCacheFn = null;
let transportOverride = "";
let firefoxUrl = "";
let accessMode = "admin";
let pluginApiBase = "";

const log = (msg) => {
  console.warn(`[4play-status] ${msg}`);
};

const statusCacheFor = (name) =>
  useCacheFn ? useCacheFn(`transport:${name}:status`, STATUS_TTL_MS) : null;

const controlCacheFor = (name) =>
  useCacheFn ? useCacheFn(`transport:${name}:control`, CONTROL_TTL_MS) : null;

const discoveryCache = () =>
  useCacheFn ? useCacheFn(DISCOVERY_NAMESPACE, DISCOVERY_TTL_MS) : null;

const apiBaseFor = (reqUrl) => {
  const url = new URL(reqUrl);
  const base = url.pathname.split("/api/plugin/")[0];
  return `${url.origin}${base}`;
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

const gandalfSaysYes = async (req) => {
  try {
    const candidates = tokenCandidates(req);
    if (candidates.length === 0) return false;
    for (const token of candidates) {
      const res = await fetch(`${apiBaseFor(req.url)}${AUTH_PATH}`, {
        headers: { Accept: "application/json", ...authHeadersForToken(token) },
      });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) continue;
      const data = await res.json().catch(() => null);
      if (data?.valid === true) return true;
    }
    return false;
  } catch (error) {
    log(`auth check failed: ${error?.message || error}`);
    return false;
  }
};

const accessDecision = async (req) => {
  if (accessMode === "open") return { ok: true };
  if (accessMode === "locked") return { ok: false, status: 403 };
  return (await gandalfSaysYes(req)) ? { ok: true } : { ok: false, status: 401 };
};

const discoveredTransports = async () => {
  const cache = discoveryCache();
  if (!cache) return [];
  try {
    const names = await cache.get(DISCOVERY_KEY);
    return Array.isArray(names) ? names.filter((name) => typeof name === "string") : [];
  } catch (error) {
    log(`transport discovery read failed: ${error?.message || error}`);
    return [];
  }
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

const resolveTransport = async (req) => {
  if (transportOverride) {
    return {
      name: transportOverride,
      status: await publishedStatus(transportOverride),
      candidates: [transportOverride],
    };
  }

  const candidates = await discoveredTransports();

  for (const name of candidates) {
    const status = await publishedStatus(name);
    if (status) {
      return { name, status, candidates };
    }
  }

  const fallback = candidates[0] || null;
  if (!fallback) {
    log("no 4play transport has published discovery yet");
  }
  return { name: fallback, status: null, candidates };
};

const jsonResponse = (payload, status) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const statusHandler = async (req) => {
  const access = await accessDecision(req);
  if (!access.ok) {
    return jsonResponse({ error: "You shall not pass!" }, access.status);
  }
  if (!useCacheFn) {
    log("useCache was never provided by the app; cannot read transport status");
    return jsonResponse({ error: "cache unavailable" }, 503);
  }

  const resolved = await resolveTransport(req);
  if (!resolved.name) {
    return jsonResponse(
      {
        ok: true,
        transport: null,
        status: null,
        candidates: resolved.candidates,
        firefoxUrl,
        hint: "No 4play transport found. Is the lolcat 4play transport installed?",
      },
      200,
    );
  }

  const hint = resolved.status
    ? null
    : "Transport found but it has not published a status yet. The app only hands transports a cache handle on their first fetch; press the wake button or run a search through it once.";

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
    return jsonResponse({ error: "You shall not pass!" }, access.status);
  }

  const resolved = await resolveTransport(req);
  if (!resolved.name) {
    return jsonResponse({ error: "no 4play transport found" }, 404);
  }

  try {
    const res = await fetch(
      `${apiBaseFor(req.url)}${TRANSPORT_TEST_PATH}/${encodeURIComponent(resolved.name)}/test`,
      { method: "POST", headers: authHeaders(req) },
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
    return jsonResponse({ error: "You shall not pass!" }, access.status);
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

  const resolved = await resolveTransport(req);
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
  trigger: "4play",
  aliases: ["fourplay"],

  settingsSchema: [
    {
      key: "accessMode",
      label: "Status view access",
      type: "select",
      options: ["admin", "open", "locked"],
      default: "admin",
      description:
        "admin requires a valid settings/admin session, open lets anyone who can run the bang view and clear 4play status, and locked disables the status API for everyone.",
    },
    {
      key: "transportName",
      label: "Transport name override",
      type: "text",
      default: "",
      description:
        "Leave blank to auto-detect the installed 4play transport. Only set this if you run multiple 4play transports and want to pin a specific one (use the runtime name shown on the status card).",
    },
    {
      key: "firefoxUrl",
      label: "Firefox browser link",
      type: "text",
      default: "",
      description:
        "Link to the Firefox instance running the 4play extension (e.g. a remote-desktop/VNC/noVNC URL like http://192.168.86.233:6080, or any URL that opens that browser). When set, the status card shows an 'Open Firefox' button and a jump link next to every captcha that needs attention, so you can hop straight over to solve it. Firefox cannot be deep-linked to a specific tab from outside, so this opens the browser and you pick the flagged tab.",
    },
  ],

  routes: [
    { method: "get", path: "/status", handler: statusHandler },
    { method: "post", path: "/ping", handler: pingHandler },
    { method: "post", path: "/clear", handler: clearHandler },
  ],

  init(ctx) {
    template = ctx.template;
    useCacheFn = ctx.useCache;
    pluginApiBase = ctx.apiBase || "";
  },

  configure(settings) {
    const mode = String(settings?.accessMode || "admin").trim();
    accessMode = ["admin", "open", "locked"].includes(mode) ? mode : "admin";
    transportOverride = String(settings?.transportName || "").trim();
    firefoxUrl = String(settings?.firefoxUrl || "").trim();
  },

  execute() {
    return {
      title: "4play status",
      html: template.replace("{{apiBase}}", pluginApiBase),
    };
  },
};
