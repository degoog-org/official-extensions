import { API_URL, FALLBACK_UA } from "./const/api.js";

const _timeFilterToDates = (timeFilter, dateFrom, dateTo) => {
  if (timeFilter === "custom") {
    return { from: dateFrom || "", to: dateTo || "" };
  }
  const now = new Date();
  const toIso = (d) => d.toISOString().slice(0, 10);
  const out = { from: "", to: toIso(now) };
  const d = new Date(now);
  switch (timeFilter) {
    case "hour":
      d.setHours(d.getHours() - 1);
      break;
    case "day":
      d.setDate(d.getDate() - 1);
      break;
    case "week":
      d.setDate(d.getDate() - 7);
      break;
    case "month":
      d.setMonth(d.getMonth() - 1);
      break;
    case "year":
      d.setFullYear(d.getFullYear() - 1);
      break;
    default:
      return { from: "", to: "" };
  }
  out.from = toIso(d);
  return out;
};

export const buildUrl = (query, page, timeFilter, apiKey, context) => {
  const params = new URLSearchParams({
    q: query,
    "api-key": apiKey,
    "show-fields": "trailText,thumbnail",
    "page-size": "20",
    page: String(Math.max(1, page || 1)),
    "order-by": "newest",
  });

  const { from, to } = _timeFilterToDates(timeFilter, context?.dateFrom, context?.dateTo);
  if (from) params.set("from-date", from);
  if (to) params.set("to-date", to);

  return `${API_URL}?${params.toString()}`;
};

export const buildHeaders = (context) => ({
  Accept: "application/json",
  "User-Agent": context?.userAgent?.() || FALLBACK_UA,
});
