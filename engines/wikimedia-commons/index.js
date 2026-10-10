import { buildHeaders, buildUrl } from "./request.js";
import { parseResults } from "./parse.js";

export const type = "images";
export { filters } from "./const/filters.js";

export default class WikimediaCommonsEngine {
  isClientExposed = false;
  name = "Wikimedia Commons";
  bangShortcut = "wikimedia";

  executeSearch = async (query, page = 1, _timeFilter, context) => {
    const doFetch = context?.fetch ?? fetch;

    try {
      const response = await doFetch(buildUrl(query, page, context), {
        headers: buildHeaders(context),
      });

      context?.sentinel?.(response, this.name);

      return parseResults(await response.json(), this.name);
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      return [];
    }
  };
}
