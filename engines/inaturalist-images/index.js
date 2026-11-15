import { buildHeaders, buildResolveUrl, buildSearchUrl } from "./request.js";
import { parseItems } from "./parse.js";

export { filters } from "./const/filters.js";

export const type = "images";

export default class InaturalistImagesEngine {
  isClientExposed = false;
  name = "iNaturalist";
  bangShortcut = "nat";

  // query -> taxon id | null ("not resolvable, use text search")
  _resolutions = new Map();

  // Pick the taxon a searcher means from the autocomplete candidates:
  //  - every query token appears as a word (or word-prefix, for plurals) in
  //    the taxon's common or scientific name;
  //  - the head noun of the common name (its last word, singular/plural of a
  //    token) matches a token, so "Domestic Cat" and "Gray Fox" win over
  //    "Fox Squirrels", "Catchflies" and "Foxgloves".
  // Survivors are ranked by observation volume.
  static _pick(results, query) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;
    let best = null;
    let bestObs = -1;
    for (const t of results ?? []) {
      const words = `${t?.preferred_common_name ?? ""} ${t?.name ?? ""}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
      if (words.length === 0) continue;
      // The head noun comes from the common name only — scientific names
      // would sneak prefix collisions in ("Cathartidae" for "cat").
      const head = `${t?.preferred_common_name ?? ""}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .pop()
        ?? words[words.length - 1];
      const hits = (w, tok) => w.startsWith(tok) || (tok.length >= 3 && tok.startsWith(w));
      if (!tokens.some((tok) => head.startsWith(tok) && head.length - tok.length <= 2)) continue;
      if (!tokens.every((tok) => words.some((w) => hits(w, tok)))) continue;
      const obs = t?.observations_count ?? 0;
      if (obs > bestObs) {
        bestObs = obs;
        best = t;
      }
    }
    return best?.id ?? null;
  }

  async _resolveTaxon(query, doFetch, context) {
    if (this._resolutions.has(query)) return this._resolutions.get(query);
    let verdict = null;
    try {
      const res = await doFetch(buildResolveUrl(query), {
        headers: buildHeaders(context),
      });
      verdict = InaturalistImagesEngine._pick((await res.json())?.results, query);
    } catch {
      // resolution is best-effort; fall back to text search
    }
    this._resolutions.set(query, verdict);
    return verdict;
  }

  executeSearch = async (query, page = 1, _timeFilter, context) => {
    const doFetch = context?.fetch ?? fetch;

    try {
      const taxonId = await this._resolveTaxon(query, doFetch, context);
      const response = await doFetch(buildSearchUrl(query, page, taxonId), {
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
