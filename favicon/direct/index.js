import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const HOST_PATTERN = /^[a-z0-9.-]+$/;
const MAX_HOST_LENGTH = 253;
const CACHE_NAMESPACE = "ext:direct-favicon:urls";
const DEFAULT_CACHE_HOURS = 24;
const MISS_TTL_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 4000;
const MAX_HTML_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;
const MISS = "";
const MAX_CONCURRENT_FETCHES = 5;
let _activeFetches = 0;
const _fetchWaiters = [];
const _acquireFetchSlot = () =>
  _activeFetches < MAX_CONCURRENT_FETCHES
    ? void _activeFetches++
    : new Promise((resolve) => _fetchWaiters.push(resolve)).then(() => void _activeFetches++);
const _releaseFetchSlot = () => {
  _activeFetches--;
  _fetchWaiters.shift()?.();
};
const UNKNOWN_SIZE_PENALTY = 24;
const SMALLER_THAN_TARGET_WEIGHT = 2;
const PREFERRED_FORMAT_PENALTY = 0;
const OTHER_FORMAT_PENALTY = 12;
const UNKNOWN_FORMAT_PENALTY = 6;
const APPLE_TOUCH_PENALTY = 4;
const OVERLAY_NETWORK_HOST = /\.(onion|i2p)$/;
const LOCAL_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home.arpa"];
const RESERVED_IPV4 =
  /^(?:0\.|10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|192\.0\.[02]\.|198\.1[89]\.|198\.51\.100\.|203\.0\.113\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|2[3-5]\d\.)/;
const LINK_TAG = /<link\b[^>]*>/gi;
const ATTRIBUTE = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const ICON_RELS = new Set(["icon", "apple-touch-icon", "apple-touch-icon-precomposed"]);
const PREFERRED_EXTENSIONS = new Set(["png", "ico"]);
const OTHER_EXTENSIONS = new Set(["gif", "jpg", "jpeg", "webp"]);
const PREFERRED_TYPES = new Set(["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/ico"]);
const OTHER_TYPES = new Set(["image/gif", "image/jpeg", "image/webp"]);
const HEAD_END = "</head>";

const _cleanHost = (host) => {
  if (typeof host !== "string") return "";
  const value = host.trim().toLowerCase();
  if (!value || value.length > MAX_HOST_LENGTH) return "";
  if (!HOST_PATTERN.test(value)) return "";
  if (value.startsWith(".") || value.endsWith(".") || value.includes("..")) return "";
  if (!value.includes(".")) return "";
  if (value === "localhost" || LOCAL_SUFFIXES.some((s) => value.endsWith(s))) return "";
  return value;
};

const _expandV6 = (ip) => {
  let value = ip.toLowerCase().split("%")[0];
  const dotted = value.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (isIP(dotted[2]) !== 4) return null;
    const [a, b, c, d] = dotted[2].split(".").map(Number);
    value = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
};

const _v4From = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

const _isBlockedV6 = (ip) => {
  const g = _expandV6(ip);
  if (!g) return true;
  const zeroPrefix = (n) => g.slice(0, n).every((x) => x === 0);
  if (zeroPrefix(6)) return RESERVED_IPV4.test(_v4From(g[6], g[7]));
  if (zeroPrefix(5) && g[5] === 0xffff) return RESERVED_IPV4.test(_v4From(g[6], g[7]));
  if (zeroPrefix(4) && g[4] === 0xffff && g[5] === 0) return RESERVED_IPV4.test(_v4From(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    if (g[2] !== 0 || g[3] !== 0 || g[4] !== 0 || g[5] !== 0) return true;
    return RESERVED_IPV4.test(_v4From(g[6], g[7]));
  }
  if (g[0] === 0x2002) return RESERVED_IPV4.test(_v4From(g[1], g[2]));
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  if ((g[0] & 0xffc0) === 0xfe80) return true;
  if ((g[0] & 0xffc0) === 0xfec0) return true;
  if ((g[0] & 0xff00) === 0xff00) return true;
  return false;
};

const _isBlockedIp = (ip) => {
  const kind = isIP(ip);
  if (kind === 4) return RESERVED_IPV4.test(ip);
  if (kind === 6) return _isBlockedV6(ip);
  return true;
};

const _isPublicHost = async (host) => {
  if (isIP(host)) return !_isBlockedIp(host);
  try {
    const records = await lookup(host, { all: true });
    return records.length > 0 && !records.some((r) => _isBlockedIp(r.address));
  } catch {
    return OVERLAY_NETWORK_HOST.test(host);
  }
};

const _readHead = async (res) => {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let html = "";
  let total = 0;
  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const slice = value.byteLength + total > MAX_HTML_BYTES ? value.subarray(0, MAX_HTML_BYTES - total) : value;
    total += slice.byteLength;
    html += decoder.decode(slice, { stream: true });
    if (html.toLowerCase().includes(HEAD_END)) break;
  }
  await reader.cancel().catch(() => {});
  return html;
};

const _decodeEntities = (value) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const _parseAttributes = (tag) => {
  const attrs = {};
  for (const match of tag.matchAll(ATTRIBUTE)) {
    attrs[match[1].toLowerCase()] = _decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
};

const _extensionOf = (url) => {
  const last = url.pathname.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  return dot === -1 ? "" : last.slice(dot + 1).toLowerCase();
};

const _parseSizes = (sizes) =>
  (sizes ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((entry) => entry.match(/^(\d+)x(\d+)$/))
    .filter(Boolean)
    .map((m) => Math.max(Number(m[1]), Number(m[2])));

const _sizePenalty = (sizes, target) => {
  if (sizes.length === 0) return UNKNOWN_SIZE_PENALTY;
  return Math.min(
    ...sizes.map((s) => (s < target ? (target - s) * SMALLER_THAN_TARGET_WEIGHT : s - target)),
  );
};

const _formatPenalty = (type, ext) => {
  if (PREFERRED_TYPES.has(type) || PREFERRED_EXTENSIONS.has(ext)) return PREFERRED_FORMAT_PENALTY;
  if (OTHER_TYPES.has(type) || OTHER_EXTENSIONS.has(ext)) return OTHER_FORMAT_PENALTY;
  return UNKNOWN_FORMAT_PENALTY;
};

const _toCandidate = (tag, baseUrl, target) => {
  const attrs = _parseAttributes(tag);
  const rels = (attrs.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!rels.some((r) => ICON_RELS.has(r))) return null;
  if (rels.includes("mask-icon")) return null;
  const href = (attrs.href ?? "").trim();
  if (!href || href.toLowerCase().startsWith("data:")) return null;
  const type = (attrs.type ?? "").trim().toLowerCase();
  if (type.includes("svg")) return null;
  let url;
  try {
    url = new URL(href, baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const ext = _extensionOf(url);
  if (ext === "svg" || ext === "svgz") return null;
  const isAppleTouch = rels.some((r) => r.startsWith("apple-touch-icon"));
  const score =
    _sizePenalty(_parseSizes(attrs.sizes), target) +
    _formatPenalty(type, ext) +
    (isAppleTouch ? APPLE_TOUCH_PENALTY : 0);
  return { url: url.href, score };
};

const _pickIcon = (html, baseUrl, target) => {
  const candidates = [];
  for (const match of html.matchAll(LINK_TAG)) {
    const candidate = _toCandidate(match[0], baseUrl, target);
    if (candidate) candidates.push(candidate);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0].url;
};

export default class DirectFaviconProvider {
  name = "Site favicon (experimental)";
  description =
    "Each site's own icon, read from its homepage. Every site in your results gets a request from your server.";

  settingsSchema = [
    {
      key: "timeout",
      label: "Timeout (ms)",
      type: "number",
      placeholder: String(DEFAULT_TIMEOUT_MS),
      description: "How long to wait for the homepage, 1000 to 10000.",
    },
    {
      key: "cacheHours",
      label: "Remember found icons (hours)",
      type: "number",
      placeholder: String(DEFAULT_CACHE_HOURS),
      description: "How long to reuse a found icon before checking the homepage again, 1 to 720.",
    },
  ];

  _timeoutMs = DEFAULT_TIMEOUT_MS;
  _cacheTtlMs = DEFAULT_CACHE_HOURS * HOUR_MS;

  configure(settings) {
    this._timeoutMs = Math.max(1000, Math.min(10000, Number(settings?.timeout) || DEFAULT_TIMEOUT_MS));
    this._cacheTtlMs =
      Math.max(1, Math.min(720, Number(settings?.cacheHours) || DEFAULT_CACHE_HOURS)) * HOUR_MS;
  }

  async getFavicon(host, context) {
    const clean = _cleanHost(host);
    if (!clean) return null;
    const cache = context?.useCache ? context.useCache(CACHE_NAMESPACE, this._cacheTtlMs) : null;
    const cached = cache ? await cache.get(clean).catch(() => null) : null;
    if (cached !== null && cached !== undefined) return cached === MISS ? null : { url: cached };
    const found = await this._discover(clean, context);
    if (cache) {
      await cache
        .set(clean, found ?? MISS, found ? this._cacheTtlMs : MISS_TTL_MS)
        .catch(() => {});
    }
    return found ? { url: found } : null;
  }

  async _discover(host, context) {
    if (!(await _isPublicHost(host))) return null;
    const doFetch = context?.fetch ?? fetch;
    const target = Number(context?.size) || 32;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    await _acquireFetchSlot();
    try {
      const page = await this._fetchHomepage(host, doFetch, context?.userAgent, controller.signal);
      if (!page) return null;
      const fallback = new URL("/favicon.ico", page.url).href;
      return _pickIcon(page.html, page.url, target) ?? fallback;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      _releaseFetchSlot();
    }
  }

  async _fetchHomepage(host, doFetch, userAgent, signal) {
    let current = `https://${host}/`;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await doFetch(current, {
        redirect: "manual",
        signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          ...(userAgent ? { "User-Agent": userAgent } : {}),
        },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => {});
        const next = new URL(location, current);
        if (next.protocol !== "https:" && next.protocol !== "http:") return null;
        if (!(await _isPublicHost(next.hostname.replace(/^\[|\]$/g, "")))) return null;
        current = next.href;
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return null;
      }
      const finalUrl = res.url || current;
      const finalHost = new URL(finalUrl).hostname.replace(/^\[|\]$/g, "");
      if (finalHost !== new URL(current).hostname && !(await _isPublicHost(finalHost))) {
        await res.body?.cancel().catch(() => {});
        return null;
      }
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (contentType && !contentType.includes("html")) {
        await res.body?.cancel().catch(() => {});
        return { url: finalUrl, html: "" };
      }
      return { url: finalUrl, html: await _readHead(res) };
    }
    return null;
  }
}
