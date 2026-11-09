import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildSearchUrl } from "./request.js";
import { parseResults } from "./parse.js";
import { MAX_OFFSET } from "./const/search.js";

export { regions } from "./const/regions.js";

export default class BraveApiSearchEngine {
  isClientExposed = false;
  name = "Brave Search";
  bangShortcut = "brave";
  settingsSchema = SETTINGS_SCHEMA;

  apiKey = "";
  safeSearch = "moderate";

  configure(settings) {
    this.apiKey = settings.apiKey || "";
    this.safeSearch = settings.safeSearch || "moderate";
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!this.apiKey) return [];
    if ((page || 1) - 1 > MAX_OFFSET) return [];

    const doFetch = context?.fetch ?? fetch;
    const url = buildSearchUrl(query, page, timeFilter, this.safeSearch, context);

    try {
      const response = await doFetch(url, { headers: buildHeaders(this.apiKey) });
      context?.sentinel?.(response, this.name);
      return parseResults(await response.json(), this.name);
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      return [];
    }
  }
}
