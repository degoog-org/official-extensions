import * as cheerio from "cheerio";

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const TIME_RANGE_MAP = { day: "pd", week: "pw", month: "pm", year: "py" };

export default class BraveNewsEngine {
  isClientExposed = false;
  name = "Brave News";
  bangShortcut = "bravenews";
  safeSearch = "moderate";

  settingsSchema = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "strict"],
      default: "moderate",
      description: "Filter explicit content from search results.",
    },
  ];

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!query.trim()) return [];
    const params = { q: query };
    if (page > 1) params.offset = String(page - 1);
    if (timeFilter && timeFilter !== "any" && timeFilter !== "custom" && TIME_RANGE_MAP[timeFilter]) {
      params.tf = TIME_RANGE_MAP[timeFilter];
    }
    const lang = context?.lang;
    const cookie = lang && lang !== "en"
      ? `safesearch=${this.safeSearch}; useLocation=0; country=${lang}; ui_lang=${lang}-${lang}`
      : `safesearch=${this.safeSearch}; useLocation=0; country=us; ui_lang=en-us`;
    const url = `https://search.brave.com/news?${new URLSearchParams(params)}`;
    const doFetch = context?.fetch ?? fetch;
    const res = await doFetch(url, {
      headers: {
        "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
        "Accept-Encoding": "gzip, deflate",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
        Cookie: cookie,
      },
      redirect: "follow",
    });
    context?.sentinel?.(res, this.name);

    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    $("a.l1.svelte-md19lk, a[href^='http'][target='_self'][class*='svelte']").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href") ?? "";
      if (!href) return;
      try {
        const parsed = new URL(href, "https://search.brave.com");
        if (parsed.hostname === "search.brave.com") return;
      } catch { return; }
      const title = $el.find("div.title.svelte-md19lk").text().trim()
        || $el.find(".title").text().trim()
        || $el.text().trim();
      const snippet = $el.find("div.description.t-primary").text().trim()
        || $el.find(".content .description").text().trim()
        || "";
      const thumbnail = context?.extractImageUrl?.($el, "https://search.brave.com", [
        ".snippet-thumbnail-wrapper .thumbnail img",
        ".result-thumbnail-wrapper .thumbnail img",
        ".thumbnail img",
        "img.thumb",
      ]) ?? "";
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
