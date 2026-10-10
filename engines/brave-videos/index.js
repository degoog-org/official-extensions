import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildSearchUrl } from "./request.js";
import { parseResults } from "./parse.js";

export { regions } from "./const/regions.js";

export const type = "videos";
export const description =
  "Brave video search (HTML scraping). Results are parsed from the Brave Search video results page.";

export default class BraveVideosEngine {
  isClientExposed = false;
  name = "Brave Videos";
  bangShortcut = "bravev";
  safeSearch = "moderate";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string")
      this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(buildSearchUrl(query, page, this.safeSearch), {
      headers: buildHeaders(context, this.safeSearch),
      redirect: "follow",
    });
    context?.sentinel?.(response, this.name);
    return parseResults(await response.text(), this.name);
  }
}
