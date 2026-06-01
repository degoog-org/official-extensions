const BASE_URL = "https://www.reddit.com/search.rss";
const SEARCH_LIMIT = 25;
const FALLBACK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0";

const _decodeEntities = (str) =>
  str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");

const _stripTags = (html) =>
  html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const _parseEntries = (xml) => {
  const entries = [];
  const rx = /<entry>([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = rx.exec(xml)) !== null) entries.push(m[1]);
  return entries;
};

const _tag = (name, block) => {
  const m = block.match(
    new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`, "i"),
  );
  return m ? m[1].trim() : "";
};

const _atomLink = (block) => {
  const m = block.match(/<link[^>]+href="([^"]+)"/i);
  return m ? m[1].trim() : "";
};

export default class RedditEngine {
  isClientExposed = false;
  name = "Reddit";
  bangShortcut = "r";
  includeNsfw = "false";
  sortBy = "hot";

  settingsSchema = [
    {
      key: "includeNsfw",
      label: "Include NSFW",
      type: "toggle",
      description: "Show NSFW posts in search results.",
    },
    {
      key: "sortBy",
      label: "Sort By",
      type: "select",
      options: ["hot", "relevance", "new", "top"],
      description: "How to sort Reddit search results.",
      default: "hot",
    },
  ];

  configure(settings) {
    if (typeof settings.includeNsfw === "string") this.includeNsfw = settings.includeNsfw;
    if (typeof settings.sortBy === "string") this.sortBy = settings.sortBy;
  }

  _mapTime(t) {
    if (!t || t === "any") return "all";
    return t;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const params = new URLSearchParams({
      q: query,
      sort: this.sortBy,
      t: this._mapTime(timeFilter),
      include_over_18: this.includeNsfw === "true" ? "1" : "0",
      limit: String(SEARCH_LIMIT),
    });

    if (page > 1) params.set("count", String((page - 1) * SEARCH_LIMIT));

    const url = `${BASE_URL}?${params.toString()}`;
    const doFetch = context?.fetch ?? fetch;

    const response = await doFetch(url, {
      headers: {
        "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
        "Accept": "application/atom+xml, application/xml, text/xml, */*",
        "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
      },
    });

    context?.sentinel?.(response, this.name);

    const xml = await response.text();
    const results = [];

    for (const entry of _parseEntries(xml)) {
      const title = _decodeEntities(_tag("title", entry));
      const link = _atomLink(entry);
      const content = _stripTags(_decodeEntities(_tag("content", entry)));
      const category = _decodeEntities(_tag("category", entry));

      if (!title || !link) continue;

      results.push({
        title,
        url: link,
        snippet: content.substring(0, 200) || category,
        source: this.name,
      });
    }

    return results;
  }
}
