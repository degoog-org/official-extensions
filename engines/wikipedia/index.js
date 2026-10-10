import { WIKI_HEADERS } from "./const/wiki.js";
import { buildUrl, wikiHost } from "./request.js";
import { parseResults } from "./parse.js";

export default class WikipediaEngine {
  isClientExposed = false;
  name = "Wikipedia";
  bangShortcut = "w";

  async executeSearch(query, page, _timeFilter, context) {
    const q = query.trim();
    if (!q) return [];
    const host = wikiHost(context?.lang);
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(buildUrl(host, q, page), { headers: WIKI_HEADERS });
    context?.sentinel?.(response, this.name);

    let data;
    try { data = await response.json(); } catch { return []; }
    return parseResults(data, host, this.name);
  }
}
