import * as cheerio from "cheerio";
import { SETTINGS_SCHEMA } from "./settings.js";
import { SAFE_SEARCH_MAP, SEARCH_URL } from "./const/search.js";
import { buildHeaders, buildPageParams, buildParams } from "./request.js";
import { extractVqd, parseResults } from "./parse.js";

export { regions } from "./const/regions.js";

export default class DuckDuckGoEngine {
  isClientExposed = false;
  name = "DuckDuckGo";
  bangShortcut = "ddg";
  safeSearch = "off";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const safe = SAFE_SEARCH_MAP[this.safeSearch];
    const headers = buildHeaders(context, safe);
    const params = buildParams(query, timeFilter, safe, context);
    const url = `${SEARCH_URL}?${params.toString()}`;

    let response;
    if ((page || 1) <= 1) {
      response = await doFetch(url, { headers, redirect: "follow" });
    } else {
      const initRes = await doFetch(url, { headers, redirect: "follow" });
      context?.sentinel?.(initRes, this.name);
      const vqd = extractVqd(await initRes.text());
      if (!vqd) return [];

      const pageParams = buildPageParams(params, page, vqd);
      response = await doFetch(`${SEARCH_URL}?${pageParams.toString()}`, {
        headers,
        redirect: "follow",
      });
    }

    context?.sentinel?.(response, this.name);
    return parseResults(cheerio.load(await response.text()), this.name);
  }
}
