import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildUrl } from "./request.js";
import { parseFeed } from "./parse.js";

export default class RedditEngine {
  isClientExposed = false;
  name = "Reddit";
  bangShortcut = "r";
  includeNsfw = "false";
  sortBy = "hot";

  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.includeNsfw === "string") this.includeNsfw = settings.includeNsfw;
    if (typeof settings.sortBy === "string") this.sortBy = settings.sortBy;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const url = buildUrl(query, page, timeFilter, this.sortBy, this.includeNsfw);
    const doFetch = context?.fetch ?? fetch;

    const response = await doFetch(url, { headers: buildHeaders(context) });

    context?.sentinel?.(response, this.name);

    return parseFeed(await response.text(), this.name);
  }
}
