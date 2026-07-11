import * as cheerio from "cheerio";

export const type = "videos";

const OPERA_MINI_VARIANTS = [
  { version: "6.1", presto: "2.8.119", release: "11.10", platforms: ["J2ME/MIDP"] },
  { version: "7.0", presto: "2.8.119", release: "11.10", platforms: ["J2ME/MIDP"] },
  { version: "7.1", presto: "2.8.119", release: "11.10", platforms: ["J2ME/MIDP"] },
  { version: "4.2", presto: "2.5.25", release: "10.54", platforms: ["S60"] },
];

const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const _gsaAgent = () => {
  const v = _pick(OPERA_MINI_VARIANTS);
  const platform = _pick(v.platforms);
  const build = _randInt(10000, 49999);
  const subMajor = _randInt(20, 49);
  const subMinor = _randInt(100, 3999);
  return `Opera/9.80 (${platform}; Opera Mini/${v.version}.${build}/${subMajor}.${subMinor}; U; en) Presto/${v.presto} Version/${v.release}`;
};

const TBS_MAP = { hour: "qdr:h", day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" };

const _resolveTbs = (timeFilter) => {
  if (!timeFilter || timeFilter === "any" || timeFilter === "custom") return null;
  return TBS_MAP[timeFilter] ?? null;
};

const _resolveCustomTbs = (dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) return null;
  const parts = ["cdr:1"];
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) parts.push(`cd_min:${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`);
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) parts.push(`cd_max:${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`);
  }
  return parts.length > 1 ? parts.join(",") : null;
};

const _resolveHref = (href) => {
  if (!href.startsWith("/url?")) return href;
  try {
    const parsed = new URL(href, "https://www.google.com");
    return parsed.searchParams.get("q") || parsed.searchParams.get("url") || href;
  } catch {
    return href;
  }
};

const DURATION_RE = /^\d{1,3}:\d{2}$|^\d{1,3}:\d{2}:\d{2}$/;

const _ytThumbnail = (href) => {
  const match = href.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
  return match ? `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg` : "";
};

const _durationFromScope = ($, $scope) => {
  let found = "";
  $scope.find("span").each((_, node) => {
    if (found) return;
    const t = $(node).text().trim();
    if (DURATION_RE.test(t)) found = t;
  });
  return found;
};

const MUTANT_SIGNATURES = [
  "/httpservice/retry/enablejs",
  'Please click <a href="/httpservice',
  "unusual traffic from your computer network",
  "/sorry/index?continue=",
];

const _isInterstitial = (html) => {
  const head = html.slice(0, 4000);
  return MUTANT_SIGNATURES.some((m) => head.includes(m));
};

const _parseDesktop = ($, name) => {
  const results = [];
  const seen = new Set();
  $("a:has(h3)").each((_, el) => {
    const linkEl = $(el);
    const url = _resolveHref(linkEl.attr("href") || "");
    if (!url.startsWith("http") || url.includes("google.com")) return;
    const title = linkEl.find("h3").first().text().trim();
    if (!title || seen.has(url)) return;
    seen.add(url);
    const block = linkEl.closest("[data-hveid]");
    const snippet =
      block.find("[data-sncf]").first().text().trim() ||
      block.find(".VwiC3b").first().text().trim() ||
      "";
    results.push({
      title,
      url,
      snippet,
      source: name,
      thumbnail: _ytThumbnail(url),
      duration: block.length ? _durationFromScope($, block) : "",
    });
  });
  return results;
};

export default class GoogleVideosEngine {
  isClientExposed = false;
  name = "Google Videos";
  safeSearch = "off";
  resultsFormat = "lite";
  settingsSchema = [
    {
      key: "outgoingTransport",
      label: "Outgoing HTTP client transport",
      type: "select",
      options: ["fetch", "curl", "curl-fallback"],
      default: "curl",
      advanced: true,
    },
    {
      key: "resultsFormat",
      label: "Results format",
      type: "select",
      options: ["lite", "html"],
      optionLabels: ["Lite results", "HTML results"],
      default: "lite",
      description:
        "Lite results use a lightweight mobile page that works over any transport. HTML results fetch the full desktop results page for higher-quality results with proper titles, snippets and thumbnails, but require a real browser session; install [4play (lolcat)](https://github.com/degoog-org/official-extensions/tree/main/transports/lolcat-4play) from the Store tab and select it as this engine's transport.",
    },
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "on"],
      description: "Filter explicit content from video results.",
    },
  ];

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
    if (settings.resultsFormat === "lite" || settings.resultsFormat === "html")
      this.resultsFormat = settings.resultsFormat;
  }

  _buildParams(query, page, timeFilter, context) {
    const start = (page - 1) * 10;
    const lang = context?.lang || "en";
    const params = new URLSearchParams({
      q: query,
      tbm: "vid",
      hl: lang,
      lr: `lang_${lang}`,
      ie: "utf8",
      oe: "utf8",
      start: String(start),
      filter: "0",
    });

    const tbs = timeFilter === "custom"
      ? _resolveCustomTbs(context?.dateFrom, context?.dateTo)
      : _resolveTbs(timeFilter);
    if (tbs) params.set("tbs", tbs);
    if (this.safeSearch === "on") params.set("safe", "active");
    return params;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (this.resultsFormat === "html") {
      return this._searchHtml(query, page, timeFilter, context);
    }
    return this._searchLite(query, page, timeFilter, context);
  }

  async _searchHtml(query, page, timeFilter, context) {
    const params = this._buildParams(query, page, timeFilter, context);
    const userAgent = context?.userAgent?.() || _gsaAgent();
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(`https://www.google.com/search?${params.toString()}`, {
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+",
      },
      redirect: "follow",
    });

    context?.sentinel?.(response, this.name);
    const html = await response.text();

    if (_isInterstitial(html)) {
      if (context?.engineError) {
        throw context.engineError(
          "interstitial",
          `${this.name} returned a JavaScript/consent interstitial`,
          { engine: this.name },
        );
      }
      throw new Error(`${this.name} returned a JavaScript/consent interstitial`);
    }

    return _parseDesktop(cheerio.load(html), this.name);
  }

  async _searchLite(query, page = 1, timeFilter, context) {
    const start = (page - 1) * 10;
    const lang = context?.lang || "en";
    const params = new URLSearchParams({
      q: query,
      tbm: "vid",
      hl: lang,
      lr: `lang_${lang}`,
      ie: "utf8",
      oe: "utf8",
      start: String(start),
      filter: "0",
    });

    const tbs = timeFilter === "custom"
      ? _resolveCustomTbs(context?.dateFrom, context?.dateTo)
      : _resolveTbs(timeFilter);
    if (tbs) params.set("tbs", tbs);
    if (this.safeSearch === "on") params.set("safe", "active");

    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(`https://www.google.com/search?${params.toString()}`, {
      headers: {
        "User-Agent": _gsaAgent(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+",
      },
      redirect: "follow",
    });

    context?.sentinel?.(response, this.name);
    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();

    const pushVideo = (title, href, snippet, $scope) => {
      const url = _resolveHref(href);
      if (!title || !url || !url.startsWith("http") || url.includes("google.com/search") || seen.has(url)) return;
      seen.add(url);
      results.push({
        title,
        url,
        snippet,
        source: this.name,
        thumbnail: _ytThumbnail(url),
        duration: $scope?.length ? _durationFromScope($, $scope) : "",
      });
    };

    $('a[href^="/url?q="]').each((_, el) => {
      const linkEl = $(el);
      const title =
        linkEl.find("h3").first().text().trim() ||
        linkEl.find("span").first().text().trim();
      const href = linkEl.attr("href") || "";
      const snippet = linkEl.parent().next("div").text().trim();
      const block = linkEl.closest("[data-hveid]");
      pushVideo(title, href, snippet, block.length ? block : linkEl.parent());
    });

    if (results.length === 0) {
      $("[data-hveid] a[href]").each((_, el) => {
        const linkEl = $(el);
        const block = linkEl.closest("[data-hveid]");
        const title =
          linkEl.find("h3").first().text().trim() ||
          block.find("[role='link']").first().text().trim();
        const href = linkEl.attr("href") || "";
        const snippet = block.find("[data-sncf]").first().text().trim();
        pushVideo(title, href, snippet, block);
      });
    }

    return results;
  }
}
