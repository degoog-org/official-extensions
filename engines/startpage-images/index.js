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

export { filters } from "./const/filters.js";
export { regions } from "./const/regions.js";

export const type = "images";
export const description =
  "Startpage image search. Results are parsed from Startpage's image results page (Bing-syndicated, fetched anonymously through Startpage).";

export default class StartpageImagesEngine {
  isClientExposed = false;
  challenges = ["anubis"];
  name = "Startpage Images";
  bangShortcut = "spi";
  safeSearch = "off";

  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
  }

  _resolveSafe(context) {
    const nsfw = context?.imageFilter?.nsfw;
    if (nsfw === "on" || nsfw === "moderate") return "on";
    if (nsfw === "off") return "off";
    return this.safeSearch;
  }

  _parseError(context, message) {
    if (context?.engineError) {
      return context.engineError("parse_error", message, { engine: this.name });
    }
    return new Error(message);
  }

  async _getPage(doFetch, params, context, safe) {
    const url = `${SEARCH_URL}?${params.toString()}`;
    const res = await doFetch(url, { headers: baseHeaders(context, safe), redirect: "follow", match: { domMatch: READY_SELECTOR } });
    context?.sentinel?.(res, this.name);
    return res.text();
  }

  async _postPage(doFetch, body, context, safe) {
    const res = await doFetch(SEARCH_URL, {
      method: "POST",
      headers: postHeaders(context, safe),
      body: body.toString(),
      redirect: "follow",
      match: { domMatch: READY_SELECTOR },
    });
    context?.sentinel?.(res, this.name);
    return res.text();
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const p = Math.max(1, page || 1);
    const safe = this._resolveSafe(context);
    const html =
      p > 1 && context?.carried?.sc
        ? await this._postPage(doFetch, buildNextPageBody(query, p, context.carried.sc, safe, context), context, safe)
        : await this._getPage(doFetch, buildFirstPageParams(query, safe, context), context, safe);

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

    return parseMainline(mainline, this.name);
  }
}
