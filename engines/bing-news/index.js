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

const TIME_RANGE_MAP = {
  hour: 'ex1:"ez1"',
  day: 'ex1:"ez2"',
  week: 'ex1:"ez3"',
  month: 'ex1:"ez5"',
};

export default class BingNewsEngine {
  isClientExposed = false;
  name = "Bing News";
  bangShortcut = "bingnews";

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!query.trim()) return [];
    const offset = (page - 1) * 10;
    const lang = context?.lang;
    const params = new URLSearchParams({ q: query, form: "NSBABR" });
    if (lang) {
      params.set("setlang", lang);
      params.set("mkt", _bingMkt(lang, context?.buildAcceptLanguage));
    }
    if (offset > 0) params.set("first", String(offset + 1));
    if (timeFilter && timeFilter !== "any" && timeFilter !== "custom" && TIME_RANGE_MAP[timeFilter]) {
      params.set("qft", TIME_RANGE_MAP[timeFilter]);
    }
    const url = `https://www.bing.com/news/search?${params}`;
    const doFetch = context?.fetch ?? fetch;
    const res = await doFetch(url, {
      headers: {
        "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    context?.sentinel?.(res, this.name);

    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    $(".news-card").each((_, el) => {
      const $el = $(el);
      const href =
        $el.attr("url") || $el.attr("data-url") ||
        $el.find("a[href^='http']").first().attr("href") || "";
      if (!href || !href.startsWith("http")) return;

      const title = $el.find(".title").text().trim() || $el.find("a.title").text().trim();
      const snippet = $el.find(".snippet").text().trim();
      const thumbnail = context?.extractImageUrl?.($el, "https://www.bing.com", [".image img", ".imagelink img"]) ?? "";

      if (title) {
        results.push({
          title, url: href, snippet, source: this.name,
          ...(thumbnail ? { thumbnail } : {}),
        });
      }
    });

    return results;
  }
}

export const type = "news";
