import { buildHeaders, buildSearchUrl } from "./request.js";
import { parseHits } from "./parse.js";

export const type = "news";

export default class HackerNewsEngine {
  isClientExposed = false;
  name = "Hacker News";
  bangShortcut = "hn";

  async executeSearch(query, page = 1, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const url = buildSearchUrl(query, page, timeFilter, context);

    try {
      const response = await doFetch(url, { headers: buildHeaders(context) });
      context?.sentinel?.(response, this.name);
      return parseHits(await response.json(), this.name);
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      return [];
    }
  }
}
