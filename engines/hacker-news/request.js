import { API_BASE, FALLBACK_UA } from "./const/api.js";

const _timeFilterToRange = (timeFilter, dateFrom, dateTo) => {
  const now = Math.floor(Date.now() / 1000);
  switch (timeFilter) {
    case "hour":
      return { since: now - 3600 };
    case "day":
      return { since: now - 86400 };
    case "week":
      return { since: now - 7 * 86400 };
    case "month":
      return { since: now - 30 * 86400 };
    case "year":
      return { since: now - 365 * 86400 };
    case "custom": {
      const out = {};
      if (dateFrom) out.since = Math.floor(new Date(`${dateFrom}T00:00:00Z`).getTime() / 1000);
      if (dateTo) out.until = Math.floor(new Date(`${dateTo}T23:59:59Z`).getTime() / 1000);
      return out;
    }
    default:
      return {};
  }
};

export const buildSearchUrl = (query, page, timeFilter, context) => {
  const useDate = timeFilter && timeFilter !== "any";
  const endpoint = useDate ? "search_by_date" : "search";
  const params = new URLSearchParams({
    query,
    tags: "story",
    hitsPerPage: "30",
    page: String(Math.max(0, (page || 1) - 1)),
  });

  const range = _timeFilterToRange(timeFilter, context?.dateFrom, context?.dateTo);
  const filters = [];
  if (range.since) filters.push(`created_at_i>${range.since}`);
  if (range.until) filters.push(`created_at_i<${range.until}`);
  if (filters.length) params.set("numericFilters", filters.join(","));

  return `${API_BASE}/${endpoint}?${params.toString()}`;
};

export const buildHeaders = (context) => ({
  Accept: "application/json",
  "User-Agent": context?.userAgent?.() || FALLBACK_UA,
});
