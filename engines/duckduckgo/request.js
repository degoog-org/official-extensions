import { REGION_LOCALES } from "./const/regions.js";
import { FALLBACK_UA, TIME_FILTER_MAP } from "./const/search.js";

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

export const buildHeaders = (context, safe) => ({
  "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://duckduckgo.com/",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  ...(safe ? { Cookie: `p=${safe}` } : {}),
});

export const buildParams = (query, timeFilter, safe, context) => {
  const params = new URLSearchParams({ q: query, kl: buildKl(context) });
  if (safe) params.set("kp", safe);
  if (timeFilter && timeFilter !== "any" && timeFilter !== "custom" && TIME_FILTER_MAP[timeFilter]) {
    params.set("df", TIME_FILTER_MAP[timeFilter]);
  }
  return params;
};

export const buildPageParams = (params, page, vqd) => {
  const s = 10 + (page - 2) * 15;
  const pageParams = new URLSearchParams(params);
  pageParams.set("s", String(s));
  pageParams.set("dc", String(s + 1));
  pageParams.set("vqd", vqd);
  pageParams.set("nextParams", "");
  pageParams.set("api", "d.js");
  pageParams.set("o", "json");
  pageParams.set("v", "l");
  return pageParams;
};
