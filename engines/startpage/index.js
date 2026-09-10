import {
  ANUBIS_AUTH_COOKIE,
  buildPassUrl,
  crackingDiocane,
  hasChallenge,
  readAuthCookie,
  readChallenge,
} from "./anubis.js";

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
const BASE_URL = "https://www.startpage.com";
const SEARCH_URL = `${BASE_URL}/sp/search`;

const TIME_MAP = { hour: "h", day: "d", week: "w", month: "m", year: "y" };
const SAFE_MAP = { off: "none", on: "heavy" };

const AUTH_TTL_MS = 4 * 60 * 1000;
const DEFAULT_MAX_DIFFICULTY = 4;

const CAPTCHA_MARKERS = [
  "/sp/captcha",
  "Startpage Captcha",
  "CAPTCHA Verification",
  "captcha-section",
];

const SUSPENDED_MARKERS = [
  "Access Denied - Startpage",
  "error-pages/blocked.html",
];

const _isCaptcha = (html) => {
  const head = html.slice(0, 6000);
  return CAPTCHA_MARKERS.some((m) => head.includes(m));
};

const _isSuspended = (html) => {
  const head = html.slice(0, 6000);
  return SUSPENDED_MARKERS.some((m) => head.includes(m));
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
  const match = html.match(/React\.createElement\(UIStartpage\.AppSerpWeb, ?(.+)\),?$/m);
  return match ? match[1] : null;
};

const _esc = (str) => {
  if (typeof str !== "string") return "";
  return str
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

const _stripProxy = (url) => {
  if (typeof url !== "string" || !url) return url;
  try {
    const u = new URL(url, BASE_URL);
    if (u.pathname.includes("do/d/search")) {
      const dest = u.searchParams.get("url");
      if (dest) return dest;
    }
  } catch { }
  return url;
};

export default class StartpageEngine {
  isClientExposed = false;
  name = "Startpage";
  bangShortcut = "sp";

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
      description: "Filter explicit content from search results.",
    },
    {
      key: "solveAnubis",
      label: "Solve Anubis Challenge",
      type: "toggle",
      default: "true",
      description: "Startpage fronts search with an [Anubis](https://github.com/TecharoHQ/anubis) proof-of-work gate that plain HTTP clients cannot pass. Solving costs around 40ms of CPU and the token is reused for four minutes. Turn this off only if you reach Startpage through a browser transport that already solves it.",
    },
    {
      key: "anubisMaxDifficulty",
      label: "Max Anubis Difficulty",
      type: "number",
      default: "4",
      placeholder: "4",
      min: "1",
      max: "8",
      visibleWhen: { key: "solveAnubis", equals: "true" },
      description: "Refuse a challenge harder than this instead of burning CPU on it. Startpage currently serves difficulty 4, and every step up multiplies the work by 16, so 6 already costs several seconds per search.",
    },
  ];

  useAnonymousView = false;
  safeSearch = "off";
  solveAnubis = true;
  anubisMaxDiff = DEFAULT_MAX_DIFFICULTY;
  _searchSc = null;
  _spAuth = null;
  _spAuthAt = 0;

  configure(settings) {
    this.useAnonymousView = settings.useAnonymousView === true || settings.useAnonymousView === "true";
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
    this.solveAnubis = settings.solveAnubis !== false && settings.solveAnubis !== "false";
    const maxDiff = parseInt(settings.anubisMaxDifficulty, 10);
    this.anubisMaxDiff = Number.isInteger(maxDiff) && maxDiff > 0 ? maxDiff : DEFAULT_MAX_DIFFICULTY;
  }

  _breach(context, status, message) {
    if (context?.engineError) {
      return context.engineError(status, message, { engine: this.name });
    }
    return new Error(message);
  }

  _parseError(context, message) {
    return this._breach(context, "parse_error", message);
  }

  _gateError(context, message) {
    return this._breach(context, "interstitial", message);
  }

  _cookieHeader() {
    const jar = [`preferences=${_buildPrefs(this.safeSearch)}`];
    const fresh = this._spAuth && Date.now() - this._spAuthAt < AUTH_TTL_MS;
    if (fresh) jar.push(`${ANUBIS_AUTH_COOKIE}=${this._spAuth}`);
    return jar.join("; ");
  }

  _baseHeaders(context) {
    return {
      "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      Cookie: this._cookieHeader(),
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    };
  }

  _guardPage(html, context) {
    if (_isCaptcha(html)) {
      throw this._breach(context, "captcha", `${this.name} served a CAPTCHA challenge (anti-bot block)`);
    }
    if (_isSuspended(html)) {
      throw this._breach(context, "blocked", `${this.name} has suspended this instance's IP for suspected scraping`);
    }
    return html;
  }

  async _passGate(doFetch, html, url, context) {
    const challenge = readChallenge(html);
    if (!challenge) {
      throw this._gateError(context, `${this.name} served an Anubis challenge that could not be read`);
    }
    if (challenge.difficulty > this.anubisMaxDiff) {
      throw this._gateError(
        context,
        `${this.name} raised Anubis difficulty to ${challenge.difficulty}, above the configured maximum of ${this.anubisMaxDiff}`,
      );
    }

    const solved = crackingDiocane(challenge.data, challenge.difficulty);
    if (!solved) {
      throw this._gateError(context, `${this.name} found no Anubis nonce at difficulty ${challenge.difficulty}`);
    }

    const res = await doFetch(buildPassUrl(BASE_URL, challenge, solved, url), {
      headers: this._baseHeaders(context),
      redirect: "manual",
    });

    const auth = readAuthCookie(res);
    if (!auth) return;
    this._spAuth = auth;
    this._spAuthAt = Date.now();
  }

  async _openPage(doFetch, url, init, context) {
    const res = await doFetch(url, init);
    context?.sentinel?.(res, this.name);
    const html = await res.text();
    if (!hasChallenge(html)) return this._guardPage(html, context);

    if (!this.solveAnubis) {
      throw this._gateError(
        context,
        `${this.name} served an Anubis proof-of-work challenge and solving is disabled`,
      );
    }

    await this._passGate(doFetch, html, url, context);

    const headers = { ...init.headers, Cookie: this._cookieHeader() };
    const retry = await doFetch(url, { ...init, headers });
    context?.sentinel?.(retry, this.name);
    const retryHtml = await retry.text();

    if (hasChallenge(retryHtml)) {
      throw this._gateError(
        context,
        `${this.name} re-served an Anubis challenge after a solved proof of work`,
      );
    }
    return this._guardPage(retryHtml, context);
  }

  async _getPage(doFetch, params, context) {
    return this._openPage(
      doFetch,
      `${SEARCH_URL}?${params.toString()}`,
      { headers: this._baseHeaders(context), redirect: "follow" },
      context,
    );
  }

  async _postPage(doFetch, body, context) {
    return this._openPage(
      doFetch,
      SEARCH_URL,
      {
        method: "POST",
        headers: {
          ...this._baseHeaders(context),
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `${BASE_URL}/`,
          "Sec-Fetch-Site": "same-origin",
        },
        body: body.toString(),
        redirect: "follow",
      },
      context,
    );
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const p = Math.max(1, page || 1);
    let html;

    if (p > 1 && this._searchSc) {
      const body = new URLSearchParams({
        query,
        cat: "web",
        t: "device",
        sc: this._searchSc,
        segment: "organic",
        abd: "0",
        abe: "0",
        qsr: "all",
        page: String(p),
      });
      if (this.safeSearch !== "off") body.set("qadf", SAFE_MAP[this.safeSearch] ?? "none");
      html = await this._postPage(doFetch, body, context);
    } else {
      const params = new URLSearchParams({ query, cat: "web", pl: "opensearch" });
      if (this.safeSearch !== "off") params.set("qadf", SAFE_MAP[this.safeSearch] ?? "none");
      if (context?.lang) params.set("language", context.lang);
      if (timeFilter && timeFilter !== "any" && timeFilter !== "custom" && TIME_MAP[timeFilter]) {
        params.set("with_date", TIME_MAP[timeFilter]);
      }
      html = await this._getPage(doFetch, params, context);
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
      if (block?.display_type !== "web-google") continue;
      if (!Array.isArray(block.results)) continue;
      for (const item of block.results) {
        let url = _stripProxy(item.clickUrl ?? item.url ?? "");
        if (!url || !url.startsWith("http")) continue;
        const title = _esc(item.title ?? "");
        if (!title) continue;
        if (this.useAnonymousView && typeof item.anonViewUrl === "string" && item.anonViewUrl) {
          url = item.anonViewUrl;
        }
        results.push({ title, url, snippet: _esc(item.description ?? ""), source: this.name });
      }
    }

    return results;
  }
}
