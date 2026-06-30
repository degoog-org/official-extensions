import { parseGoogleImagesHtml } from "./parse-html.js";
import { parseGoogleImagesJson } from "./parse-json.js";

export const type = "images";
export const description =
  "Google Images search. Pick JSON or HTML results in engine settings, each mode recommends a transport from the Store.";
export const filters = {
  size: ["small", "medium", "large", "wallpaper"],
  color: [
    "monochrome",
    "red",
    "orange",
    "yellow",
    "green",
    "teal",
    "blue",
    "purple",
    "pink",
    "white",
    "gray",
    "brown",
    "black",
    "transparent",
  ],
  type: ["photo", "clipart", "lineart", "animated"],
  layout: ["square", "wide", "tall"],
  nsfw: ["on", "moderate", "off"],
};

const OPERA_MINI_VARIANTS = [
  {
    version: "6.1",
    presto: "2.8.119",
    release: "11.10",
    platforms: ["J2ME/MIDP"],
  },
  {
    version: "7.0",
    presto: "2.8.119",
    release: "11.10",
    platforms: ["J2ME/MIDP"],
  },
  {
    version: "7.1",
    presto: "2.8.119",
    release: "11.10",
    platforms: ["J2ME/MIDP"],
  },
  { version: "4.2", presto: "2.5.25", release: "10.54", platforms: ["S60"] },
];

const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _randInt = (min, max) =>
  min + Math.floor(Math.random() * (max - min + 1));

const _gsaAgent = () => {
  const v = _pick(OPERA_MINI_VARIANTS);
  const platform = _pick(v.platforms);
  const build = _randInt(10000, 49999);
  const subMajor = _randInt(20, 49);
  const subMinor = _randInt(100, 3999);
  return `Opera/9.80 (${platform}; Opera Mini/${v.version}.${build}/${subMajor}.${subMinor}; U; en) Presto/${v.presto} Version/${v.release}`;
};

const TBS_MAP = {
  hour: "qdr:h",
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
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

const GOOGLE_SIZE_MAP = {
  small: "imgsz:small",
  medium: "imgsz:medium",
  large: "imgsz:large",
  wallpaper: "imgsz:xlarge",
};

const GOOGLE_COLOR_MAP = {
  monochrome: "ic:gray",
  red: "ic:specific,isc:red",
  orange: "ic:specific,isc:orange",
  yellow: "ic:specific,isc:yellow",
  green: "ic:specific,isc:green",
  teal: "ic:specific,isc:teal",
  blue: "ic:specific,isc:blue",
  purple: "ic:specific,isc:purple",
  pink: "ic:specific,isc:pink",
  white: "ic:specific,isc:white",
  gray: "ic:specific,isc:gray",
  brown: "ic:specific,isc:brown",
  black: "ic:specific,isc:black",
  transparent: "ic:trans",
};

const GOOGLE_TYPE_MAP = {
  photo: "itp:photo",
  clipart: "itp:clipart",
  lineart: "itp:lineart",
  animated: "itp:animated",
};

const GOOGLE_LAYOUT_MAP = {
  square: "iar:s",
  wide: "iar:w",
  tall: "iar:t",
};

const _buildImgTbs = (imgFilter) => {
  const parts = [];
  if (
    imgFilter?.size &&
    imgFilter.size !== "any" &&
    GOOGLE_SIZE_MAP[imgFilter.size]
  )
    parts.push(GOOGLE_SIZE_MAP[imgFilter.size]);
  if (
    imgFilter?.color &&
    imgFilter.color !== "any" &&
    GOOGLE_COLOR_MAP[imgFilter.color]
  )
    parts.push(GOOGLE_COLOR_MAP[imgFilter.color]);
  if (
    imgFilter?.type &&
    imgFilter.type !== "any" &&
    GOOGLE_TYPE_MAP[imgFilter.type]
  )
    parts.push(GOOGLE_TYPE_MAP[imgFilter.type]);
  if (
    imgFilter?.layout &&
    imgFilter.layout !== "any" &&
    GOOGLE_LAYOUT_MAP[imgFilter.layout]
  )
    parts.push(GOOGLE_LAYOUT_MAP[imgFilter.layout]);
  return parts.join(",");
};

const MUTANT_SIGNATURES = [
  "/httpservice/retry/enablejs",
  'Please click <a href="/httpservice',
  "unusual traffic from your computer network",
  "/sorry/index?continue=",
];

const _isInterstitial = (html) => {
  const head = html.slice(0, 4000);
  return MUTANT_SIGNATURES.some((m) => head.includes(m));
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

  const nsfwOverride = context?.imageFilter?.nsfw;
  let wantsSafe = safeSearch === "on" || safeSearch === "moderate";
  if (nsfwOverride === "on" || nsfwOverride === "moderate") {
    wantsSafe = true;
  } else if (nsfwOverride === "off") {
    wantsSafe = false;
  }
  params.set("safe", wantsSafe ? "active" : "off");
};

export default class GoogleImagesEngine {
  isClientExposed = false;
  name = "Google Images";
  safeSearch = "moderate";
  resultsFormat = "json";
  settingsSchema = [
    {
      key: "resultsFormat",
      label: "Results format",
      type: "select",
      options: ["json", "html"],
      optionLabels: ["JSON results", "HTML results"],
      default: "json",
      description:
        "For JSON results, install [degoog-4play](https://github.com/degoog-org/official-extensions/tree/main/transports/degoog-fplay) from the Store tab. For HTML results, install [4play (lolcat)](https://github.com/degoog-org/official-extensions/tree/main/transports/lolcat-4play) from the Store tab.",
    },
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "on"],
      default: "moderate",
      description: "Filter explicit content from image results.",
    },
  ];

  configure(settings) {
    if (typeof settings.safeSearch === "string")
      this.safeSearch = settings.safeSearch;
    if (
      settings.resultsFormat === "json" ||
      settings.resultsFormat === "html"
    ) {
      this.resultsFormat = settings.resultsFormat;
    }
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (this.resultsFormat === "html") {
      return this._searchHtml(query, page, timeFilter, context);
    }
    return this._searchJson(query, page, timeFilter, context);
  }

  async _searchJson(query, page, timeFilter, context) {
    const params = new URLSearchParams({
      q: query,
      tbm: "isch",
      asearch: "isch",
    });
    _applyFilters(params, timeFilter, context, this.safeSearch);

    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(
      `https://www.google.com/search?${params.toString()}&async=_fmt:json,p:1,ijn:${page - 1}`,
      {
        headers: {
          "User-Agent": _gsaAgent(),
          Accept: "*/*",
          "Accept-Language":
            context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
          Cookie: "CONSENT=YES+",
        },
      },
    );

    context?.sentinel?.(response, this.name);
    return parseGoogleImagesJson(await response.text(), this.name);
  }

  async _searchHtml(query, page, timeFilter, context) {
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
    _applyFilters(params, timeFilter, context, this.safeSearch);

    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(
      `https://www.google.com/search?${params.toString()}`,
      {
        headers: {
          "User-Agent": _gsaAgent(),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language":
            context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
          Cookie: "CONSENT=YES+",
        },
        redirect: "follow",
      },
    );

    context?.sentinel?.(response, this.name);
    const html = await response.text();

    if (_isInterstitial(html)) {
      if (context?.engineError) {
        throw context.engineError(
          "interstitial",
          `${this.name} returned a JavaScript/consent interstitial`,
          { engine: this.name },
        );
      }
      throw new Error(
        `${this.name} returned a JavaScript/consent interstitial`,
      );
    }

    return parseGoogleImagesHtml(html, this.name);
  }
}
