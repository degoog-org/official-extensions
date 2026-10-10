import { CLOUDFLARE_CHALLENGE_MARKER } from "./const/serp.js";
import { buildHeaders, buildSearchUrl } from "./request.js";
import { parseResults } from "./parse.js";

export default class EcosiaEngine {
  isClientExposed = false;
  name = "Ecosia";
  bangShortcut = "ecosia";

  async executeSearch(query, page = 1, _timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(buildSearchUrl(query, page), {
      headers: buildHeaders(context),
    });
    context?.sentinel?.(response, this.name);
    const html = await response.text();
    if (html.includes(CLOUDFLARE_CHALLENGE_MARKER)) {
      if (context?.engineError) {
        throw context.engineError("captcha", `${this.name} returned a Cloudflare challenge`, { engine: this.name });
      }
      throw new Error(
        "Ecosia returned a Cloudflare challenge page; server-side requests are often blocked. Try another engine or use Ecosia in your browser.",
      );
    }
    return parseResults(html, this.name);
  }
}
