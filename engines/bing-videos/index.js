import * as cheerio from "cheerio";

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const _bingMkt = (lang, buildAL) => {
  if (lang.includes("-")) return lang;
  const al = buildAL?.();
  if (al) {
    const primary = al.split(",")[0].split(";")[0].trim();
    if (primary.includes("-")) return primary;
  }
  return lang;
};

const _parseMmeta = (raw) => {
  try { return JSON.parse(raw); } catch { return null; }
};

const _tileTitle = ($tile) => {
  const aria = $tile.find("a[aria-label]").first().attr("aria-label")?.trim();
  if (aria) {
    const head = aria.split(/\bfrom\s+/i)[0]?.trim() ?? aria;
    return head.replace(/^[\s"'""]+|[\s"'""]+$/g, "").trim();
  }
  const titled = $tile.find("[title]").not("img").first().attr("title")?.trim();
  if (titled) return titled;
  return $tile.text().replace(/\s+/g, " ").trim();
};

const _tileDuration = ($tile) => {
  const hit = $tile.text().match(/\b\d{1,3}:\d{2}(:\d{2})?\b/);
  return hit?.[0] ?? "";
};

export default class BingVideosEngine {
  isClientExposed = false;
  name = "Bing Videos";
  safeSearch = "off";

  settingsSchema = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "strict"],
      description: "Filter explicit content from video results.",
    },
  ];

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const pageSize = 40;
    const first = (page - 1) * pageSize;
    const lang = context?.lang;
    let url = `https://www.bing.com/videos/search?q=${encodeURIComponent(query)}&count=${pageSize}&first=${first}&FORM=HDRSC3`;
    if (lang) url += `&setlang=${lang}&mkt=${_bingMkt(lang, context?.buildAcceptLanguage)}`;
    const adlt = this.safeSearch === "strict" || this.safeSearch === "moderate" ? this.safeSearch : "off";
    if (adlt !== "off") url += `&adlt=${adlt}`;
    const adltCookie = { strict: "STRICT", moderate: "DEMOTE", off: "OFF" }[adlt] ?? "OFF";
    if (timeFilter && timeFilter !== "any" && timeFilter !== "custom") {
      const map = { hour: "Hour", day: "Day", week: "Week", month: "Month", year: "Year" };
      if (map[timeFilter]) url += `&qft=+filterui:videoage-lt${map[timeFilter].toLowerCase()}`;
    }
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
    const seen = new Set();

    const $tiles = $('[data-svcptid="VideoResults"]').find("[mmeta]");
    $tiles.each((_, el) => {
      const $el = $(el);
      const data = _parseMmeta($el.attr("mmeta") ?? "");
      const videoUrl = data?.murl || data?.pgurl || "";
      if (!videoUrl.startsWith("http")) return;
      let thumbnail = data?.turl ?? "";
      if (!thumbnail) {
        const img = $el.find("img").first();
        thumbnail = img.attr("data-src-hq") || img.attr("src") || "";
      }
      const title = _tileTitle($el);
      const duration = _tileDuration($el);
      if (!title || seen.has(videoUrl)) return;
      seen.add(videoUrl);
      results.push({ title, url: videoUrl, snippet: "", source: this.name, thumbnail, duration });
    });

    return results;
  }
}

export const type = "videos";
