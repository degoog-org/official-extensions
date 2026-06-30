export const type = "images";
export const description =
  "Brave image search (HTML scraping). Results are parsed from the Brave Search image results page.";
export const filters = {
  nsfw: ["on", "moderate", "off"],
};

const FALLBACK_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const BASE_URL = "https://search.brave.com/images";

const _cookie = (lang, safeSearch) => {
  const parts = [`safesearch=${safeSearch}`, "useLocation=0"];
  if (lang && lang !== "en") {
    parts.push(`country=${lang}`, `ui_lang=${lang}-${lang}`);
  } else {
    parts.push("country=us", "ui_lang=en-us");
  }
  return parts.join("; ");
};

const _resolveSafe = (engineSafe, context) => {
  const nsfw = context?.imageFilter?.nsfw;
  if (nsfw === "on") return "strict";
  if (nsfw === "moderate") return "moderate";
  if (nsfw === "off") return "off";
  return engineSafe;
};

const _decode = (raw) =>
  raw
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

const RESULT_RE =
  /title:"((?:[^"\\]|\\.)*)",url:"((?:[^"\\]|\\.)*)"[\s\S]*?source:"((?:[^"\\]|\\.)*)"[\s\S]*?thumbnail:\{src:"((?:[^"\\]|\\.)*)"[\s\S]*?original:"((?:[^"\\]|\\.)*)"/g;

const _parseResults = (html, source) => {
  const results = [];
  for (const match of html.matchAll(RESULT_RE)) {
    const [, title, pageUrl, , thumbSrc, original] = match;
    const thumbnail = _decode(thumbSrc);
    const imageUrl = _decode(original);
    if (!thumbnail || !imageUrl) continue;
    results.push({
      title: _decode(title),
      url: _decode(pageUrl) || imageUrl,
      snippet: "",
      source,
      thumbnail,
      imageUrl,
    });
  }
  return results;
};

export default class BraveImagesEngine {
  isClientExposed = false;
  name = "Brave Images";
  bangShortcut = "bravei";
  safeSearch = "moderate";

  settingsSchema = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "strict"],
      default: "moderate",
      description: "Filter explicit content from image results.",
    },
  ];

  configure(settings) {
    if (typeof settings.safeSearch === "string")
      this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const safe = _resolveSafe(this.safeSearch, context);
    const args = { q: query, safesearch: safe };
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
        Cookie: _cookie(context?.lang, safe),
      },
      redirect: "follow",
    });
    context?.sentinel?.(response, this.name);

    const html = await response.text();
    return _parseResults(html, this.name);
  }
}
