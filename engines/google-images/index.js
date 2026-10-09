import { parseGoogleImagesHtml, isInterstitial, isSorryPage } from "./parse-html.js";
import { parseGoogleImagesJson } from "./parse-json.js";
import { SETTINGS_SCHEMA } from "./settings.js";
import {
  acceptLanguage,
  buildHtmlUrl,
  buildJsonUrl,
  goAppAgent,
  gsaAgent,
} from "./request.js";

export { filters } from "./const/filters.js";
export { regions } from "./const/regions.js";

export const type = "images";
export const description =
  "Google Images search. Pick JSON or HTML results in the engine settings. Each one names the Store transport it works best with.";

export default class GoogleImagesEngine {
  isClientExposed = false;
  name = "Google Images";
  safeSearch = "moderate";
  resultsFormat = "json";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string")
      this.safeSearch = settings.safeSearch;
    if (
      settings.resultsFormat === "json" ||
      settings.resultsFormat === "html"
    ) {
      this.resultsFormat = settings.resultsFormat;
    }
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (this.resultsFormat === "html") {
      return this._searchHtml(query, page, timeFilter, context);
    }
    return this._searchJson(query, page, timeFilter, context);
  }

  async _searchJson(query, page, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(
      buildJsonUrl(query, page, timeFilter, context, this.safeSearch),
      {
        headers: {
          "User-Agent": goAppAgent(),
          Accept: "*/*",
          "Accept-Language": acceptLanguage(context),
          Cookie: "CONSENT=YES+",
        },
      },
    );

    context?.sentinel?.(response, this.name);
    return parseGoogleImagesJson(await response.text(), this.name);
  }

  async _searchHtml(query, page, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(
      buildHtmlUrl(query, page, timeFilter, context, this.safeSearch),
      {
        headers: {
          "User-Agent": gsaAgent(),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": acceptLanguage(context),
          Cookie: "CONSENT=YES+",
        },
        redirect: "follow",
      },
    );

    context?.sentinel?.(response, this.name);
    const html = await response.text();

    if (isSorryPage(html)) {
      const message = `${this.name} served its reCAPTCHA page, so it has flagged this IP`;
      if (context?.engineError) throw context.engineError("captcha", message, { engine: this.name });
      throw new Error(message);
    }

    if (isInterstitial(html)) {
      if (context?.engineError) {
        throw context.engineError(
          "interstitial",
          `${this.name} returned a JavaScript/consent interstitial`,
          { engine: this.name },
        );
      }
      throw new Error(
        `${this.name} returned a JavaScript/consent interstitial`,
      );
    }

    return parseGoogleImagesHtml(html, this.name);
  }
}
