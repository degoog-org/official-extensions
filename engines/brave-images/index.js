import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildSearchUrl, resolveSafe } from "./request.js";
import { parseResults } from "./parse.js";

export { filters } from "./const/filters.js";
export { regions } from "./const/regions.js";

export const type = "images";
export const description = "";

export default class BraveImagesEngine {
  isClientExposed = false;
  name = "Brave Images";
  bangShortcut = "bravei";
  safeSearch = "moderate";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string")
      this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const safe = resolveSafe(this.safeSearch, context);
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(buildSearchUrl(query, page, safe), {
      headers: buildHeaders(context, safe),
      redirect: "follow",
    });
    context?.sentinel?.(response, this.name);
    return parseResults(await response.text(), this.name);
  }
}
