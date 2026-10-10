import { REGION_LOCALES } from "./const/regions.js";
import {
  DDG_COLOR_MAP,
  DDG_LAYOUT_MAP,
  DDG_SIZE_MAP,
  DDG_TYPE_MAP,
} from "./const/filters.js";
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
  if (!lang || lang === "en") return "us-en";
  return `${lang}-${lang}`;
};

export const buildKl = (context) => _regionKl(context) ?? _langKl(context?.lang);

export const buildHeaders = (context, safe, region) => ({
  "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": context?.buildAcceptLanguage?.() ?? "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Cookie: `p=${safe}; ah=${region}; l=${region}`,
});

export const buildJsonHeaders = (headers) => ({
  ...headers,
  Accept: "application/json, text/javascript, */*; q=0.01",
  Referer: "https://duckduckgo.com/",
  "X-Requested-With": "XMLHttpRequest",
});

const _mkFilters = (imageFilter) => {
  const f = imageFilter ?? {};
  const slots = [
    DDG_SIZE_MAP[f.size] ? `size:${DDG_SIZE_MAP[f.size]}` : "",
    DDG_COLOR_MAP[f.color] ? `color:${DDG_COLOR_MAP[f.color]}` : "",
    DDG_TYPE_MAP[f.type] ? `type:${DDG_TYPE_MAP[f.type]}` : "",
    DDG_LAYOUT_MAP[f.layout] ? `layout:${DDG_LAYOUT_MAP[f.layout]}` : "",
    "",
    "",
  ];
  return slots.join(",");
};

export const buildImageParams = ({ query, vqd, region, safe, page, imageFilter, hideAiImages }) =>
  new URLSearchParams({
    o: "json",
    q: query,
    vqd,
    u: "bing",
    bpia: "1",
    l: region,
    p: safe,
    s: String((page - 1) * 100),
    f: _mkFilters(imageFilter),
    ...(hideAiImages ? { kbj: "1" } : {}),
  });
