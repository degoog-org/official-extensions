import { FALLBACK_UA, SEARCH_URL } from "./const/serp.js";

export const buildSearchUrl = (query, page) => {
  const p = Math.max(0, (page || 1) - 1);
  const params = new URLSearchParams({ q: query });
  if (p > 0) params.set("p", String(p));
  return `${SEARCH_URL}?${params.toString()}`;
};

export const buildHeaders = (context) => ({
  "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": context?.buildAcceptLanguage?.() ?? "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "max-age=0",
});
