import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

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
  timeoutSeconds = 30,
  cookieJarText,
  onCookieJarText,
  proxyUrl = "",
}) => {
  const binary = await resolveCurlBinary();
  if (!binary) {
    throw new Error("lolcat-4play: curl/curl-impersonate binary not found for warmed session fetch");
  }

  const args = [
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

  for (const header of cleanBrowserHeaders(headers)) {
    args.push("-H", header);
  }

  args.push("--", url);

  const result = await run(binary, args, cookieJarText || emptyCookieJar());
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `lolcat-4play: curl failed (${result.exitCode})`);
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
