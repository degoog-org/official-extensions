import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildSearchUrl } from "./request.js";
import { parseResults } from "./parse.js";
import { resolveGoLinks } from "./go.js";

export { regions } from "./const/regions.js";

export const description =
  "Brave web search by scraping HTML. For API access use Brave API Search. We found curl-impersonate works best with Brave, so it's now the default transport. If you're still on curl or fetch, switch to curl-impersonate in advanced options.";

export default class BraveEngine {
  isClientExposed = false;
  name = "Brave Search";
  bangShortcut = "brave";
  safeSearch = "moderate";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const headers = buildHeaders(context, this.safeSearch);
    const response = await doFetch(buildSearchUrl(query, page, timeFilter), {
      headers,
      redirect: "follow",
    });
    context?.sentinel?.(response, this.name);
    const parsed = parseResults(await response.text(), this.name);
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
