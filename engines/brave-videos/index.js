export const type = "videos";
export const description =
  "Brave video search (HTML scraping). Results are parsed from the Brave Search video results page.";

const FALLBACK_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const BASE_URL = "https://search.brave.com/videos";

const _cookie = (lang, safeSearch) => {
  const parts = [`safesearch=${safeSearch}`, "useLocation=0"];
  if (lang && lang !== "en") {
    parts.push(`country=${lang}`, `ui_lang=${lang}-${lang}`);
  } else {
    parts.push("country=us", "ui_lang=en-us");
  }
  return parts.join("; ");
};

const _decode = (raw) =>
  raw
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

// Records look like: title:"...",url:"...",...,type:"video_result",
// video:{duration:"MM:SS",...,creator:"...",...},...,thumbnail:{src:"..."}
// Bounded lazy spans keep a match from bleeding into the next record.
const RESULT_RE =
  /title:"((?:[^"\\]|\\.)*)",url:"((?:[^"\\]|\\.)*)",[\s\S]{0,1500}?description:(?:"((?:[^"\\]|\\.)*)"|null)[\s\S]{0,800}?type:"video_result",video:\{duration:(?:"([^"]*)"|null)[\s\S]{0,600}?thumbnail:\{src:"((?:[^"\\]|\\.)*)"/g;

const _parseResults = (html, source) => {
  const results = [];
  for (const match of html.matchAll(RESULT_RE)) {
    const [, title, pageUrl, snippet, duration, thumbSrc] = match;
    const url = _decode(pageUrl);
    const thumbnail = _decode(thumbSrc);
    if (!url || !thumbnail) continue;
    results.push({
      title: _decode(title),
      url,
      snippet: snippet ? _decode(snippet) : "",
      source,
      thumbnail,
      duration: duration ?? "",
    });
  }
  return results;
};

export default class BraveVideosEngine {
  isClientExposed = false;
  name = "Brave Videos";
  bangShortcut = "bravev";
  safeSearch = "moderate";

  settingsSchema = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "strict"],
      default: "moderate",
      description: "Filter explicit content from video results.",
    },
  ];

  configure(settings) {
    if (typeof settings.safeSearch === "string")
      this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const args = { q: query, safesearch: this.safeSearch };
    if (page > 1) args.offset = String(page - 1);

    const url = `${BASE_URL}?${new URLSearchParams(args).toString()}`;
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: {
        "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
        "Accept-Encoding": "gzip, deflate",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
        Cookie: _cookie(context?.lang, this.safeSearch),
      },
      redirect: "follow",
    });
    context?.sentinel?.(response, this.name);

    const html = await response.text();
    return _parseResults(html, this.name);
  }
}
