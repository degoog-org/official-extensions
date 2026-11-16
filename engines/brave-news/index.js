import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildSearchUrl } from "./request.js";
import { parseResults } from "./parse.js";
import { resolveGoLinks } from "./go.js";

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
    const headers = buildHeaders(context, this.safeSearch);
    const res = await doFetch(buildSearchUrl(query, page, timeFilter), {
      headers,
      redirect: "follow",
    });
    context?.sentinel?.(res, this.name);
    const parsed = parseResults(await res.text(), this.name, context);
    const { results, cloaked } = await resolveGoLinks(parsed, headers, context);
    if (cloaked > 0 && results.length === 0) throw this._unresolvedError(context, cloaked);
    return results;
  }

  _unresolvedError(context, cloaked) {
    const message = `${this.name} cloaked ${cloaked} result links behind /go/ and none of them resolved`;
    if (context?.engineError) return context.engineError("blocked", message, { engine: this.name });
    return new Error(message);
  }
}
