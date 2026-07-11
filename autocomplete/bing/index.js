export default class BingAutocompleteProvider {
  isClientExposed = false;
  name = "Bing Autocomplete";

  async getSuggestions(query, context) {
    if (!query || !query.trim()) return [];
    const doFetch = context?.fetch ?? fetch;
    const encoded = encodeURIComponent(query.trim());
    try {
      const res = await doFetch(
        `https://api.bing.com/osjson.aspx?query=${encoded}&form=OSDJAS`,
        { headers: { Accept: "application/json" } },
      );
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
