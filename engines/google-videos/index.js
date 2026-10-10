import * as cheerio from "cheerio";
import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildSearchUrl, gsaAgent } from "./request.js";
import { isInterstitial, isSorryPage, parseDesktop, parseLite } from "./parse.js";
import { resolveGotos } from "./gotos.js";
import { napTime, sniffEid, withSei } from "./soft-captcha.js";

export { regions } from "./const/regions.js";

export const type = "videos";

export default class GoogleVideosEngine {
  isClientExposed = false;
  name = "Google Videos";
  safeSearch = "off";
  resultsFormat = "lite";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
    if (settings.resultsFormat === "lite" || settings.resultsFormat === "html")
      this.resultsFormat = settings.resultsFormat;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (this.resultsFormat === "html") {
      return this._searchHtml(query, page, timeFilter, context);
    }
    return this._searchLite(query, page, timeFilter, context);
  }

  _sorryError(context) {
    const message = `${this.name} served its reCAPTCHA page, so it has flagged this IP`;
    if (context?.engineError) return context.engineError("captcha", message, { engine: this.name });
    return new Error(message);
  }

  _softCaptchaError(context) {
    const message = `${this.name} kept returning its soft CAPTCHA page`;
    if (context?.engineError) return context.engineError("captcha", message, { engine: this.name });
    return new Error(message);
  }

  async _fetchChecked(url, userAgent, context) {
    let html = await this._fetchHtml(url, userAgent, context);
    const eid = sniffEid(html);
    if (eid) {
      console.warn("[google-videos] soft captcha hit, retrying with sei");
      await napTime();
      html = await this._fetchHtml(withSei(url, eid), userAgent, context);
      if (sniffEid(html)) throw this._softCaptchaError(context);
    }
    if (isSorryPage(html)) throw this._sorryError(context);
    return html;
  }

  async _searchHtml(query, page, timeFilter, context) {
    const url = buildSearchUrl(query, page, timeFilter, this.safeSearch, context);
    const userAgent = context?.userAgent?.() || gsaAgent();
    const html = await this._fetchChecked(url, userAgent, context);

    if (isInterstitial(html)) {
      if (context?.engineError) {
        throw context.engineError(
          "interstitial",
          `${this.name} returned a JavaScript/consent interstitial`,
          { engine: this.name },
        );
      }
      throw new Error(`${this.name} returned a JavaScript/consent interstitial`);
    }

    const links = parseDesktop(cheerio.load(html), this.name);
    return resolveGotos(links, userAgent, context?.fetch ?? fetch);
  }

  async _fetchHtml(url, userAgent, context) {
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: buildHeaders(userAgent, context),
      redirect: "follow",
    });

    context?.sentinel?.(response, this.name);
    return response.text();
  }

  async _searchLite(query, page = 1, timeFilter, context) {
    const url = buildSearchUrl(query, page, timeFilter, this.safeSearch, context);
    const html = await this._fetchChecked(url, gsaAgent(), context);
    return parseLite(cheerio.load(html), this.name);
  }
}
