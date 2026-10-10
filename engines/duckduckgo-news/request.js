import { REGION_LOCALES } from "./const/regions.js";
import { FALLBACK_UA } from "./const/search.js";

const _regionKl = (context) => {
  const region = context?.region;
  if (!region) return null;
  return (
    REGION_LOCALES[`${context.lang || "en"}-${region}`] ??
    Object.entries(REGION_LOCALES).find(([locale]) => locale.endsWith(`-${region}`))?.[1] ??
    null
  );
};

const _langKl = (lang) => {
  if (!lang) return "wt-wt";
  return `${lang}-${lang}`;
};

export const buildKl = (context) => _regionKl(context) ?? _langKl(context?.lang);

const _mapDfFilter = (timeFilter, dateFrom, dateTo) => {
  switch (timeFilter) {
    case "day":
      return "d";
    case "week":
      return "w";
    case "month":
      return "m";
    case "year":
      return "y";
    case "custom":
      if (dateFrom && dateTo) return `${dateFrom}..${dateTo}`;
      if (dateFrom) return `${dateFrom}..${dateFrom}`;
      return "";
    default:
      return "";
  }
};

export const buildHeaders = (context, safe) => ({
  "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": context?.buildAcceptLanguage?.() ?? "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Cookie: `p=${safe}`,
});

export const buildJsonHeaders = (headers) => ({
  ...headers,
  Accept: "application/json, text/javascript, */*; q=0.01",
  Referer: "https://duckduckgo.com/",
  "X-Requested-With": "XMLHttpRequest",
});

export const buildNewsParams = (query, page, timeFilter, vqd, safe, context) => {
  const kl = buildKl(context);
  const params = new URLSearchParams({
    q: query,
    vqd,
    l: kl,
    kl,
    o: "json",
    noamp: "1",
    p: safe,
    s: String(((page || 1) - 1) * 30),
  });
  const df = _mapDfFilter(timeFilter, context?.dateFrom, context?.dateTo);
  if (df) params.set("df", df);
  return params;
};
