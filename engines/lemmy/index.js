import { SETTINGS_SCHEMA } from "./settings.js";
import { DEFAULT_INSTANCE } from "./const/api.js";
import { buildRequestInit, buildSearchUrl, normalizeInstance } from "./request.js";
import { parseSearch } from "./parse.js";

export default class LemmyEngine {
  isClientExposed = false;
  name = "Lemmy";
  bangShortcut = "lemmy";
  settingsSchema = SETTINGS_SCHEMA;
  searchType = "All";

  configure(settings) {
    this.instanceUrl = normalizeInstance(settings.instanceUrl);
    this.searchType = settings.searchType || "All";
    this.sort = settings.sort || "New";
    this.showNSFW = settings.showNSFW || false;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const baseUrl = this.instanceUrl || DEFAULT_INSTANCE;
    const url = buildSearchUrl(baseUrl, query, page, this);
    const doFetch = context?.fetch ?? fetch;

    try {
      const response = await doFetch(url, buildRequestInit(context));
      context?.sentinel?.(response, this.name);
      return parseSearch(await response.json(), baseUrl, this.name);
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      return [];
    }
  }
}
