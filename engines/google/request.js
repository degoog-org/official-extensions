import { regions } from "./const/regions.js";
import { TBS_MAP, UDM_WEB_ONLY } from "./const/serp.js";

const _resolveTbs = (timeFilter) => {
  if (!timeFilter || timeFilter === "any" || timeFilter === "custom")
    return null;
  return TBS_MAP[timeFilter] ?? null;
};

const _resolveCustomTbs = (dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) return null;
  const parts = ["cdr:1"];
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime()))
      parts.push(
        `cd_min:${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`,
      );
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime()))
      parts.push(
        `cd_max:${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`,
      );
  }
  return parts.length > 1 ? parts.join(",") : null;
};

const _applyFilters = (params, timeFilter, safeSearch, context) => {
  const tbs =
    timeFilter === "custom"
      ? _resolveCustomTbs(context?.dateFrom, context?.dateTo)
      : _resolveTbs(timeFilter);
  if (tbs) params.set("tbs", tbs);
  if (safeSearch === "on") params.set("safe", "active");
  const region = context?.region;
  if (region && regions.includes(region)) params.set("gl", region.toLowerCase());
};

export const buildHtmlParams = (query, page, timeFilter, safeSearch, context) => {
  const start = (page - 1) * 10;
  const lang = context?.lang || "en";
  const params = new URLSearchParams({
    q: query,
    hl: lang,
    lr: `lang_${lang}`,
    ie: "utf8",
    oe: "utf8",
    start: String(start),
    filter: "0",
    udm: UDM_WEB_ONLY,
  });
  _applyFilters(params, timeFilter, safeSearch, context);
  return params;
};

export const acceptLanguage = (context) =>
  context?.buildAcceptLanguage?.() || "en-US,en;q=0.9";
