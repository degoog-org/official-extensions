import { REGION_PREFERENCES } from "./const/regions.js";
import { BASE_URL, FALLBACK_UA, SAFE_MAP, TIME_MAP } from "./const/serp.js";

const ALL_REGIONS = "all";

export const regionPreference = (context) => {
  const region = context?.region;
  if (!region) return ALL_REGIONS;
  const exact = REGION_PREFERENCES[`${context?.lang || "en"}-${region}`];
  if (exact) return exact;
  const fallback = Object.entries(REGION_PREFERENCES).find(([locale]) =>
    locale.endsWith(`-${region}`),
  );
  return fallback ? fallback[1] : ALL_REGIONS;
};

const _buildPrefs = (safeSearch, region) => {
  const f = safeSearch === "on" ? "0" : "1";
  return [
    `date_timeEEEworld`,
    `disable_family_filterEEE${f}`,
    `disable_open_in_new_windowEEE0`,
    `enable_post_methodEEE1`,
    `enable_proxy_safety_suggestEEE0`,
    `enable_stay_controlEEE0`,
    `instant_answersEEE1`,
    `lang_homepageEEEs%2Fdevice%2Fen`,
    `languageEEEenglish`,
    `language_uiEEEenglish`,
    `num_of_resultsEEE20`,
    `search_results_regionEEE${region}`,
    `suggestionsEEE1`,
    `wt_unitEEEcelsius`,
  ].join("N1N");
};

export const baseHeaders = (context, safeSearch) => ({
  "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br",
  DNT: "1",
  Connection: "keep-alive",
  Cookie: `preferences=${_buildPrefs(safeSearch, regionPreference(context))}`,
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
});

export const postHeaders = (context, safeSearch) => ({
  ...baseHeaders(context, safeSearch),
  "Content-Type": "application/x-www-form-urlencoded",
  Referer: `${BASE_URL}/`,
  "Sec-Fetch-Site": "same-origin",
});

export const buildFirstPageParams = (query, timeFilter, safeSearch, context) => {
  const params = new URLSearchParams({ query, cat: "web", pl: "opensearch" });
  if (safeSearch !== "off") params.set("qadf", SAFE_MAP[safeSearch] ?? "none");
  if (context?.lang) params.set("language", context.lang);
  if (timeFilter && timeFilter !== "any" && timeFilter !== "custom" && TIME_MAP[timeFilter]) {
    params.set("with_date", TIME_MAP[timeFilter]);
  }
  return params;
};

export const buildNextPageBody = (query, page, searchSc, safeSearch, context) => {
  const body = new URLSearchParams({
    query,
    cat: "web",
    t: "device",
    sc: searchSc,
    segment: "organic",
    abd: "0",
    abe: "0",
    qsr: regionPreference(context),
    page: String(page),
  });
  if (safeSearch !== "off") body.set("qadf", SAFE_MAP[safeSearch] ?? "none");
  return body;
};
