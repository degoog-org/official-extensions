import { regions } from "./const/regions.js";
import { API_URL, FRESHNESS_MAP, PAGE_SIZE } from "./const/search.js";

export const buildSearchUrl = (query, page, timeFilter, safeSearch, context) => {
  const offset = ((page || 1) - 1) * PAGE_SIZE;
  const params = new URLSearchParams({
    q: query,
    count: String(PAGE_SIZE),
    offset: String(offset),
    safesearch: safeSearch,
  });

  if (context?.lang) params.set("search_lang", context.lang);

  if (timeFilter && timeFilter !== "any" && timeFilter !== "custom" && FRESHNESS_MAP[timeFilter]) {
    params.set("freshness", FRESHNESS_MAP[timeFilter]);
  }

  const region = context?.region;
  if (region && regions.includes(region)) params.set("country", region);

  return `${API_URL}?${params}`;
};

export const buildHeaders = (apiKey) => ({
  Accept: "application/json",
  "Accept-Encoding": "gzip",
  "X-Subscription-Token": apiKey,
});
