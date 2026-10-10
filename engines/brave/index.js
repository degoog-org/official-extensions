import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildSearchUrl } from "./request.js";
import { parseResults } from "./parse.js";

export { regions } from "./const/regions.js";

export const description =
  "Brave web search by scraping HTML. For API access use Brave API Search. We found curl-impersonate works best with Brave, so it's now the default transport. If you're still on curl or fetch, switch to curl-impersonate in advanced options.";

export default class BraveEngine {
  isClientExposed = false;
  name = "Brave Search";
  bangShortcut = "brave";
  safeSearch = "moderate";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(buildSearchUrl(query, page, timeFilter), {
      headers: buildHeaders(context, this.safeSearch),
      redirect: "follow",
    });
    context?.sentinel?.(response, this.name);
    return parseResults(await response.text(), this.name);
  }
}
