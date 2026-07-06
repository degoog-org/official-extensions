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

const headersFromSession = (session) => {
  const headers = Array.isArray(session?.headers) ? session.headers : [];
  return headers.filter((line) => !/^cookie:/i.test(line));
};

const buildArgs = ({ url, options = {}, session, proxyUrl = "", timeoutSeconds = 30, delimiter }) => {
  const args = ["-sS", "-L", "--compressed", "--max-time", String(Math.ceil(timeoutSeconds)), "-b", "-", "-c", "-"];
  if (proxyUrl) args.push("--proxy", proxyUrl);
  for (const header of headersFromSession(session)) args.push("-H", header);
  const method = options.method || "GET";
  if (method && method !== "GET") args.push("-X", method);
  if (options.body) args.push("--data-binary", typeof options.body === "string" ? options.body : String(options.body));
  args.push("-w", `\n${delimiter}%{http_code}`, url);
  return args;
};

const parseOutput = (stdout, delimiter) => {
  const marker = `\n${delimiter}`;
  const idx = stdout.lastIndexOf(marker);
  const body = idx >= 0 ? stdout.slice(0, idx) : stdout;
  const status = idx >= 0 ? Number(stdout.slice(idx + marker.length)) : 502;
  return { body, status: status >= 100 ? status : 502 };
};

const fetchWithBinary = async ({ binary, url, options = {}, session, proxyUrl = "", timeoutSeconds = 30 }) => {
  const delimiter = `__DEGOOG_STATUS_${randomBytes(8).toString("hex")}__`;
  const cookieJarText = session?.cookieJarText || "# Netscape HTTP Cookie File\n";
  const args = buildArgs({ url, options, session, proxyUrl, timeoutSeconds, delimiter });
  const result = await run(binary, args, cookieJarText);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `${binary} failed (${result.exitCode})`);
  const parsed = parseOutput(result.stdout, delimiter);
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
