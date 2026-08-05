export const type = "videos";
export const description =
  "DuckDuckGo video search. Results come from DuckDuckGo's video search JSON endpoint.";

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const PAGE_SIZE = 60;

const SAFE_STRICT = "1";
const SAFE_MODERATE = "-1";
const SAFE_OFF = "-2";

const _extractVqd = (html) => {
  const match = html.match(/vqd=['"]([^'"]+)['"]/);
  return match ? match[1] : null;
};

const _thumbnail = (images) => {
  if (!images || typeof images !== "object") return "";
  return images.small ?? images.medium ?? images.large ?? "";
};

export default class DuckDuckGoVideosEngine {
  isClientExposed = false;
  name = "DuckDuckGo Videos";
  bangShortcut = "ddgv";
  safeSearch = "moderate";
  settingsSchema = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "on"],
      default: "moderate",
      description: "Filter explicit content from video results.",
    },
  ];

  configure(settings) {
    if (typeof settings.safeSearch === "string") {
      this.safeSearch = settings.safeSearch;
    }
  }

  _resolveSafe() {
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
    const safe = this._resolveSafe();
    const region = this._region(context);
    const headers = this._headers(context, safe, region);

    const initRes = await doFetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=videos&iax=videos&ia=videos`,
      { headers },
    );
    context?.sentinel?.(initRes, this.name);
    const initHtml = await initRes.text();
    const vqd = _extractVqd(initHtml);
    if (!vqd) return [];

    const offset = (page - 1) * PAGE_SIZE;
    const params = new URLSearchParams({
      o: "json",
      q: query,
      vqd,
      l: region,
      p: safe,
      s: String(offset),
    });

    const res = await doFetch(
      `https://duckduckgo.com/v.js?${params.toString()}`,
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
        url: item.content ?? "",
        snippet: item.description ?? "",
        source: this.name,
        thumbnail: _thumbnail(item.images),
        duration: item.duration ?? "",
      }))
      .filter((r) => r.url && r.title);
  }
}
