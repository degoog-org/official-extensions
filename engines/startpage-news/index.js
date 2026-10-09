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
  parseMainline,
} from "./parse.js";

export { regions } from "./const/regions.js";

export const type = "news";
export const description =
  "Startpage news search. Results are parsed from Startpage's news results page (Bing-syndicated, fetched anonymously through Startpage).";

export default class StartpageNewsEngine {
  isClientExposed = false;
  challenges = ["anubis"];
  name = "Startpage News";
  bangShortcut = "spn";
  safeSearch = "off";
  useAnonymousView = false;

  settingsSchema = SETTINGS_SCHEMA;

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

  async _getPage(doFetch, params, context) {
    const url = `${SEARCH_URL}?${params.toString()}`;
    const res = await doFetch(url, { headers: baseHeaders(context, this.safeSearch), redirect: "follow", match: { domMatch: READY_SELECTOR } });
    context?.sentinel?.(res, this.name);
    return res.text();
  }

  async _postPage(doFetch, body, context) {
    const res = await doFetch(SEARCH_URL, {
      method: "POST",
      headers: postHeaders(context, this.safeSearch),
      body: body.toString(),
      redirect: "follow",
      match: { domMatch: READY_SELECTOR },
    });
    context?.sentinel?.(res, this.name);
    return res.text();
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const p = Math.max(1, page || 1);
    const html =
      p > 1 && context?.carried?.sc
        ? await this._postPage(doFetch, buildNextPageBody(query, p, context.carried.sc, this.safeSearch, context), context)
        : await this._getPage(doFetch, buildFirstPageParams(query, timeFilter, this.safeSearch, context), context);

    if (isAnubisGate(html)) {
      const message = `${this.name} is still showing its Anubis check. On a browser transport, let the page finish loading in the browser.`;
      if (context?.engineError) {
        throw context.engineError("interstitial", message, { engine: this.name });
      }
      throw new Error(message);
    }

    if (isCaptcha(html)) {
      const message = `${this.name} served a CAPTCHA challenge (anti-bot block)`;
      if (context?.engineError) {
        throw context.engineError("captcha", message, { engine: this.name });
      }
      throw new Error(message);
    }

    const jsonStr = extractSerpJson(html);
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

    if (data?.render?.search_sc) context?.carry?.({ sc: data.render.search_sc });

    const mainline = data?.render?.presenter?.regions?.mainline;
    if (!Array.isArray(mainline)) {
      throw this._parseError(context, `${this.name} response layout was not recognised`);
    }

    return parseMainline(mainline, this.name, this.useAnonymousView);
  }
}
