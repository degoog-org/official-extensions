import * as cheerio from "cheerio";

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const SAFE_SEARCH_MAP = { off: "-2", moderate: "-1", strict: "1" };

const _resolveRedirect = (href) => {
  try {
    const parsed = new URL(href, "https://duckduckgo.com");
    if (parsed.searchParams.has("uddg")) return parsed.searchParams.get("uddg");
    if (parsed.pathname.endsWith("/y.js") && parsed.searchParams.has("u")) return parsed.searchParams.get("u");
  } catch {}
  return href;
};

const _isInternal = (url) => {
  try {
    const h = new URL(url).hostname;
    return h === "duckduckgo.com" || h.endsWith(".duckduckgo.com");
  } catch { return false; }
};

export default class DuckDuckGoEngine {
  isClientExposed = false;
  name = "DuckDuckGo";
  bangShortcut = "ddg";
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

  async executeSearch(query, page, timeFilter, context) {
    const offset = ((page || 1) - 1) * 30;
    const lang = context?.lang;
    const safe = SAFE_SEARCH_MAP[this.safeSearch];
    const params = new URLSearchParams({ q: query });
    if (offset > 0) { params.set("s", String(offset)); params.set("dc", String(offset + 1)); }
    if (lang && lang !== "en") params.set("kl", `${lang}-${lang}`);
    if (safe) params.set("kp", safe);
    if (timeFilter && timeFilter !== "any" && timeFilter !== "custom") {
      const dfMap = { hour: "h", day: "d", week: "w", month: "m", year: "y" };
      if (dfMap[timeFilter]) params.set("df", dfMap[timeFilter]);
    }
    const url = `https://html.duckduckgo.com/html/?${params.toString()}`;
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: {
        "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: "https://duckduckgo.com/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        ...(safe ? { Cookie: `p=${safe}` } : {}),
      },
      redirect: "follow",
    });
    context?.sentinel?.(response, this.name);
    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];

    $(".result").each((_, el) => {
      const titleEl = $(el).find(".result__title a").first();
      const snippetEl = $(el).find(".result__snippet").first();
      const title = titleEl.text().trim();
      let href = titleEl.attr("href") || "";
      const snippet = snippetEl.text().trim();
      href = _resolveRedirect(href);
      if (title && href && href.startsWith("http") && !_isInternal(href)) {
        results.push({ title, url: href, snippet, source: this.name });
      }
    });

    return results;
  }
}
