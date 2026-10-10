import { SETTINGS_SCHEMA } from "./settings.js";
import { SAFE_MODERATE, SAFE_OFF, SAFE_STRICT } from "./const/search.js";
import {
  buildHeaders,
  buildImageParams,
  buildJsonHeaders,
  buildKl,
} from "./request.js";
import { extractVqd, parseImages } from "./parse.js";

export const type = "images";
export { filters } from "./const/filters.js";
export { regions } from "./const/regions.js";

export default class DuckDuckGoImagesEngine {
  isClientExposed = false;
  name = "DuckDuckGo Images";
  bangShortcut = "ddgi";
  safeSearch = "moderate";
  hideAiImages = "show";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string") {
      this.safeSearch = settings.safeSearch;
    }
    if (typeof settings.hideAiImages === "string") {
      this.hideAiImages = settings.hideAiImages;
    }
  }

  _resolveSafe(context) {
    const nsfw = context?.imageFilter?.nsfw;
    if (nsfw === "on") return SAFE_STRICT;
    if (nsfw === "moderate") return SAFE_MODERATE;
    if (nsfw === "off") return SAFE_OFF;
    if (this.safeSearch === "on") return SAFE_STRICT;
    if (this.safeSearch === "moderate") return SAFE_MODERATE;
    return SAFE_OFF;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const safe = this._resolveSafe(context);
    const region = buildKl(context);
    const headers = buildHeaders(context, safe, region);

    const initRes = await doFetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=images&iax=images&ia=images`,
      { headers },
    );
    context?.sentinel?.(initRes, this.name);
    const vqd = extractVqd(await initRes.text());
    if (!vqd) return [];

    const params = buildImageParams({
      query,
      vqd,
      region,
      safe,
      page,
      imageFilter: context?.imageFilter ?? {},
      hideAiImages: this.hideAiImages === "hide",
    });

    const res = await doFetch(`https://duckduckgo.com/i.js?${params.toString()}`, {
      headers: buildJsonHeaders(headers),
    });
    context?.sentinel?.(res, this.name);

    return parseImages(await res.json(), this.name);
  }
}
