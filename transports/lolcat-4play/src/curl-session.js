import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DELIMITER = randomUUID();
const COOKIE_JAR_DIR = join(tmpdir(), "lolcat-4play-cookie-jars");
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

try {
  mkdirSync(COOKIE_JAR_DIR, { recursive: true });
} catch { }

const run = (cmd, args) =>
  new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
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

const safeFilePart = (value) => String(value || "default").replace(/[^a-z0-9_.-]/gi, "_");

export const cookieJarPathFor = (origin, containerId) => {
  const parsed = new URL(origin);
  return join(COOKIE_JAR_DIR, `${safeFilePart(containerId)}_${safeFilePart(parsed.hostname)}.txt`);
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

export const seedCookieJarFromHeaders = (origin, containerId, headers = []) => {
  const cookieHeader = browserCookieHeader(headers);
  if (!cookieHeader) return null;

  const parsed = new URL(origin);
  const jar = cookieJarPathFor(origin, containerId);
  const secure = parsed.protocol === "https:" ? "TRUE" : "FALSE";
  const lines = ["# Netscape HTTP Cookie File", "# Seeded from lolcat-4play browser warmup"];

  for (const chunk of cookieHeader.split(";")) {
    const splitAt = chunk.indexOf("=");
    if (splitAt <= 0) continue;
    const name = chunk.slice(0, splitAt).trim();
    const value = chunk.slice(splitAt + 1).trim();
    if (!name) continue;
    lines.push([parsed.hostname, "FALSE", "/", secure, "0", name, value].join("\t"));
  }

  try {
    writeFileSync(jar, `${lines.join("\n")}\n`, { mode: 0o600 });
    return jar;
  } catch {
    return null;
  }
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
  cookieJar,
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
    "-w",
    `\n${DELIMITER}%{http_code}`,
  ];

  if (cookieJar) {
    args.push("-b", cookieJar, "-c", cookieJar);
  }
  if (proxyUrl) {
    args.push("--proxy", proxyUrl);
  }

  for (const header of cleanBrowserHeaders(headers)) {
    args.push("-H", header);
  }

  args.push("--", url);

  const result = await run(binary, args);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `lolcat-4play: curl failed (${result.exitCode})`);
  }

  const delimIdx = result.stdout.lastIndexOf(`\n${DELIMITER}`);
  const bodyText = delimIdx >= 0 ? result.stdout.slice(0, delimIdx) : result.stdout;
  const statusNum = parseInt(
    delimIdx >= 0 ? result.stdout.slice(delimIdx + DELIMITER.length + 1) : "502",
    10,
  );

  return new Response(bodyText, {
    status: statusNum >= 100 ? statusNum : 502,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
