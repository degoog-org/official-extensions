import { SETTINGS_SCHEMA } from "./settings.js";
import { READY_SELECTOR, SEARCH_URL } from "./const/serp.js";
import {
  baseHeaders,
  buildFirstPageParams,
  buildNextPageBody,
  postHeaders,
} from "./request.js";
import {
  extractSerpJson,
  isAnubisGate,
  isCaptcha,
  isReadableMainline,
  isSuspended,
  parseMainline,
} from "./parse.js";

export { regions } from "./const/regions.js";

export default class StartpageEngine {
  isClientExposed = false;
  name = "Startpage";
  bangShortcut = "sp";

  settingsSchema = SETTINGS_SCHEMA;

  challenges = ["anubis"];
  useAnonymousView = false;
  safeSearch = "off";

  configure(settings) {
    this.useAnonymousView = settings.useAnonymousView === true || settings.useAnonymousView === "true";
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
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

  _guardPage(html, context) {
    if (isCaptcha(html)) {
      throw this._breach(context, "captcha", `${this.name} served a CAPTCHA challenge (anti-bot block)`);
    }
    if (isSuspended(html)) {
      throw this._breach(context, "blocked", `${this.name} has suspended this instance's IP for suspected scraping`);
    }
    return html;
  }

  async _openPage(doFetch, url, init, context) {
    const res = await doFetch(url, { ...init, match: { domMatch: READY_SELECTOR } });
    context?.sentinel?.(res, this.name);
    const html = await res.text();
    if (isAnubisGate(html)) {
      throw this._gateError(
        context,
        `${this.name} is still showing its Anubis check. On a browser transport, let the page finish loading in the browser.`,
      );
    }
    return this._guardPage(html, context);
  }

  async _getPage(doFetch, params, context) {
    return this._openPage(
      doFetch,
      `${SEARCH_URL}?${params.toString()}`,
      { headers: baseHeaders(context, this.safeSearch), redirect: "follow" },
      context,
    );
  }

  async _postPage(doFetch, body, context) {
    return this._openPage(
      doFetch,
      SEARCH_URL,
      {
        method: "POST",
        headers: postHeaders(context, this.safeSearch),
        body: body.toString(),
        redirect: "follow",
      },
      context,
    );
  }

  _readSerp(html, context) {
    const jsonStr = extractSerpJson(html);
    if (!jsonStr) {
      throw this._parseError(context, `${this.name} returned a page without parseable results`);
    }
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      throw this._parseError(context, `${this.name} returned malformed result data`);
    }
  }

  async _firstPage(doFetch, query, timeFilter, context) {
    return this._getPage(
      doFetch,
      buildFirstPageParams(query, timeFilter, this.safeSearch, context),
      context,
    );
  }

  async _pagingToken(doFetch, query, timeFilter, context) {
    if (context?.carried?.sc) return context.carried.sc;
    const data = this._readSerp(await this._firstPage(doFetch, query, timeFilter, context), context);
    const sc = data?.render?.search_sc;
    if (!sc) throw this._parseError(context, `${this.name} did not hand out a paging token`);
    return sc;
  }

  async _fetchSerp(doFetch, query, page, timeFilter, context) {
    if (page === 1) return this._firstPage(doFetch, query, timeFilter, context);
    const sc = await this._pagingToken(doFetch, query, timeFilter, context);
    return this._postPage(
      doFetch,
      buildNextPageBody(query, page, sc, this.safeSearch, context),
      context,
    );
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const p = Math.max(1, page || 1);
    const data = this._readSerp(await this._fetchSerp(doFetch, query, p, timeFilter, context), context);

    if (data?.render?.search_sc) context?.carry?.({ sc: data.render.search_sc });

    const mainline = data?.render?.presenter?.regions?.mainline;
    if (!Array.isArray(mainline)) {
      throw this._parseError(context, `${this.name} response layout was not recognised`);
    }
    if (!isReadableMainline(mainline)) {
      throw this._parseError(context, `${this.name} returned no result block it recognises`);
    }

    return parseMainline(mainline, this.name, this.useAnonymousView);
  }
}
