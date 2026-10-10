import { MARKETS } from "./const/regions.js";
import { ADLT_COOKIE, FALLBACK_UA } from "./const/headers.js";
import { FRESHNESS_MAP } from "./const/time.js";

const JUNK_CC = new Set(["us", "cn", "ru"]);

const _regionalMarket = (lang, region) => {
  if (!region) return null;
  const cc = region.toLowerCase();
  const wanted = `${(lang || "en").toLowerCase()}-${cc}`;
  if (MARKETS.includes(wanted)) return wanted;
  return MARKETS.find((market) => market.endsWith(`-${cc}`)) ?? null;
};

const _langQuery = (lang, buildAL, withCc) => {
  let tag = lang;
  if (!tag.includes("-")) {
    const primary = buildAL?.()?.split(",")[0].split(";")[0].trim();
    if (primary?.toLowerCase().startsWith(`${lang.toLowerCase()}-`)) tag = primary;
  }
  const [setlang, cc] = tag.toLowerCase().split("-");
  let qs = `&setlang=${encodeURIComponent(setlang)}`;
  if (withCc && cc && !JUNK_CC.has(cc)) qs += `&cc=${encodeURIComponent(cc)}`;
  return qs;
};

const _localeQuery = (context) => {
  const lang = context?.lang;
  const market = _regionalMarket(lang, context?.region);
  let qs = lang ? _langQuery(lang, context?.buildAcceptLanguage, !market) : "";
  if (market) {
    const cc = market.slice(market.lastIndexOf("-") + 1);
    qs += `&mkt=${encodeURIComponent(market)}&cc=${encodeURIComponent(cc)}`;
  }
  return qs;
};

export const resolveAdlt = (safeSearch) =>
  safeSearch === "strict" || safeSearch === "moderate" ? safeSearch : "off";

export const buildSearchUrl = (query, timeFilter, adlt, context) => {
  let url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  url += _localeQuery(context);
  url += `&adlt=${adlt}`;
  if (timeFilter && timeFilter !== "any" && timeFilter !== "custom") {
    if (FRESHNESS_MAP[timeFilter])
      url += `&filters=ex1%3a"ez5_${FRESHNESS_MAP[timeFilter]}_TimeCustom"`;
  } else if (timeFilter === "custom" && (context?.dateFrom || context?.dateTo)) {
    const from = context?.dateFrom ?? "";
    const to = context?.dateTo ?? "";
    url += `&filters=${encodeURIComponent(`ex1:"ez5_Custom_TimeCustom" ex2:"CustomDate|${from}_${to}"`)}`;
  }
  return url;
};

export const buildHeaders = (adlt, context) => ({
  "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  Cookie: `SRCHHPGUSR=ADLT=${ADLT_COOKIE[adlt] ?? "OFF"}`,
});
