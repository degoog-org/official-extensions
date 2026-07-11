export const type = "images";
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
  ],
  type: ["photo", "clipart", "lineart", "animated", "transparent"],
  layout: ["square", "wide", "tall"],
  nsfw: ["on", "moderate", "off"],
};

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const DDG_SIZE_MAP = {
  large: "Large",
  medium: "Medium",
  small: "Small",
  wallpaper: "Wallpaper",
};

const DDG_COLOR_MAP = {
  black: "Black",
  blue: "Blue",
  brown: "Brown",
  gray: "Gray",
  green: "Green",
  monochrome: "Monochrome",
  orange: "Orange",
  pink: "Pink",
  purple: "Purple",
  red: "Red",
  teal: "Teal",
  white: "White",
  yellow: "Yellow",
};

const DDG_TYPE_MAP = {
  photo: "photo",
  clipart: "clipart",
  lineart: "lineart",
  animated: "gif",
  transparent: "transparent",
};

const DDG_LAYOUT_MAP = {
  square: "Square",
  tall: "Tall",
  wide: "Wide",
};

const SAFE_STRICT = "1";
const SAFE_MODERATE = "-1";
const SAFE_OFF = "-2";

const _extractVqd = (html) => {
  const match = html.match(/vqd=['"]([^'"]+)['"]/);
  return match ? match[1] : null;
};

const _mkFilters = (imageFilter) => {
  const f = imageFilter ?? {};
  const slots = [
    DDG_SIZE_MAP[f.size] ? `size:${DDG_SIZE_MAP[f.size]}` : "",
    DDG_COLOR_MAP[f.color] ? `color:${DDG_COLOR_MAP[f.color]}` : "",
    DDG_TYPE_MAP[f.type] ? `type:${DDG_TYPE_MAP[f.type]}` : "",
    DDG_LAYOUT_MAP[f.layout] ? `layout:${DDG_LAYOUT_MAP[f.layout]}` : "",
    "",
    "",
  ];
  return slots.join(",");
};

export default class DuckDuckGoImagesEngine {
  isClientExposed = false;
  name = "DuckDuckGo Images";
  bangShortcut = "ddgi";
  safeSearch = "moderate";
  hideAiImages = "show";
  settingsSchema = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "on"],
      default: "moderate",
      description: "Filter explicit content from image results.",
    },
    {
      key: "hideAiImages",
      label: "AI Images",
      type: "select",
      options: ["show", "hide"],
      description: "Hide AI-generated images from results using DuckDuckGo's built-in filter.",
    },
  ];

  configure(settings) {
    if (typeof settings.safeSearch === "string") {
      this.safeSearch = settings.safeSearch;
    }
    if (typeof settings.hideAiImages === "string") {
      this.hideAiImages = settings.hideAiImages;
    }
  }

  _resolveSafe(context) {
    const nsfw = context?.imageFilter?.nsfw;
    if (nsfw === "on") return SAFE_STRICT;
    if (nsfw === "moderate") return SAFE_MODERATE;
    if (nsfw === "off") return SAFE_OFF;
    if (this.safeSearch === "on") return SAFE_STRICT;
    if (this.safeSearch === "moderate") return SAFE_MODERATE;
    return SAFE_OFF;
  }

  _region(context) {
    const lang = context?.lang;
    if (!lang || lang === "en") return "us-en";
    return `${lang}-${lang}`;
  }

  _headers(context, safe, region) {
    return {
      "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": context?.buildAcceptLanguage?.() ?? "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Cookie: `p=${safe}; ah=${region}; l=${region}`,
    };
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const safe = this._resolveSafe(context);
    const region = this._region(context);
    const headers = this._headers(context, safe, region);

    const initRes = await doFetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=images&iax=images&ia=images`,
      { headers },
    );
    context?.sentinel?.(initRes, this.name);
    const initHtml = await initRes.text();
    const vqd = _extractVqd(initHtml);
    if (!vqd) return [];

    const imageFilter = context?.imageFilter ?? {};
    const offset = (page - 1) * 100;

    const params = new URLSearchParams({
      o: "json",
      q: query,
      vqd,
      u: "bing",
      bpia: "1",
      l: region,
      p: safe,
      s: String(offset),
      f: _mkFilters(imageFilter),
      ...(this.hideAiImages === "hide" ? { kbj: "1" } : {}),
    });

    const res = await doFetch(
      `https://duckduckgo.com/i.js?${params.toString()}`,
      {
        headers: {
          ...headers,
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: "https://duckduckgo.com/",
          "X-Requested-With": "XMLHttpRequest",
        },
      },
    );

    context?.sentinel?.(res, this.name);

    const data = await res.json();
    const items = data?.results ?? [];

    return items
      .map((item) => ({
        title: item.title ?? "",
        url: item.url ?? "",
        snippet: item.title ?? "",
        source: this.name,
        thumbnail: item.thumbnail ?? "",
        imageUrl: item.image ?? item.thumbnail ?? "",
      }))
      .filter((r) => r.url && r.thumbnail);
  }
}
