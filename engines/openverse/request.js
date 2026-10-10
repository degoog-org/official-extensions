import {
  API_URL,
  FALLBACK_UA,
  OV_ASPECT_MAP,
  OV_SIZE_MAP,
  PAGE_SIZE,
} from "./const/api.js";

export const buildSearchUrl = (query, page, context) => {
  const imageFilter = context?.imageFilter ?? {};
  const params = new URLSearchParams({
    q: query,
    page: String(Math.max(1, page || 1)),
    page_size: String(PAGE_SIZE),
  });

  if (OV_SIZE_MAP[imageFilter.size]) {
    params.set("size", OV_SIZE_MAP[imageFilter.size]);
  }

  if (OV_ASPECT_MAP[imageFilter.layout]) {
    params.set("aspect_ratio", OV_ASPECT_MAP[imageFilter.layout]);
  }

  if (imageFilter.nsfw === "off") {
    params.set("mature", "true");
  }

  return `${API_URL}?${params.toString()}`;
};

export const buildHeaders = (context) => ({
  Accept: "application/json",
  "Accept-Language": context?.buildAcceptLanguage?.() ?? "en,en-US;q=0.9",
  "User-Agent": context?.userAgent?.() || FALLBACK_UA,
});
