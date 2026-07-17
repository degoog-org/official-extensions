import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const STATUS_DELIMITER = randomUUID();
const COOKIE_DELIMITER = randomUUID();

export const COOKIE_JAR_HEADER =
  "# Netscape HTTP Cookie File\n# Stored by Degoog lolcat-4play transport cache\n\n";

const BINARIES = [
  "curl_firefox135",
  "curl_firefox133",
  "curl_ff133",
  "curl_ff117",
  "curl_ff",
  "curl-impersonate",
  "curl",
];

// curl-impersonate builds often ship without working Brotli/zstd decompressors.
// Brave and similar origins negotiate br by default; --compressed then fails with
// curl exit 23 (CURLE_WRITE_ERROR). Restrict to gzip/deflate, which --compressed handles.
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

const run = (cmd, args, stdinText) =>
  new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    proc.stdout.on("data", (chunk) => stdout.push(chunk));
    proc.stderr.on("data", (chunk) => stderr.push(chunk));
    proc.on("error", (error) => resolve({ exitCode: 127, stdout: "", stderr: error.message }));
    proc.on("close", (exitCode) =>
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf-8"),
        stderr: Buffer.concat(stderr).toString("utf-8"),
      }),
    );

    if (proc.stdin) {
      proc.stdin.on("error", () => { });
      proc.stdin.write(stdinText || "");
      proc.stdin.end();
    }
  });

let resolvedBinary;
let resolvedProfile;

export const resolveCurlBinary = async () => {
  if (resolvedBinary !== undefined) return resolvedBinary;

  for (const binary of BINARIES) {
    const result = await run(binary, ["--version"]);
    if (result.exitCode === 0) {
      resolvedBinary = binary;
      return resolvedBinary;
    }
  }

  resolvedBinary = null;
  return resolvedBinary;
};

const shellSplit = (text) => {
  const tokens = [];
  const pattern = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let match;
  while ((match = pattern.exec(text))) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
};

const wrapperPath = async (name) => {
  const result = await run("which", [name]);
  const path = result.stdout.trim().split("\n")[0];
  return result.exitCode === 0 && path ? path : null;
};

/**
 * curl-impersonate ships bash wrappers that hardcode a full -H set. Those append to
 * ours instead of replacing them, so the wire ends up with two User-Agent headers and
 * a UA that contradicts the warmed session. Keep every TLS/HTTP2 flag, drop the -H.
 */
const profileFrom = async (name) => {
  const path = await wrapperPath(name);
  if (!path) return null;

  let text;
  try {
    text = await readFile(path, "utf-8");
  } catch {
    return null;
  }

  const anchor = '"$dir/curl-impersonate"';
  const start = text.indexOf(anchor);
  if (start < 0) return null;

  const body = text.slice(start + anchor.length).replace(/\\\n/g, " ");
  const stop = body.indexOf('"$@"');
  const tokens = shellSplit(stop >= 0 ? body.slice(0, stop) : body);

  const args = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] === "-H") {
      i += 1;
      continue;
    }
    args.push(tokens[i]);
  }

  const binary = join(dirname(path), "curl-impersonate");
  if ((await run(binary, ["--version"])).exitCode !== 0) return null;
  return { binary, args };
};

export const resolveCurlProfile = async () => {
  if (resolvedProfile !== undefined) return resolvedProfile;

  for (const name of BINARIES) {
    const profile = await profileFrom(name);
    if (profile) {
      resolvedProfile = profile;
      return resolvedProfile;
    }
  }

  const plain = await resolveCurlBinary();
  resolvedProfile = plain ? { binary: plain, args: [] } : null;
  return resolvedProfile;
};

export const emptyCookieJar = () => COOKIE_JAR_HEADER;

export const cookieJarKeyFor = (origin, containerId) => {
  const parsed = new URL(origin);
  return `${containerId || "default"}:${parsed.origin}`;
};

const parseHeader = (header) => {
  const raw = String(header || "");
  const splitAt = raw.indexOf(":");
  if (splitAt <= 0) return null;
  return {
    name: raw.slice(0, splitAt).trim(),
    value: raw.slice(splitAt + 1).trim(),
  };
};

const browserCookieHeader = (headers = []) =>
  headers
    .map(parseHeader)
    .find((header) => header?.name.toLowerCase() === "cookie")
    ?.value || "";

export const cookieJarFromCookieHeader = (origin, cookieHeader) => {
  const parsed = new URL(origin);
  const secure = parsed.protocol === "https:" ? "TRUE" : "FALSE";
  const rows = [];

  for (const chunk of cookieHeader.split(";")) {
    const splitAt = chunk.indexOf("=");
    if (splitAt <= 0) continue;
    const name = chunk.slice(0, splitAt).trim();
    const value = chunk.slice(splitAt + 1).trim();
    if (!name) continue;
    rows.push([parsed.hostname, "FALSE", "/", secure, "0", name, value].join("\t"));
  }

  return `${COOKIE_JAR_HEADER}${rows.join("\n")}\n`;
};

export const seedCookieJarTextFromHeaders = (origin, headers = []) => {
  const cookieHeader = browserCookieHeader(headers);
  if (!cookieHeader) return null;
  return cookieJarFromCookieHeader(origin, cookieHeader);
};

const jarCookieNames = (jarText) => {
  const names = new Set();
  for (const line of String(jarText || "").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const name = line.split("\t")[5];
    if (name) names.add(name);
  }
  return names;
};

export const fillCookieGaps = (origin, jarText, cookieHeader) => {
  if (!cookieHeader) return jarText;

  const known = jarCookieNames(jarText);
  const extra = cookieJarFromCookieHeader(origin, cookieHeader)
    .split("\n")
    .filter((line) => {
      if (!line || line.startsWith("#")) return false;
      const name = line.split("\t")[5];
      return name && !known.has(name);
    });

  if (!extra.length) return jarText;
  const base = String(jarText || COOKIE_JAR_HEADER).replace(/\n*$/, "\n");
  return `${base}${extra.join("\n")}\n`;
};

export const engineHeaders = (headers = {}) => {
  const allowed = ["referer", "origin", "content-type"];
  const out = [];
  for (const [name, value] of Object.entries(headers)) {
    if (!allowed.includes(String(name).toLowerCase())) continue;
    if (typeof value !== "string" || !value) continue;
    out.push(`${name.replace(/[\r\n]/g, "")}: ${value.replace(/[\r\n]/g, "")}`);
  }
  return out;
};

export const parseCurlStdoutWithCookieJar = (stdout) => {
  let head = stdout;
  let cookieJarText = null;

  const cookieIdx = stdout.lastIndexOf(COOKIE_DELIMITER);
  if (cookieIdx >= 0) {
    head = stdout.slice(0, cookieIdx);
    cookieJarText = stdout.slice(cookieIdx + COOKIE_DELIMITER.length).replace(/^\n/, "");
  }

  const statusIdx = head.lastIndexOf(STATUS_DELIMITER);
  if (statusIdx < 0) {
    return { bodyText: head, status: 502, cookieJarText };
  }

  const bodyText = head.slice(0, statusIdx).replace(/\n$/, "");
  const status = parseInt(head.slice(statusIdx + STATUS_DELIMITER.length), 10);

  return {
    bodyText,
    status: status >= 100 ? status : 502,
    cookieJarText,
  };
};

export const cleanBrowserHeaders = (headers = []) => {
  const cleaned = [];
  const seen = new Set();

  for (const header of headers) {
    const parsed = parseHeader(header);
    if (!parsed) continue;

    const name = parsed.name;
    const value = parsed.value;
    const lower = name.toLowerCase();
    if (!name || !value || STRIP_HEADERS.has(lower) || seen.has(lower)) continue;

    seen.add(lower);
    cleaned.push(`${name.replace(/[\r\n]/g, "")}: ${value.replace(/[\r\n]/g, "")}`);
  }

  return cleaned;
};

export const proxyUrlFromSettings = ({ type, host, port, username, password, proxyDns } = {}) => {
  if (!type || type === "none" || !host) return "";

  const scheme =
    type === "socks5" ? (proxyDns ? "socks5h" : "socks5") :
    type === "socks4" ? (proxyDns ? "socks4a" : "socks4") :
    type;
  const auth = username
    ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ""}@`
    : "";
  return `${scheme}://${auth}${host}:${port || 1080}`;
};

export const curlFetchWithBrowserHeaders = async ({
  url,
  headers = [],
  extraHeaders = [],
  method = "",
  body = "",
  timeoutSeconds = 30,
  cookieJarText,
  onCookieJarText,
  proxyUrl = "",
}) => {
  const profile = await resolveCurlProfile();
  if (!profile) {
    throw new Error("lolcat-4play: curl/curl-impersonate binary not found for warmed session fetch");
  }

  const args = [
    ...profile.args,
    "-sS",
    "-L",
    "--compressed",
    "--max-redirs",
    "5",
    "--max-time",
    String(Math.max(5, Math.ceil(timeoutSeconds))),
    "-b",
    "-",
    "-c",
    "-",
    "-w",
    `\n${STATUS_DELIMITER}%{http_code}\n${COOKIE_DELIMITER}\n`,
  ];

  if (proxyUrl) {
    args.push("--proxy", proxyUrl);
  }

  args.push("-H", `Accept-Encoding: ${CURL_ACCEPT_ENCODING}`);

  for (const header of cleanBrowserHeaders(headers)) {
    args.push("-H", header);
  }
  for (const header of extraHeaders) {
    args.push("-H", header);
  }

  const verb = String(method || "").toUpperCase();
  if (body) {
    args.push("--data-raw", String(body));
    if (verb && verb !== "POST") args.push("-X", verb);
  } else if (verb && verb !== "GET") {
    args.push("-X", verb);
  }

  args.push("--", url);

  const result = await run(profile.binary, args, cookieJarText || emptyCookieJar());
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim();
    const hint =
      result.exitCode === 23
        ? " (response decompression failed; origin may have ignored gzip-only Accept-Encoding)"
        : "";
    throw new Error(detail || `lolcat-4play: curl failed (${result.exitCode})${hint}`);
  }

  const parsed = parseCurlStdoutWithCookieJar(result.stdout);
  if (parsed.cookieJarText && typeof onCookieJarText === "function") {
    onCookieJarText(parsed.cookieJarText);
  }

  return new Response(parsed.bodyText, {
    status: parsed.status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
