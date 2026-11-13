import { API_URL, FALLBACK_UA, PAGE_SIZE } from "./const/api.js";

export const buildSearchUrl = (query, page) => {
  const params = new URLSearchParams({
    q: query,
    photos: "true",
    page: String(Math.max(1, page || 1)),
    per_page: String(PAGE_SIZE),
    order_by: "observations",
    order: "desc",
  });
  return `${API_URL}?${params.toString()}`;
};

export const buildHeaders = (context) => ({
  Accept: "application/json",
  "Accept-Language": context?.buildAcceptLanguage?.() ?? "en,en-US;q=0.9",
  "User-Agent": context?.userAgent?.() || FALLBACK_UA,
});
