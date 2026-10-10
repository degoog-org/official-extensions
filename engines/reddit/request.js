import { BASE_URL, FALLBACK_UA, SEARCH_LIMIT, TIME_FILTERS } from "./const/feed.js";

const _mapTime = (t) => (TIME_FILTERS.includes(t) ? t : "all");

export const buildUrl = (query, page, timeFilter, sortBy, includeNsfw) => {
  const params = new URLSearchParams({
    q: query,
    sort: sortBy,
    t: _mapTime(timeFilter),
    include_over_18: includeNsfw === "true" ? "1" : "0",
    limit: String(SEARCH_LIMIT),
  });

  if (page > 1) params.set("count", String((page - 1) * SEARCH_LIMIT));

  return `${BASE_URL}?${params.toString()}`;
};

export const buildHeaders = (context) => ({
  "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
  "Accept": "application/atom+xml, application/xml, text/xml, */*",
  "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
});
