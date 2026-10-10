import { API_URL, PAGE_SIZE, WM_TYPE_QUERY } from "./const/api.js";

const _typeQuery = (imageFilter) => {
  const mod = WM_TYPE_QUERY[imageFilter?.type];
  return mod ?? "";
};

export const buildUrl = (query, page, context) => {
  const imageFilter = context?.imageFilter ?? {};
  const offset = (Math.max(1, page || 1) - 1) * PAGE_SIZE;

  const typeFilter = _typeQuery(imageFilter);
  const gsrsearch = typeFilter ? `${query} ${typeFilter}` : query;

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch,
    gsrlimit: String(PAGE_SIZE),
    gsroffset: String(offset),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "400",
    origin: "*",
  });

  return `${API_URL}?${params.toString()}`;
};

export const buildHeaders = (context) => ({
  Accept: "application/json",
  "User-Agent": "Degoog/1.0 (https://github.com/fccview/degoog)",
  "Accept-Language": context?.buildAcceptLanguage?.() ?? "en,en-US;q=0.9",
});
