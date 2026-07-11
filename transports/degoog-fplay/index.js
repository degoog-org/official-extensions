import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const FETCH_TIMEOUT_MS = 30000;
const SESSION_TTL_MS = 5 * 60 * 60 * 1000;
const COOKIE_JAR_DIR = join(tmpdir(), "degoog-4play-cookies");
const DELIMITER = randomUUID();
const BINARIES = [
  "curl_firefox135",
  "curl_firefox133",
  "curl_ff133",
  "curl_ff117",
  "curl_ff",
  "curl",
];
const BASE_STRIP_HEADERS = new Set(["accept-encoding", "accept"]);

try {
  mkdirSync(COOKIE_JAR_DIR, { recursive: true });
} catch {}

const _browsers = new Set();
const _pending = new Map();
const _sessions = new Map();
const _pings = new WeakMap();
const _warmups = new Map();

const _cookieJarPath = (host) =>
  join(COOKIE_JAR_DIR, host.replace(/[^a-z0-9.-]/gi, "_") + ".txt");

function _resolveBinary() {
  for (const bin of BINARIES) {
    try {
      const r = Bun.spawnSync([bin, "--version"]);
      if (r.exitCode === 0) return bin;
    } catch {
      continue;
    }
  }
  return null;
}

async function _getSession(host, warmupUrl) {
  const existing = _sessions.get(host);
  if (existing && Date.now() - existing.ts < SESSION_TTL_MS)
    return existing.cookies;

  if (_warmups.has(host)) return _warmups.get(host);

  if (_browsers.size === 0)
    throw new Error("No browser connected to degoog-4play transport.");

  const id = randomUUID();
  const warmup = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error("degoog-4play session timeout"));
    }, FETCH_TIMEOUT_MS);
    _pending.set(id, { resolve, reject, timer });
    for (const ws of _browsers)
      ws.send(JSON.stringify({ type: "get_session", id, url: warmupUrl }));
  })
    .then((cookies) => {
      console.log(
        `[degoog-4play] got ${cookies.length} cookies for ${host}:`,
        cookies.map((c) => c.name).join(", "),
      );
      _sessions.set(host, { cookies, ts: Date.now() });
      _warmups.delete(host);
      return cookies;
    })
    .catch((err) => {
      _warmups.delete(host);
      throw err;
    });

  _warmups.set(host, warmup);
  return warmup;
}

async function _curlFetch(
  url,
  options,
  proxyUrl,
  binary,
  cookies,
  stripEngineCookies,
  stripEngineUserAgents,
) {
  const parsed = new URL(url);
  const cookieJar = _cookieJarPath(parsed.hostname);
  const method = options.method ?? "GET";

  const stripHeaders = new Set(BASE_STRIP_HEADERS);
  if (stripEngineUserAgents) stripHeaders.add("user-agent");

  const args = [
    "-sS",
    "-L",
    "--max-redirs",
    "5",
    "--max-time",
    "30",
    "-w",
    `\n${DELIMITER}%{http_code}`,
    "-c",
    cookieJar,
    "-b",
    cookieJar,
  ];

  if (cookies?.length) {
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    args.push("-H", `Cookie: ${cookieStr}`);
  }

  if (proxyUrl?.trim()) args.push("--proxy", proxyUrl.trim());
  if (method !== "GET" && method !== "HEAD") args.push("-X", method);

  for (const [k, v] of Object.entries(options.headers ?? {})) {
    const kl = k.toLowerCase();
    if (stripEngineCookies && kl === "cookie") continue;
    if (stripHeaders.has(kl)) continue;
    args.push(
      "-H",
      `${k.replace(/[\r\n]/g, "")}: ${String(v).replace(/[\r\n]/g, "")}`,
    );
  }

  args.push("--", url);

  const proc = Bun.spawn([binary, ...args], {
    stdin: options.body ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (options.body && ["POST", "PUT", "PATCH"].includes(method)) {
    try {
      proc.stdin.write(options.body);
      proc.stdin.end();
    } catch {
      proc.kill();
    }
  }

  const [stdoutBuf, stderrText, exitCode] = await Promise.all([
    Bun.readableStreamToBytes(proc.stdout),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0)
    throw new Error(stderrText.trim() || `degoog-4play failed (${exitCode})`);

  const output = new TextDecoder().decode(stdoutBuf);
  const delimIdx = output.lastIndexOf(`\n${DELIMITER}`);
  const bodyText = delimIdx >= 0 ? output.slice(0, delimIdx) : output;
  const statusNum = parseInt(
    delimIdx >= 0 ? output.slice(delimIdx + DELIMITER.length + 1) : "502",
    10,
  );

  return new Response(bodyText, {
    status: statusNum >= 100 ? statusNum : 502,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export default class FplayTransport {
  isClientExposed = true;
  name = "degoog-4play";
  displayName = "4play (degoog)";
  description =
    "Uses a browser extension to harvest a genuine session for each target host, then passes those cookies to curl-impersonate for outgoing requests. Get the extension [here](https://github.com/degoog-org/4play).";

  _password = "";
  _stripEngineCookies = true;
  _stripEngineUserAgents = true;

  get settingsSchema() {
    return [
      {
        key: "wsUrl",
        label: "WebSocket path",
        type: "info",
        default: `/ws/${this.name}`,
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        default: "",
        description:
          "Optional password - must match what you set in the extension.",
      },
      {
        key: "stripEngineCookies",
        label: "Strip engine cookies",
        type: "toggle",
        default: "true",
        description:
          "When on, ignore Cookie headers from engines so only the browser session (and curl jar) apply.",
      },
      {
        key: "stripEngineUserAgents",
        label: "Strip engine user agents",
        type: "toggle",
        default: "true",
        description:
          "When on, drop User-Agent from engines and use curl-impersonate's profile only.",
      },
    ];
  }

  wsHandler = {
    onOpen: (ws) => {
      console.log("[degoog-4play] browser extension connected");
      if (!this._password) {
        _browsers.add(ws);
      }
      _pings.set(
        ws,
        setInterval(() => ws.send(JSON.stringify({ type: "ping" })), 20000),
      );
    },

    onMessage: (ws, raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === "auth") {
        if (this._password && msg.password !== this._password) {
          ws.close(1008, "wrong password");
          return;
        }
        _browsers.add(ws);
        ws.send(JSON.stringify({ type: "auth_ok" }));
        return;
      }

      if (
        (msg.type === "session" || msg.type === "error") &&
        _pending.has(msg.id)
      ) {
        const { resolve, reject, timer } = _pending.get(msg.id);
        clearTimeout(timer);
        _pending.delete(msg.id);
        if (msg.type === "session") resolve(msg.cookies ?? []);
        else reject(new Error(msg.error ?? "degoog-4play error"));
      }
    },

    onClose: (ws) => {
      console.log("[degoog-4play] browser extension disconnected");
      const ping = _pings.get(ws);
      if (ping) {
        clearInterval(ping);
        _pings.delete(ws);
      }
      _browsers.delete(ws);
    },
  };

  configure(settings) {
    this._stripEngineCookies = settings.stripEngineCookies !== "false";
    this._stripEngineUserAgents = settings.stripEngineUserAgents !== "false";
    this._password =
      typeof settings.password === "string" ? settings.password : "";
  }

  available() {
    return _browsers.size > 0 && _resolveBinary() !== null;
  }

  async fetch(url, options, context) {
    const binary = _resolveBinary();
    if (!binary)
      throw new Error(
        "curl-impersonate not found. Required by degoog-4play transport.",
      );

    const parsed = new URL(url);
    const warmupUrl = `${parsed.protocol}//${parsed.hostname}/`;
    const cookies = await _getSession(parsed.hostname, warmupUrl);

    return _curlFetch(
      url,
      options,
      context.proxyUrl,
      binary,
      cookies,
      this._stripEngineCookies,
      this._stripEngineUserAgents,
    );
  }
}
