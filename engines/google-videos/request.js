import { OPERA_MINI_VARIANTS } from "./const/user-agents.js";
import { regions } from "./const/regions.js";
import { SEARCH_URL, TBS_MAP } from "./const/serp.js";

const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

export const gsaAgent = () => {
  const v = _pick(OPERA_MINI_VARIANTS);
  const platform = _pick(v.platforms);
  const build = _randInt(10000, 49999);
  const subMajor = _randInt(20, 49);
  const subMinor = _randInt(100, 3999);
  return `Opera/9.80 (${platform}; Opera Mini/${v.version}.${build}/${subMajor}.${subMinor}; U; en) Presto/${v.presto} Version/${v.release}`;
};

const _resolveTbs = (timeFilter) => {
  if (!timeFilter || timeFilter === "any" || timeFilter === "custom") return null;
  return TBS_MAP[timeFilter] ?? null;
};

const _resolveCustomTbs = (dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) return null;
  const parts = ["cdr:1"];
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) parts.push(`cd_min:${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`);
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) parts.push(`cd_max:${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`);
  }
  return parts.length > 1 ? parts.join(",") : null;
};

export const buildSearchUrl = (query, page, timeFilter, safeSearch, context) => {
  const start = (page - 1) * 10;
  const lang = context?.lang || "en";
  const params = new URLSearchParams({
    q: query,
    tbm: "vid",
    hl: lang,
    lr: `lang_${lang}`,
    ie: "utf8",
    oe: "utf8",
    start: String(start),
    filter: "0",
  });

  const tbs = timeFilter === "custom"
    ? _resolveCustomTbs(context?.dateFrom, context?.dateTo)
    : _resolveTbs(timeFilter);
  if (tbs) params.set("tbs", tbs);
  if (safeSearch === "on") params.set("safe", "active");
  const region = context?.region;
  if (region && regions.includes(region)) params.set("gl", region.toLowerCase());
  return `${SEARCH_URL}?${params.toString()}`;
};

export const buildHeaders = (userAgent, context) => ({
  "User-Agent": userAgent,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
  Cookie: "CONSENT=YES+",
});
