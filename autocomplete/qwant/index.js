const SUGGEST_URL = "https://api.qwant.com/api/suggest/?client=opensearch&q=";

export default class QwantAutocompleteProvider {
  isClientExposed = false;
  name = "Qwant Autocomplete";
  description = "Autocomplete suggestions from Qwant.";

  async getSuggestions(query, context) {
    if (!query || !query.trim()) return [];

    const doFetch = context?.fetch ?? fetch;

    try {
      const res = await doFetch(`${SUGGEST_URL}${encodeURIComponent(query.trim())}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];

      const data = await res.json();

      if (Array.isArray(data) && Array.isArray(data[1])) {
        return data[1].map(String).filter(Boolean);
      }

      return [];
    } catch {
      return [];
    }
  }
}
