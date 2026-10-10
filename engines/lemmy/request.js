import { DEFAULT_INSTANCE, FALLBACK_UA, SEARCH_LIMIT } from "./const/api.js";

export const normalizeInstance = (value) => {
  const trimmed = (value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_INSTANCE;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export const buildSearchUrl = (baseUrl, query, page, { searchType, sort, showNSFW }) => {
  const params = new URLSearchParams({
    q: query,
    type_: searchType,
    sort,
    page: String(page),
    limit: String(SEARCH_LIMIT),
    show_nsfw: showNSFW ? "true" : "false",
  });
  return `${baseUrl}/api/v3/search?${params.toString()}`;
};

export const buildRequestInit = (context) => ({
  headers: {
    "accept": "application/json",
    "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
  },
  method: "GET",
});
