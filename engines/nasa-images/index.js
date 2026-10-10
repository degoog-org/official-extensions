import { buildHeaders, buildSearchUrl } from "./request.js";
import { parseItems } from "./parse.js";

export { filters } from "./const/filters.js";

export const type = "images";

export default class NasaImagesEngine {
  isClientExposed = false;
  name = "NASA Images";
  bangShortcut = "nasa";

  executeSearch = async (query, page = 1, _timeFilter, context) => {
    const doFetch = context?.fetch ?? fetch;

    try {
      const response = await doFetch(buildSearchUrl(query, page), {
        headers: buildHeaders(context),
      });
      context?.sentinel?.(response, this.name);
      return parseItems(await response.json(), this.name);
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      return [];
    }
  };
}
