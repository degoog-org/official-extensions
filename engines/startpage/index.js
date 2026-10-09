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

  async executeSearch(query, page = 1, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const p = Math.max(1, page || 1);
    const html =
      p > 1 && context?.carried?.sc
        ? await this._postPage(
            doFetch,
            buildNextPageBody(query, p, context.carried.sc, this.safeSearch, context),
            context,
          )
        : await this._getPage(
            doFetch,
            buildFirstPageParams(query, timeFilter, this.safeSearch, context),
            context,
          );

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
