import * as cheerio from "cheerio";

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const _decodeUrl = (href) => {
  if (!href.startsWith("https://www.bing.com/ck/a?")) return href;
  try {
    const u = new URL(href).searchParams.get("u");
    if (!u || !u.startsWith("a1")) return href;
    const b64 = u.slice(2).replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
    return atob(padded);
  } catch {
    return href;
  }
};

const _bingMkt = (lang, buildAL) => {
  if (lang.includes("-")) return lang;
  const al = buildAL?.();
  if (al) {
    const primary = al.split(",")[0].split(";")[0].trim();
    if (primary.includes("-")) return primary;
  }
  return lang;
};

export default class BingEngine {
  isClientExposed = false;
  name = "Bing";
  bangShortcut = "b";
  safeSearch = "off";

  settingsSchema = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "strict"],
      description: "Filter explicit content from search results.",
    },
  ];

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const first = (page - 1) * 50;
    const lang = context?.lang;
    let url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=50&first=${first}`;
    if (lang) url += `&setlang=${lang}&mkt=${_bingMkt(lang, context?.buildAcceptLanguage)}`;
    const adlt =
      this.safeSearch === "strict" || this.safeSearch === "moderate"
        ? this.safeSearch
        : "off";
    url += `&adlt=${adlt}`;
    const adltCookie = { strict: "STRICT", moderate: "DEMOTE", off: "OFF" }[adlt] ?? "OFF";
    if (timeFilter && timeFilter !== "any" && timeFilter !== "custom") {
      const freshMap = { hour: "Hour", day: "Day", week: "Week", month: "Month", year: "Year" };
      if (freshMap[timeFilter])
        url += `&filters=ex1%3a"ez5_${freshMap[timeFilter]}_TimeCustom"`;
    } else if (timeFilter === "custom" && (context?.dateFrom || context?.dateTo)) {
      const from = context?.dateFrom ?? "";
      const to = context?.dateTo ?? "";
      url += `&filters=${encodeURIComponent(`ex1:"ez5_Custom_TimeCustom" ex2:"CustomDate|${from}_${to}"`)}`;
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

    const items = $("li.b_algo").length > 0 ? $("li.b_algo") : $('li[class*="b_algo"]');
    items.each((_, el) => {
      const titleEl = $(el).find("h2 a").first();
      const snippetEl = $(el).find(".b_caption p").first();
      const title = titleEl.text().trim();
      const href = _decodeUrl(titleEl.attr("href") || "");
      const snippet = snippetEl.text().trim();
      if (title && href && href.startsWith("http")) {
        results.push({ title, url: href, snippet, source: this.name });
      }
    });

    if (results.length === 0) {
      $("#b_results li, main li").each((_, el) => {
        const $li = $(el);
        const titleEl = $li.find("h2 a").first();
        const href = _decodeUrl(titleEl.attr("href") || "");
        const title = titleEl.text().trim();
        if (title && href && href.startsWith("http")) {
          const snippetEl = $li.find("p").first();
          results.push({ title, url: href, snippet: snippetEl.text().trim(), source: this.name });
        }
      });
    }

    return results;
  }
}
