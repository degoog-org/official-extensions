import { MARKETS } from "./const/regions.js";
import { ADLT_COOKIE, FALLBACK_UA } from "./const/headers.js";
import { COLOR_MAP, LAYOUT_MAP, SIZE_MAP, TYPE_MAP } from "./const/image-maps.js";
import { AGE_MAP } from "./const/time.js";

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

const ASYNC_PAGE_SIZE = 35;

const _qft = (timeFilter, img) => {
  const parts = [];
  if (timeFilter && timeFilter !== "any" && timeFilter !== "custom") {
    if (AGE_MAP[timeFilter]) parts.push(`filterui:age-lt${AGE_MAP[timeFilter].toLowerCase()}`);
  }
  if (img?.size && img.size !== "any" && SIZE_MAP[img.size]) parts.push(`filterui:imagesize-${SIZE_MAP[img.size]}`);
  if (img?.color && img.color !== "any" && COLOR_MAP[img.color]) parts.push(`filterui:color2-${COLOR_MAP[img.color]}`);
  if (img?.type && img.type !== "any" && TYPE_MAP[img.type]) parts.push(`filterui:photo-${TYPE_MAP[img.type]}`);
  if (img?.layout && img.layout !== "any" && LAYOUT_MAP[img.layout]) parts.push(`filterui:aspect-${LAYOUT_MAP[img.layout]}`);
  return parts.length > 0 ? `+${parts.join("+")}` : "";
};

export const resolveAdlt = (safeSearch, nsfw) => {
  if (nsfw === "on") return "strict";
  if (nsfw === "moderate") return "moderate";
  if (nsfw === "off") return "off";
  return safeSearch === "strict" || safeSearch === "moderate" ? safeSearch : "off";
};

export const buildSearchUrl = (query, page, timeFilter, adlt, context) => {
  const first = (page - 1) * ASYNC_PAGE_SIZE;
  let url = `https://www.bing.com/images/async?q=${encodeURIComponent(query)}&mmasync=1&count=${ASYNC_PAGE_SIZE}&first=${first + 1}`;
  url += _localeQuery(context);
  url += `&adlt=${adlt}`;
  const qft = _qft(timeFilter, context?.imageFilter);
  if (qft) url += `&qft=${qft}`;
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
