import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildSearchUrl } from "./request.js";
import { parseResults } from "./parse.js";

export { regions } from "./const/regions.js";

export const type = "news";

export default class BraveNewsEngine {
  isClientExposed = false;
  name = "Brave News";
  bangShortcut = "bravenews";
  safeSearch = "moderate";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!query.trim()) return [];
    const doFetch = context?.fetch ?? fetch;
    const res = await doFetch(buildSearchUrl(query, page, timeFilter), {
      headers: buildHeaders(context, this.safeSearch),
      redirect: "follow",
    });
    context?.sentinel?.(res, this.name);
    return parseResults(await res.text(), this.name, context);
  }
}
