import { regions } from "./const/regions.js";
import { ELEMENT_URL, PAGE_SIZE, SAFE_MAP, TIME_RANGE_DAYS } from "./const/cse.js";

const _stamp = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
};

const _rangeSort = (timeFilter, context) => {
  if (timeFilter === "custom") {
    const from = new Date(context?.dateFrom ?? "");
    const to = new Date(context?.dateTo ?? "");
    if (isNaN(from.getTime()) && isNaN(to.getTime())) return null;
    const start = isNaN(from.getTime()) ? new Date(0) : from;
    const end = isNaN(to.getTime()) ? new Date() : to;
    return `date:r:${_stamp(start)}:${_stamp(end)}`;
  }

  const days = TIME_RANGE_DAYS[timeFilter];
  if (!days) return null;

  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  return `date:r:${_stamp(start)}:${_stamp(end)}`;
};

export const buildSearchUrl = (
  { query, page, timeFilter, token, cx, category, safeSearch },
  context,
) => {
  const params = new URLSearchParams({
    rsz: "filtered_cse",
    num: String(PAGE_SIZE),
    hl: context?.lang || "en",
    cselibv: token.libVersion,
    cx,
    q: query,
    safe: SAFE_MAP[safeSearch] ?? "off",
    cse_tok: token.token,
    callback: "_",
    rurl: "",
    searchtype: category,
  });

  const sort = _rangeSort(timeFilter, context);
  if (sort) params.set("sort", sort);
  if (token.exp) params.set("exp", token.exp);

  const start = (Math.max(1, page) - 1) * PAGE_SIZE;
  if (start) params.set("start", String(start));

  const region = context?.region;
  if (region && regions.includes(region)) params.set("gl", region.toLowerCase());

  return `${ELEMENT_URL}?${params.toString()}`;
};

export const buildHeaders = (context) => ({
  "User-Agent": context?.userAgent?.() || "Mozilla/5.0",
  Accept: "*/*",
  "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
  Referer: "https://cse.google.com/",
  Cookie: "CONSENT=YES+",
});
