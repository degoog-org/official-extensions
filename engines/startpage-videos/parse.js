import { ANUBIS_MARKER, BASE_URL, CAPTCHA_MARKERS } from "./const/serp.js";

export const isCaptcha = (html) => {
  const head = html.slice(0, 6000);
  return CAPTCHA_MARKERS.some((m) => head.includes(m));
};

export const isAnubisGate = (html) => html.includes(ANUBIS_MARKER);

export const extractSerpJson = (html) => {
  const match = html.match(/React\.createElement\(UIStartpage\.AppSerpVideos, ?(.+)\),?$/m);
  return match ? match[1] : null;
};

const _esc = (str) => {
  if (typeof str !== "string") return "";
  return str
    .replace(/[\ue000\ue001]/g, "")
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

const _absolute = (url) => {
  if (typeof url !== "string" || !url) return "";
  try {
    return new URL(url, BASE_URL).href;
  } catch {
    return "";
  }
};

export const parseMainline = (mainline, name, useAnonymousView) => {
  const results = [];
  for (const block of mainline) {
    if (typeof block?.display_type !== "string" || !block.display_type.startsWith("video-")) continue;
    if (!Array.isArray(block.results)) continue;
    for (const item of block.results) {
      let url = item.clickUrl ?? "";
      if (typeof url !== "string" || !url.startsWith("http")) continue;
      const title = _esc(item.title ?? "");
      if (!title) continue;
      if (useAnonymousView && typeof item.anonViewUrl === "string" && item.anonViewUrl) {
        url = item.anonViewUrl;
      }
      results.push({
        title,
        url,
        snippet: _esc(item.description ?? ""),
        source: name,
        thumbnail: _absolute(item.thumbnailUrl),
        duration: typeof item.duration === "string" ? item.duration : "",
      });
    }
  }
  return results;
};
