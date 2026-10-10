import { GO_APP_ANDROID_VERSIONS, OPERA_MINI_VARIANTS } from "./const/user-agents.js";
import { regions } from "./const/regions.js";
import {
  GOOGLE_COLOR_MAP,
  GOOGLE_LAYOUT_MAP,
  GOOGLE_SIZE_MAP,
  GOOGLE_TYPE_MAP,
  SEARCH_URL,
  TBS_MAP,
} from "./const/serp.js";

const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _randInt = (min, max) =>
  min + Math.floor(Math.random() * (max - min + 1));

export const gsaAgent = () => {
  const v = _pick(OPERA_MINI_VARIANTS);
  const platform = _pick(v.platforms);
  const build = _randInt(10000, 49999);
  const subMajor = _randInt(20, 49);
  const subMinor = _randInt(100, 3999);
  return `Opera/9.80 (${platform}; Opera Mini/${v.version}.${build}/${subMajor}.${subMinor}; U; en) Presto/${v.presto} Version/${v.release}`;
};

export const goAppAgent = () => {
  const major = _randInt(3, 4);
  const minor = _randInt(40, 74);
  const build = _randInt(100000000, 899999999);
  const android = _pick(GO_APP_ANDROID_VERSIONS);
  return `NSTN/${major}.${minor}.${build}.release Dalvik/2.1.0 (Linux; U; Android ${android}; US) gzip`;
};

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

const _mapped = (value, map) =>
  value && value !== "any" && map[value] ? map[value] : "";

const _buildImgTbs = (imgFilter) =>
  [
    _mapped(imgFilter?.size, GOOGLE_SIZE_MAP),
    _mapped(imgFilter?.color, GOOGLE_COLOR_MAP),
    _mapped(imgFilter?.type, GOOGLE_TYPE_MAP),
    _mapped(imgFilter?.layout, GOOGLE_LAYOUT_MAP),
  ]
    .filter(Boolean)
    .join(",");

const _wantsSafe = (safeSearch, nsfwOverride) => {
  if (nsfwOverride === "on" || nsfwOverride === "moderate") return true;
  if (nsfwOverride === "off") return false;
  return safeSearch === "on" || safeSearch === "moderate";
};

const _applyFilters = (params, timeFilter, context, safeSearch) => {
  const timeTbs =
    timeFilter === "custom"
      ? _resolveCustomTbs(context?.dateFrom, context?.dateTo)
      : _resolveTbs(timeFilter);
  const imgTbs = _buildImgTbs(context?.imageFilter);
  const tbs = [timeTbs, imgTbs].filter(Boolean).join(",");
  if (tbs) params.set("tbs", tbs);
  if (context?.lang) params.set("hl", context.lang);
  params.set(
    "safe",
    _wantsSafe(safeSearch, context?.imageFilter?.nsfw) ? "active" : "off",
  );
  const region = context?.region;
  if (region && regions.includes(region)) params.set("gl", region.toLowerCase());
};

export const buildJsonUrl = (query, page, timeFilter, context, safeSearch) => {
  const params = new URLSearchParams({
    q: query,
    tbm: "isch",
    asearch: "isch",
  });
  _applyFilters(params, timeFilter, context, safeSearch);
  return `${SEARCH_URL}?${params.toString()}&async=_fmt:json,p:1,ijn:${page - 1}`;
};

export const buildHtmlUrl = (query, page, timeFilter, context, safeSearch) => {
  const lang = context?.lang || "en";
  const params = new URLSearchParams({
    q: query,
    tbm: "isch",
    hl: lang,
    lr: `lang_${lang}`,
    ie: "utf8",
    oe: "utf8",
    start: String((page - 1) * 20),
  });
  _applyFilters(params, timeFilter, context, safeSearch);
  return `${SEARCH_URL}?${params.toString()}`;
};

export const acceptLanguage = (context) =>
  context?.buildAcceptLanguage?.() || "en-US,en;q=0.9";
