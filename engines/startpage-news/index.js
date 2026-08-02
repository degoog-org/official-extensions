export const type = "news";
export const description =
  "Startpage news search. Results are parsed from Startpage's news results page (Bing-syndicated, fetched anonymously through Startpage).";

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
const BASE_URL = "https://www.startpage.com";
const SEARCH_URL = `${BASE_URL}/sp/search`;

const TIME_MAP = { hour: "h", day: "d", week: "w", month: "m", year: "y" };

const CAPTCHA_MARKERS = [
  "/sp/captcha",
  "Startpage Captcha",
  "CAPTCHA Verification",
  "captcha-section",
];

const _isCaptcha = (html) => {
  const head = html.slice(0, 6000);
  return CAPTCHA_MARKERS.some((m) => head.includes(m));
};

const _buildPrefs = (safeSearch) => {
  const f = safeSearch === "on" ? "0" : "1";
  return [
    `date_timeEEEworld`,
    `disable_family_filterEEE${f}`,
    `disable_open_in_new_windowEEE0`,
    `enable_post_methodEEE1`,
    `enable_proxy_safety_suggestEEE0`,
    `enable_stay_controlEEE0`,
    `instant_answersEEE1`,
    `lang_homepageEEEs%2Fdevice%2Fen`,
    `languageEEEenglish`,
    `language_uiEEEenglish`,
    `num_of_resultsEEE20`,
    `search_results_regionEEEall`,
    `suggestionsEEE1`,
    `wt_unitEEEcelsius`,
  ].join("N1N");
};

const _extractSerpJson = (html) => {
  const match = html.match(/React\.createElement\(UIStartpage\.AppSerpNews, ?(.+)\),?$/m);
  return match ? match[1] : null;
};

const _esc = (str) => {
  if (typeof str !== "string") return "";
  return str
    .replace(/[\ue000\ue001]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const _absolute = (url) => {
  if (typeof url !== "string" || !url) return "";
  try {
    return new URL(url, BASE_URL).href;
  } catch {
    return "";
  }
};

export default class StartpageNewsEngine {
  isClientExposed = false;
  name = "Startpage News";
  bangShortcut = "spn";
  safeSearch = "off";
  useAnonymousView = false;
  _searchSc = null;

  settingsSchema = [
    {
      key: "useAnonymousView",
      label: "Use Anonymous View",
      type: "toggle",
      description: "Open result links via Startpage's proxy so the destination site does not see your IP.",
    },
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "on"],
      description: "Filter explicit content from news results.",
    },
  ];

  configure(settings) {
    this.useAnonymousView = settings.useAnonymousView === true || settings.useAnonymousView === "true";
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
  }

  _parseError(context, message) {
    if (context?.engineError) {
      return context.engineError("parse_error", message, { engine: this.name });
    }
    return new Error(message);
  }

  _baseHeaders(context) {
    return {
      "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      Cookie: `preferences=${_buildPrefs(this.safeSearch)}`,
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    };
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const p = Math.max(1, page || 1);
    let html;

    if (p > 1 && this._searchSc) {
      const body = new URLSearchParams({
        query,
        cat: "news",
        t: "device",
        sc: this._searchSc,
        segment: "organic",
        abd: "0",
        abe: "0",
        qsr: "all",
        page: String(p),
      });
      if (this.safeSearch !== "off") body.set("qadf", "heavy");
      const res = await doFetch(SEARCH_URL, {
        method: "POST",
        headers: {
          ...this._baseHeaders(context),
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `${BASE_URL}/`,
          "Sec-Fetch-Site": "same-origin",
        },
        body: body.toString(),
        redirect: "follow",
      });
      context?.sentinel?.(res, this.name);
      html = await res.text();
    } else {
      const params = new URLSearchParams({ query, cat: "news", pl: "opensearch" });
      if (this.safeSearch !== "off") params.set("qadf", "heavy");
      if (context?.lang) params.set("language", context.lang);
      if (timeFilter && timeFilter !== "any" && timeFilter !== "custom" && TIME_MAP[timeFilter]) {
        params.set("with_date", TIME_MAP[timeFilter]);
      }
      const res = await doFetch(`${SEARCH_URL}?${params.toString()}`, {
        headers: this._baseHeaders(context),
        redirect: "follow",
      });
      context?.sentinel?.(res, this.name);
      html = await res.text();
    }

    if (_isCaptcha(html)) {
      const message = `${this.name} served a CAPTCHA challenge (anti-bot block)`;
      if (context?.engineError) {
        throw context.engineError("captcha", message, { engine: this.name });
      }
      throw new Error(message);
    }

    const jsonStr = _extractSerpJson(html);
    if (!jsonStr) {
      throw this._parseError(context, `${this.name} returned a page without parseable results`);
    }

    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      throw this._parseError(context, `${this.name} returned malformed result data`);
    }

    if (data?.render?.search_sc) this._searchSc = data.render.search_sc;

    const mainline = data?.render?.presenter?.regions?.mainline;
    if (!Array.isArray(mainline)) {
      throw this._parseError(context, `${this.name} response layout was not recognised`);
    }

    const results = [];
    for (const block of mainline) {
      // "news-bing" today; prefix match survives a backend swap
      if (typeof block?.display_type !== "string" || !block.display_type.startsWith("news-")) continue;
      if (!Array.isArray(block.results)) continue;
      for (const item of block.results) {
        let url = _esc(item.clickUrl ?? "");
        if (!url.startsWith("http")) continue;
        const title = _esc(item.title ?? "");
        if (!title) continue;
        if (this.useAnonymousView && typeof item.anonViewUrl === "string" && item.anonViewUrl) {
          url = item.anonViewUrl;
        }
        const thumbnail = _absolute(item.thumbnailUrl);
        results.push({
          title,
          url,
          snippet: _esc(item.description ?? ""),
          source: _esc(item.source ?? "") || this.name,
          ...(thumbnail ? { thumbnail } : {}),
        });
      }
    }

    return results;
  }
}
