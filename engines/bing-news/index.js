import * as cheerio from "cheerio";
import { buildHeaders, buildSearchUrl } from "./request.js";
import { parseResults } from "./parse.js";

export { regions } from "./const/regions.js";

export default class BingNewsEngine {
  isClientExposed = false;
  name = "Bing News";
  bangShortcut = "bingnews";

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!query.trim()) return [];
    const doFetch = context?.fetch ?? fetch;
    const res = await doFetch(buildSearchUrl(query, page, timeFilter, context), {
      headers: buildHeaders(context),
      redirect: "follow",
    });
    context?.sentinel?.(res, this.name);
    return parseResults(cheerio.load(await res.text()), this.name, context);
  }
}

export const type = "news";
