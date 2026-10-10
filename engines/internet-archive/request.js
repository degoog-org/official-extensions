import { FALLBACK_UA, ROWS, SEARCH_URL, TIME_RANGES } from "./const/api.js";

const _datedQuery = (query, timeFilter, context) => {
  if (TIME_RANGES[timeFilter]) return `${query} AND date:[${TIME_RANGES[timeFilter]} TO NOW]`;
  if (timeFilter === "custom" && context?.dateFrom) {
    const to = context.dateTo ?? "NOW";
    return `${query} AND date:[${context.dateFrom} TO ${to}]`;
  }
  return query;
};

export const buildSearchUrl = (query, page, timeFilter, context) => {
  const params = new URLSearchParams({
    q: _datedQuery(query, timeFilter, context),
    output: "json",
    rows: String(ROWS),
    page: String(page),
    "fl[]": "identifier,title,description,mediatype,item_size,downloads",
    "sort[]": "downloads desc",
  });
  return `${SEARCH_URL}?${params.toString()}`;
};

export const buildHeaders = (context) => ({
  "User-Agent": context?.userAgent?.() || FALLBACK_UA,
  Accept: "application/json",
});
