import * as cheerio from "cheerio";

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
const ASYNC_PAGE_SIZE = 35;

const _bingMkt = (lang, buildAL) => {
  if (lang.includes("-")) return lang;
  const al = buildAL?.();
  if (al) {
    const primary = al.split(",")[0].split(";")[0].trim();
    if (primary.includes("-")) return primary;
  }
  return lang;
};

const SIZE_MAP = { small: "Small", medium: "Medium", large: "Large", wallpaper: "Wallpaper" };
const COLOR_MAP = {
  monochrome: "BW", red: "FGcls_RED", orange: "FGcls_ORANGE", yellow: "FGcls_YELLOW",
  green: "FGcls_GREEN", teal: "FGcls_TEAL", blue: "FGcls_BLUE", purple: "FGcls_PURPLE",
  pink: "FGcls_PINK", white: "FGcls_WHITE", gray: "FGcls_GRAY", brown: "FGcls_BROWN", black: "FGcls_BLACK",
};
const TYPE_MAP = { photo: "photo", clipart: "clipart", lineart: "linedrawing", animated: "animatedgif" };
const LAYOUT_MAP = { square: "Square", wide: "Wide", tall: "Tall" };

const _qft = (timeFilter, img) => {
  const parts = [];
  if (timeFilter && timeFilter !== "any" && timeFilter !== "custom") {
    const map = { hour: "Hour", day: "Day", week: "Week", month: "Month", year: "Year" };
    if (map[timeFilter]) parts.push(`filterui:age-lt${map[timeFilter].toLowerCase()}`);
  }
  if (img?.size && img.size !== "any" && SIZE_MAP[img.size]) parts.push(`filterui:imagesize-${SIZE_MAP[img.size]}`);
  if (img?.color && img.color !== "any" && COLOR_MAP[img.color]) parts.push(`filterui:color2-${COLOR_MAP[img.color]}`);
  if (img?.type && img.type !== "any" && TYPE_MAP[img.type]) parts.push(`filterui:photo-${TYPE_MAP[img.type]}`);
  if (img?.layout && img.layout !== "any" && LAYOUT_MAP[img.layout]) parts.push(`filterui:aspect-${LAYOUT_MAP[img.layout]}`);
  return parts.length > 0 ? `+${parts.join("+")}` : "";
};

export default class BingImagesEngine {
  isClientExposed = false;
  name = "Bing Images";
  safeSearch = "off";

  settingsSchema = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "strict"],
      description: "Filter explicit content from image results.",
    },
  ];

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const first = (page - 1) * ASYNC_PAGE_SIZE;
    const lang = context?.lang;
    let url = `https://www.bing.com/images/async?q=${encodeURIComponent(query)}&async=content&count=${ASYNC_PAGE_SIZE}&first=${first}`;
    if (lang) url += `&setlang=${lang}&mkt=${_bingMkt(lang, context?.buildAcceptLanguage)}`;
    const nsfw = context?.imageFilter?.nsfw;
    let adlt = this.safeSearch === "strict" || this.safeSearch === "moderate" ? this.safeSearch : "off";
    if (nsfw === "on") adlt = "strict";
    else if (nsfw === "moderate") adlt = "moderate";
    else if (nsfw === "off") adlt = "off";
    url += `&adlt=${adlt}`;
    const adltCookie = { strict: "STRICT", moderate: "DEMOTE", off: "OFF" }[adlt] ?? "OFF";
    const qft = _qft(timeFilter, context?.imageFilter);
    if (qft) url += `&qft=${qft}`;
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: {
        "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        Cookie: `SRCHHPGUSR=ADLT=${adltCookie}`,
      },
      redirect: "follow",
    });
    context?.sentinel?.(response, this.name);
    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];

    $("a.iusc").each((_, el) => {
      const meta = $(el).attr("m") || "";
      try {
        const data = JSON.parse(meta);
        if (data.murl && data.turl) {
          results.push({
            title: data.t || data.desc || "",
            url: data.purl || data.murl,
            snippet: data.desc || "",
            source: this.name,
            thumbnail: data.turl,
            imageUrl: data.murl,
          });
        }
      } catch { }
    });

    if (results.length === 0) {
      $("a.thumb").each((_, el) => {
        const href = $(el).attr("href") || "";
        const img = $(el).find("img");
        const thumbnail = img.attr("src") || img.attr("data-src") || "";
        const title = img.attr("alt") || "";
        if (thumbnail && title) {
          results.push({
            title,
            url: href.startsWith("http") ? href : `https://www.bing.com${href}`,
            snippet: "",
            source: this.name,
            thumbnail,
          });
        }
      });
    }

    return results;
  }
}

export const type = "images";
