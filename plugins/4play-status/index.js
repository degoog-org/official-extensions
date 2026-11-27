const TEST_URL = "https://example.com";
const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
const CONTROL_TTL_MS = 60 * 1000;
const DISCOVERY_NAMESPACE = "transport:4play:discovery";
const DISCOVERY_KEY = "names";
const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000;
const TRIGGER = "4play";
const CLEAR_SCOPES = ["all", "session", "captcha"];
const ACK_WAIT_MS = 10_000;
const ACK_POLL_MS = 250;
const STREAM_TICK_MS = 1500;
const STREAM_HEARTBEAT_MS = 5000;
const STREAM_RENEW_MS = 60_000;

let template = "";
let useCacheFn = null;
let proxies = null;
let firefoxUrl = "";
let accessMode = "admin";
let outgoingFetch = null;
let pluginApiBase = "";
let transportChoice = "";

const log = (msg) => {
  console.warn(`[4play-status] ${msg}`);
};

let lastGripe = "";

const logOnce = (msg) => {
  if (msg === lastGripe) return;
  lastGripe = msg;
  log(msg);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const statusCacheFor = (name) =>
  useCacheFn ? useCacheFn(`transport:${name}:status`, STATUS_TTL_MS) : null;

const controlCacheFor = (name) =>
  useCacheFn ? useCacheFn(`transport:${name}:control`, CONTROL_TTL_MS) : null;

const UNAUTHORIZED = "You shall not pass!";

const isOpenTo = (context) =>
  accessMode === "open" ||
  (accessMode === "admin" && context?.authenticated === true);

const lockReason = (context) => {
  if (accessMode === "locked") return "settings";
  return isOpenTo(context) ? "" : "admin";
};

const discoveredTransports = async () => {
  if (!useCacheFn) return [];
  try {
    const names = await useCacheFn(DISCOVERY_NAMESPACE, DISCOVERY_TTL_MS).get(DISCOVERY_KEY);
    return Array.isArray(names) ? names.filter((name) => typeof name === "string") : [];
  } catch (error) {
    log(`failed to read the 4play discovery entry: ${error?.message || error}`);
    return [];
  }
};

const transportOptions = async () => {
  const names = await discoveredTransports();
  return {
    options: names.map((name) => ({ value: name })),
    value: transportChoice || names[0] || "",
    notice: names.length
      ? undefined
      : "No 4play transport has announced itself yet. Run one search through it, then refresh this list.",
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
  const candidates = await discoveredTransports();
  const name = transportChoice || candidates[0] || "";
  if (name) lastGripe = "";
  if (!name) {
    logOnce("no transport selected and no 4play transport has announced itself yet");
    return { name: null, status: null, candidates };
  }
  return { name, status: await publishedStatus(name), candidates };
};

const jsonResponse = (payload, status) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const hostOf = (origin) => {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
};

const scoutRoute = async (session) => {
  const route = session.route;
  if (route?.kind !== "core" || !proxies?.scout) return session;
  const host = hostOf(session.origin);
  if (!host) return session;
  try {
    const scouted = await proxies.scout(route.egress, host);
    const { egress: _egress, ...rest } = route;
    return { ...session, route: { ...rest, ...scouted } };
  } catch (error) {
    log(`proxy lookup failed for ${session.origin}: ${error?.message || error}`);
    return session;
  }
};

const withoutEgress = (session) => {
  if (session.route?.kind !== "core") return session;
  const { egress: _egress, ...route } = session.route;
  return { ...session, route };
};

const scoutedStatus = async (status) => {
  if (!status) return status;
  const sessions = Array.isArray(status.sessions) ? status.sessions : [];
  const taggedAlong = Array.isArray(status.taggedAlong) ? status.taggedAlong : [];
  return {
    ...status,
    sessions: (await Promise.all(sessions.map(scoutRoute))).map(withoutEgress),
    taggedAlong: (await Promise.all(taggedAlong.map(scoutRoute))).map(withoutEgress),
  };
};

const lineup = async () => {
  if (!proxies?.lineup) return null;
  try {
    return await proxies.lineup();
  } catch (error) {
    log(`proxy lineup failed: ${error?.message || error}`);
    return null;
  }
};

const snapshot = async () => {
  const resolved = await resolveTransport();
  if (!resolved.name) {
    return {
      ok: true,
      transport: null,
      status: null,
      candidates: resolved.candidates,
      firefoxUrl,
      proxies: await lineup(),
      hint: "No 4play transport has announced itself yet. Run one search through it, or pick it in this plugin's settings.",
    };
  }
  return {
    ok: true,
    transport: resolved.name,
    status: await scoutedStatus(resolved.status),
    candidates: resolved.candidates,
    firefoxUrl,
    proxies: await lineup(),
    hint: resolved.status
      ? null
      : "Transport found but it has not published a status yet. The app only hands transports a cache handle on their first fetch; run the test below or search through it once.",
  };
};

const guarded = (handler) => async (req, context) => {
  if (accessMode === "locked") {
    return jsonResponse({ error: "the 4play status view is locked in plugin settings" }, 403);
  }
  if (!isOpenTo(context)) return jsonResponse({ error: UNAUTHORIZED }, 401);
  if (!useCacheFn) {
    log("useCache was never provided by the app; cannot reach the transport");
    return jsonResponse({ error: "cache unavailable" }, 503);
  }
  return handler(req);
};

const statusHandler = async () => jsonResponse(await snapshot(), 200);

const streamHandler = async (req) => {
  const encoder = new TextEncoder();
  let timer = null;
  let beat = null;
  let last = "";
  let closed = false;
  const openedAt = Date.now();

  const stop = () => {
    closed = true;
    if (timer) clearTimeout(timer);
    if (beat) clearInterval(beat);
  };

  const body = new ReadableStream({
    start(controller) {
      const send = (text) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          stop();
        }
      };
      const tick = async () => {
        if (closed) return;
        if (Date.now() - openedAt > STREAM_RENEW_MS) {
          send("event: renew\ndata: {}\n\n");
          stop();
          try {
            controller.close();
          } catch {}
          return;
        }
        try {
          const payload = JSON.stringify(await snapshot());
          if (payload !== last) {
            last = payload;
            send(`data: ${payload}\n\n`);
          }
        } catch (error) {
          log(`status stream tick failed: ${error?.message || error}`);
        }
        if (!closed) timer = setTimeout(tick, STREAM_TICK_MS);
      };
      beat = setInterval(() => send(": keepalive\n\n"), STREAM_HEARTBEAT_MS);
      req.signal?.addEventListener("abort", () => {
        stop();
        try {
          controller.close();
        } catch {}
      });
      tick();
    },
    cancel: stop,
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
};

const pingHandler = async () => {
  const resolved = await resolveTransport();
  if (!resolved.name) {
    return jsonResponse({ error: "no 4play transport found" }, 404);
  }
  if (!outgoingFetch) {
    log("fetch was never provided by the app; cannot wake the transport");
    return jsonResponse({ error: "fetch unavailable" }, 503);
  }

  try {
    const res = await outgoingFetch(TEST_URL, {}, resolved.name);
    await res.body?.cancel().catch(() => {});
    const message = res.ok ? `OK (${res.status})` : `HTTP ${res.status}`;
    log(`wake fetch through ${resolved.name}: ${res.ok ? "ok" : `failed (${message})`}`);
    return jsonResponse({ ok: res.ok, transport: resolved.name, message }, 200);
  } catch (error) {
    const message = error?.message || String(error);
    log(`wake fetch through ${resolved.name} failed: ${message}`);
    return jsonResponse({ ok: false, transport: resolved.name, message }, 200);
  }
};

const awaitAck = async (cache, id) => {
  const deadline = Date.now() + ACK_WAIT_MS;
  while (Date.now() < deadline) {
    const result = await cache.get("result").catch(() => null);
    if (result?.id === id) return result;
    await sleep(ACK_POLL_MS);
  }
  return null;
};

const clearHandler = async (req) => {
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

  const request = { id: crypto.randomUUID(), scope };
  if (key) request.key = key;
  if (scope === "captcha" && tabId !== null) request.tabId = tabId;

  const control = controlCacheFor(resolved.name);
  try {
    await control.set("request", request, CONTROL_TTL_MS);
    log(`queued clear (${scope}) for ${resolved.name}`);
  } catch (error) {
    log(`failed to queue clear request: ${error?.message || error}`);
    return jsonResponse({ error: "failed to queue clear request" }, 500);
  }

  const ack = await awaitAck(control, request.id);
  if (!ack) {
    return jsonResponse(
      {
        ok: false,
        pending: true,
        transport: resolved.name,
        message: "4play didn't answer within 10s. Is the browser extension connected?",
      },
      202,
    );
  }
  return jsonResponse(
    { ok: ack.ok === true, transport: resolved.name, message: ack.message || null },
    200,
  );
};

export default {
  isClientExposed: false,
  name: "4play status",
  description:
    "Live status of the 4play transport, with its connection, warmed origins, the proxy each one rides, blocked sessions and open captchas.",
  trigger: TRIGGER,
  aliases: ["fourplay"],

  settingsSchema: [
    {
      key: "accessMode",
      label: "Status view access",
      type: "select",
      options: ["admin", "open", "locked"],
      default: "admin",
      description:
        "admin only lets people signed in to Settings view, test and clear 4play status. open lets anyone who can run the bang use the card. locked turns the status API off for everyone.",
    },
    {
      key: "transportName",
      label: "4play transport",
      type: "select",
      optionsFrom: {
        auto: true,
        refreshLabel: "Refresh",
        emptyHint: "Run one search through 4play, then refresh.",
      },
      description:
        "The transport this card reports on. 4play transports announce themselves on their first fetch, so the list fills up once you've searched through one. Leave it on the first entry unless you run more than one.",
      visibleWhen: { key: "accessMode", equals: ["admin", "open"] },
    },
    {
      key: "firefoxUrl",
      label: "Firefox browser link",
      type: "text",
      default: "",
      description:
        "A URL that opens the Firefox running the 4play extension, such as a noVNC address like http://192.168.86.233:6080. The card then shows an 'Open Firefox' button and a link next to each captcha that needs you. It can't open a specific tab, so you pick the flagged one yourself.",
      visibleWhen: { key: "accessMode", equals: ["admin", "open"] },
    },
  ],

  async getFieldOptions(key) {
    if (key !== "transportName") return { options: [] };
    return transportOptions();
  },

  routes: [
    { method: "get", path: "/status", handler: guarded(statusHandler), rateLimit: true },
    { method: "get", path: "/stream", handler: guarded(streamHandler), rateLimit: true },
    { method: "post", path: "/ping", handler: guarded(pingHandler), rateLimit: true },
    { method: "post", path: "/clear", handler: guarded(clearHandler), rateLimit: true },
  ],

  init(ctx) {
    template = ctx.template;
    useCacheFn = ctx.useCache;
    proxies = ctx.proxies || null;
    pluginApiBase = ctx.apiBase || "";
    outgoingFetch = ctx.fetch || null;
  },

  configure(settings) {
    const mode = String(settings?.accessMode || "admin").trim();
    accessMode = ["admin", "open", "locked"].includes(mode) ? mode : "admin";
    transportChoice = String(settings?.transportName || "").trim();
    firefoxUrl = String(settings?.firefoxUrl || "").trim();
  },

  execute(_args, context) {
    return {
      title: "4play status",
      html: template
        .replace("{{apiBase}}", pluginApiBase)
        .replace("{{locked}}", lockReason(context)),
    };
  },
};
