import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildUrl } from "./request.js";
import { parseResults } from "./parse.js";

export const type = "news";

export default class TheGuardianEngine {
  isClientExposed = false;
  name = "The Guardian";
  bangShortcut = "guardian";

  settingsSchema = SETTINGS_SCHEMA;

  apiKey = "";

  configure(settings) {
    this.apiKey = settings?.apiKey || "";
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!this.apiKey) return [];
    const doFetch = context?.fetch ?? fetch;
    const url = buildUrl(query, page, timeFilter, this.apiKey, context);

    try {
      const response = await doFetch(url, { headers: buildHeaders(context) });
      context?.sentinel?.(response, this.name);
      return parseResults(await response.json(), this.name);
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      return [];
    }
  }
}
