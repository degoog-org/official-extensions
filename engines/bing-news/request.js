import { MARKETS } from "./const/regions.js";
import { FALLBACK_UA } from "./const/headers.js";
import { TIME_RANGE_MAP } from "./const/time.js";

const _bingMkt = (lang, buildAL) => {
  if (lang.includes("-")) return lang;
  const al = buildAL?.();
  if (al) {
    const primary = al.split(",")[0].split(";")[0].trim();
    if (primary.includes("-")) return primary;
  }
  return lang;
};

const _regionalMarket = (lang, region) => {
  if (!region) return null;
  const cc = region.toLowerCase();
  const wanted = `${(lang || "en").toLowerCase()}-${cc}`;
  if (MARKETS.includes(wanted)) return wanted;
  return MARKETS.find((market) => market.endsWith(`-${cc}`)) ?? null;
};

export const buildSearchUrl = (query, page, timeFilter, context) => {
  const offset = (page - 1) * 10;
  const lang = context?.lang;
  const market = _regionalMarket(lang, context?.region);
  const params = new URLSearchParams({ q: query, form: "NSBABR" });
  if (lang) {
    params.set("setlang", lang);
    params.set("mkt", market ?? _bingMkt(lang, context?.buildAcceptLanguage));
  } else if (market) {
    params.set("mkt", market);
  }
  if (market) params.set("cc", market.slice(market.lastIndexOf("-") + 1));
  if (offset > 0) params.set("first", String(offset + 1));
  if (timeFilter && timeFilter !== "any" && timeFilter !== "custom" && TIME_RANGE_MAP[timeFilter]) {
    params.set("qft", TIME_RANGE_MAP[timeFilter]);
  }
  return `https://www.bing.com/news/search?${params}`;
};

export const buildHeaders = (context) => ({
  "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
});
