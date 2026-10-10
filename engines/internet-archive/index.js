import { buildHeaders, buildSearchUrl } from "./request.js";
import { parseDocs } from "./parse.js";

export const type = "file";

export default class InternetArchiveEngine {
  isClientExposed = true;
  name = "Internet Archive";
  bangShortcut = "ia";

  async executeSearch(query, page = 1, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(buildSearchUrl(query, page, timeFilter, context), {
      headers: buildHeaders(context),
    });
    context?.sentinel?.(response, this.name);
    return parseDocs(await response.json(), this.name);
  }
}
