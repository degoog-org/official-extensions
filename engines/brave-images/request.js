import { REGION_COUNTRIES } from "./const/regions.js";
import { BASE_URL, FALLBACK_UA } from "./const/search.js";

const _regionCountry = (lang, region) => {
  if (!region) return null;
  const exact = REGION_COUNTRIES[`${lang || "en"}-${region}`];
  if (exact) return exact;
  const locale = Object.keys(REGION_COUNTRIES).find((key) => key.endsWith(`-${region}`));
  return locale ? REGION_COUNTRIES[locale] : null;
};

export const buildCookie = (lang, region, safeSearch) => {
  const parts = [`safesearch=${safeSearch}`, "useLocation=0"];
  const localised = lang && lang !== "en";
  const country = _regionCountry(lang, region) ?? (localised ? lang : "us");
  parts.push(`country=${country}`, `ui_lang=${localised ? `${lang}-${lang}` : "en-us"}`);
  return parts.join("; ");
};

export const resolveSafe = (engineSafe, context) => {
  const nsfw = context?.imageFilter?.nsfw;
  if (nsfw === "on") return "strict";
  if (nsfw === "moderate") return "moderate";
  if (nsfw === "off") return "off";
  return engineSafe;
};

export const buildSearchUrl = (query, page, safe) => {
  const args = { q: query, safesearch: safe };
  if (page > 1) args.offset = String(page - 1);
  return `${BASE_URL}?${new URLSearchParams(args).toString()}`;
};

export const buildHeaders = (context, safe) => ({
  "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
  "Accept-Encoding": "gzip, deflate",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
  Cookie: buildCookie(context?.lang, context?.region, safe),
});
