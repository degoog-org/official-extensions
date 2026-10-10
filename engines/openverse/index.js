import { buildHeaders, buildSearchUrl } from "./request.js";
import { parseResults } from "./parse.js";

export { filters } from "./const/filters.js";

export const type = "images";

export default class OpenverseEngine {
  isClientExposed = false;
  name = "Openverse";
  bangShortcut = "openverse";

  executeSearch = async (query, page = 1, _timeFilter, context) => {
    const doFetch = context?.fetch ?? fetch;
    const url = buildSearchUrl(query, page, context);

    try {
      const response = await doFetch(url, { headers: buildHeaders(context) });
      context?.sentinel?.(response, this.name);
      return parseResults(await response.json(), this.name);
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      return [];
    }
  };
}
