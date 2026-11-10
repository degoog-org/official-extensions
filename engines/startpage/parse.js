import {
  ANUBIS_MARKER,
  BASE_URL,
  CAPTCHA_MARKERS,
  NO_RESULTS_BLOCK,
  SUSPENDED_MARKERS,
  WEB_BLOCK_PREFIX,
} from "./const/serp.js";

export const isCaptcha = (html) => {
  const head = html.slice(0, 6000);
  return CAPTCHA_MARKERS.some((m) => head.includes(m));
};

export const isAnubisGate = (html) => html.includes(ANUBIS_MARKER);

export const isSuspended = (html) => {
  const head = html.slice(0, 6000);
  return SUSPENDED_MARKERS.some((m) => head.includes(m));
};

export const extractSerpJson = (html) => {
  const match = html.match(/React\.createElement\(UIStartpage\.AppSerpWeb, ?(.+)\),?$/m);
  return match ? match[1] : null;
};

const _esc = (str) => {
  if (typeof str !== "string") return "";
  return str
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const _stripProxy = (url) => {
  if (typeof url !== "string" || !url) return url;
  try {
    const u = new URL(url, BASE_URL);
    if (u.pathname.includes("do/d/search")) {
      const dest = u.searchParams.get("url");
      if (dest) return dest;
    }
  } catch { }
  return url;
};

const _isWebBlock = (block) =>
  typeof block?.display_type === "string" &&
  block.display_type.startsWith(WEB_BLOCK_PREFIX) &&
  Array.isArray(block.results);

export const isReadableMainline = (mainline) =>
  mainline.some((block) => _isWebBlock(block) || block?.display_type === NO_RESULTS_BLOCK);

export const parseMainline = (mainline, name, useAnonymousView) => {
  const results = [];
  for (const block of mainline) {
    if (!_isWebBlock(block)) continue;
    for (const item of block.results) {
      let url = _stripProxy(item.clickUrl ?? item.url ?? "");
      if (!url || !url.startsWith("http")) continue;
      const title = _esc(item.title ?? "");
      if (!title) continue;
      if (useAnonymousView && typeof item.anonViewUrl === "string" && item.anonViewUrl) {
        url = item.anonViewUrl;
      }
      results.push({ title, url, snippet: _esc(item.description ?? ""), source: name });
    }
  }
  return results;
};
