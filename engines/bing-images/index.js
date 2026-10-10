import * as cheerio from "cheerio";
import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildSearchUrl, resolveAdlt } from "./request.js";
import { parseResults } from "./parse.js";

export { filters } from "./const/filters.js";
export { regions } from "./const/regions.js";

export default class BingImagesEngine {
  isClientExposed = false;
  name = "Bing Images";
  safeSearch = "moderate";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const adlt = resolveAdlt(this.safeSearch, context?.imageFilter?.nsfw);
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(buildSearchUrl(query, page, timeFilter, adlt, context), {
      headers: buildHeaders(adlt, context),
      redirect: "follow",
    });
    context?.sentinel?.(response, this.name);
    return parseResults(cheerio.load(await response.text()), this.name);
  }
}

export const type = "images";
