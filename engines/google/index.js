import * as cheerio from "cheerio";
import { SETTINGS_SCHEMA } from "./settings.js";
import {
  SEARCH_URL,
  SERP_READY_SELECTOR,
  SERP_SORRY_PATH,
} from "./const/serp.js";
import { DESKTOP_USER_AGENT } from "./const/user-agents.js";
import { acceptLanguage, buildHtmlParams } from "./request.js";
import { isInterstitial, parseDesktop } from "./parse.js";
import { resolveGotos } from "./gotos.js";
import { napTime, sniffEid, withSei } from "./soft-captcha.js";

export { regions } from "./const/regions.js";

export const description =
  "Google web search. Right now it only works through the [4play (lolcat)](https://github.com/degoog-org/official-extensions/tree/main/transports/lolcat-4play) or [FlareSolverr](https://github.com/degoog-org/official-extensions/tree/main/transports/flaresolverr) transport. Install one from the Store tab and select it as this engine's transport.";

export default class GoogleEngine {
  isClientExposed = false;
  name = "Google";
  bangShortcut = "g";
  safeSearch = "off";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string")
      this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    return this._searchHtml(query, page, timeFilter, context);
  }

  _interstitialError(context) {
    const message = `${this.name} returned a JavaScript/consent interstitial`;
    if (context?.engineError) {
      return context.engineError("interstitial", message, { engine: this.name });
    }
    return new Error(message);
  }

  async _searchHtml(query, page, timeFilter, context) {
    const params = buildHtmlParams(query, page, timeFilter, this.safeSearch, context);
    const url = `${SEARCH_URL}?${params.toString()}`;
    const userAgent = context?.userAgent?.() || DESKTOP_USER_AGENT;
    let html = await this._fetchHtml(url, userAgent, context);

    const eid = sniffEid(html);
    if (eid) {
      console.warn("[google] soft captcha hit, retrying with sei");
      await napTime();
      html = await this._fetchHtml(withSei(url, eid), userAgent, context);
    }

    if (isInterstitial(html)) throw this._interstitialError(context);

    const links = parseDesktop(cheerio.load(html), this.name);
    return resolveGotos(links, userAgent, context?.fetch ?? fetch);
  }

  async _fetchHtml(url, userAgent, context) {
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: {
        "User-Agent": userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": acceptLanguage(context),
        Cookie: "CONSENT=YES+",
      },
      match: {
        domMatch: SERP_READY_SELECTOR,
        failUrlMatch: SERP_SORRY_PATH,
      },
      redirect: "follow",
    });

    context?.sentinel?.(response, this.name);
    return response.text();
  }
}
