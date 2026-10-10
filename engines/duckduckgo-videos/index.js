import { SETTINGS_SCHEMA } from "./settings.js";
import { SAFE_MODERATE, SAFE_OFF, SAFE_STRICT } from "./const/search.js";
import {
  buildHeaders,
  buildJsonHeaders,
  buildKl,
  buildVideoParams,
} from "./request.js";
import { extractVqd, parseVideos } from "./parse.js";

export const type = "videos";
export const description =
  "DuckDuckGo video search. Results come from DuckDuckGo's video search JSON endpoint.";
export { regions } from "./const/regions.js";

export default class DuckDuckGoVideosEngine {
  isClientExposed = false;
  name = "DuckDuckGo Videos";
  bangShortcut = "ddgv";
  safeSearch = "moderate";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string") {
      this.safeSearch = settings.safeSearch;
    }
  }

  _resolveSafe() {
    if (this.safeSearch === "on") return SAFE_STRICT;
    if (this.safeSearch === "moderate") return SAFE_MODERATE;
    return SAFE_OFF;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const safe = this._resolveSafe();
    const region = buildKl(context);
    const headers = buildHeaders(context, safe, region);

    const initRes = await doFetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=videos&iax=videos&ia=videos`,
      { headers },
    );
    context?.sentinel?.(initRes, this.name);
    const vqd = extractVqd(await initRes.text());
    if (!vqd) return [];

    const params = buildVideoParams(query, page, vqd, region, safe);
    const res = await doFetch(`https://duckduckgo.com/v.js?${params.toString()}`, {
      headers: buildJsonHeaders(headers),
    });
    context?.sentinel?.(res, this.name);

    return parseVideos(await res.json(), this.name);
  }
}
