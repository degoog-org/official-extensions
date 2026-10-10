import { SETTINGS_SCHEMA } from "./settings.js";
import { SAFE_MAP } from "./const/search.js";
import { buildHeaders, buildJsonHeaders, buildNewsParams } from "./request.js";
import { extractVqd, parseNews } from "./parse.js";

export const type = "news";
export { regions } from "./const/regions.js";

export default class DuckDuckGoNewsEngine {
  isClientExposed = false;
  name = "DuckDuckGo News";
  bangShortcut = "ddgnews";
  safeSearch = "off";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string") {
      this.safeSearch = settings.safeSearch;
    }
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const safe = SAFE_MAP[this.safeSearch] ?? "-1";
    const headers = buildHeaders(context, safe);

    const initRes = await doFetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=news&ia=news`,
      { headers },
    );
    context?.sentinel?.(initRes, this.name);
    const vqd = extractVqd(await initRes.text());
    if (!vqd) return [];

    const params = buildNewsParams(query, page, timeFilter, vqd, safe, context);
    const res = await doFetch(`https://duckduckgo.com/news.js?${params.toString()}`, {
      headers: buildJsonHeaders(headers),
    });
    context?.sentinel?.(res, this.name);

    return parseNews(await res.json(), this.name);
  }
}
