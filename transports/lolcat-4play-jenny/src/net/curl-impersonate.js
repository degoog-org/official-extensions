import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const IMPERSONATE_BINARIES = ["curl_firefox135", "curl_firefox133", "curl_ff133", "curl_ff117", "curl_ff", "curl-impersonate"];
const FALLBACK_BINARIES = ["curl"];

const which = (bin) => new Promise((resolve) => {
  const child = spawn("sh", ["-lc", `command -v ${bin}`], { stdio: ["ignore", "pipe", "ignore"] });
  let out = "";
  child.stdout.on("data", (chunk) => { out += chunk; });
  child.on("close", (code) => resolve(code === 0 ? out.trim() : ""));
});

const resolveBinary = async (candidates) => {
  for (const bin of candidates) {
    const found = await which(bin);
    if (found) return found;
  }
  return "";
};

const run = (binary, args, stdin = "") => new Promise((resolve, reject) => {
  const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  child.stdin.end(stdin);
});

export const seedCookieJarFromHeaders = (origin, headers = []) => {
  const cookieLine = headers.find((header) => /^cookie:/i.test(header));
  if (!cookieLine) return "";
  let host;
  try {
    host = new URL(origin).hostname;
  } catch {
    return "";
  }
  const cookies = cookieLine.replace(/^cookie:\s*/i, "").split(/;\s*/).filter(Boolean);
  if (!cookies.length) return "";
  const lines = ["# Netscape HTTP Cookie File"];
  for (const pair of cookies) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    lines.push([host, "TRUE", "/", "FALSE", "0", name, value].join("\t"));
  }
  return `${lines.join("\n")}\n`;
};

const CURL_ACCEPT_ENCODING = "gzip, deflate";

const STRIP_HEADERS = new Set([
  "accept-encoding",
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "origin",
  "proxy-authorization",
  "referer",
]);

const headersFromSession = (session) => {
  const headers = Array.isArray(session?.headers) ? session.headers : [];
  const cleaned = [];
  const seen = new Set();
  for (const line of headers) {
    const raw = String(line || "");
    const splitAt = raw.indexOf(":");
    if (splitAt <= 0) continue;
    const name = raw.slice(0, splitAt).trim();
    const value = raw.slice(splitAt + 1).trim();
    const lower = name.toLowerCase();
    if (!name || !value || STRIP_HEADERS.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    cleaned.push(`${name.replace(/[\r\n]/g, "")}: ${value.replace(/[\r\n]/g, "")}`);
  }
  return cleaned;
};

const buildArgs = ({ url, options = {}, session, proxyUrl = "", timeoutSeconds = 30, statusMark, cookieMark }) => {
  const args = ["-sS", "-L", "--compressed", "--max-redirs", "5", "--max-time", String(Math.ceil(timeoutSeconds)), "-b", "-", "-c", "-"];
  if (proxyUrl) args.push("--proxy", proxyUrl);
  args.push("-H", `Accept-Encoding: ${CURL_ACCEPT_ENCODING}`);
  for (const header of headersFromSession(session)) args.push("-H", header);
  const method = options.method || "GET";
  if (method && method !== "GET") args.push("-X", method);
  if (options.body) args.push("--data-binary", typeof options.body === "string" ? options.body : String(options.body));
  args.push("-w", `\n${statusMark}%{http_code}\n${cookieMark}\n`, "--", url);
  return args;
};

export const parseOutput = (stdout, statusMark, cookieMark) => {
  let head = stdout;
  let cookieJarText = "";
  const cookieIdx = stdout.lastIndexOf(cookieMark);
  if (cookieIdx >= 0) {
    head = stdout.slice(0, cookieIdx);
    cookieJarText = stdout.slice(cookieIdx + cookieMark.length).replace(/^\n/, "");
  }
  const marker = `\n${statusMark}`;
  const idx = head.lastIndexOf(marker);
  const body = idx >= 0 ? head.slice(0, idx) : head;
  const status = idx >= 0 ? parseInt(head.slice(idx + marker.length), 10) : 502;
  return { body, status: status >= 100 ? status : 502, cookieJarText };
};

const fetchWithBinary = async ({ binary, url, options = {}, session, proxyUrl = "", timeoutSeconds = 30 }) => {
  const statusMark = `__DEGOOG_STATUS_${randomBytes(8).toString("hex")}__`;
  const cookieMark = `__DEGOOG_COOKIES_${randomBytes(8).toString("hex")}__`;
  const cookieJarText = session?.cookieJarText || "# Netscape HTTP Cookie File\n";
  const args = buildArgs({ url, options, session, proxyUrl, timeoutSeconds, statusMark, cookieMark });
  const result = await run(binary, args, cookieJarText);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `${binary} failed (${result.exitCode})`);
  const parsed = parseOutput(result.stdout, statusMark, cookieMark);
  return new Response(parsed.body, { status: parsed.status, headers: { "Content-Type": "text/html; charset=utf-8", "X-Degoog-Transport-Binary": binary } });
};

export const curlReplayFetch = async (params) => {
  const timeoutSeconds = Math.max(1, Math.ceil((params.timeoutMs || 30000) / 1000));
  const impersonate = await resolveBinary(IMPERSONATE_BINARIES);
  if (impersonate) {
    try {
      return await fetchWithBinary({ ...params, binary: impersonate, timeoutSeconds });
    } catch (error) {
      params.warn?.(`curl-impersonate failed (${error?.message || error}); trying plain curl fallback`);
    }
  }
  const fallback = await resolveBinary(FALLBACK_BINARIES);
  if (!fallback) throw new Error("lolcat-4play: no curl-impersonate or curl fallback binary found");
  return fetchWithBinary({ ...params, binary: fallback, timeoutSeconds });
};
