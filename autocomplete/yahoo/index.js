export default class YahooAutocompleteProvider {
  isClientExposed = false;
  name = "Yahoo Autocomplete";

  async getSuggestions(query, context) {
    if (!query || !query.trim()) return [];
    const doFetch = context?.fetch ?? fetch;
    const lang = context?.lang ?? "en";
    const encoded = encodeURIComponent(query.trim());
    const region = lang === "en" ? "us" : lang;
    try {
      const res = await doFetch(
        `https://search.yahoo.com/sugg/gossip/gossip-${region}-ura/?command=${encoded}&output=json`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return [];
      const data = await res.json();
      const results = data?.gossip?.results;
      if (!Array.isArray(results)) return [];
      return results.map((r) => r.key).filter(Boolean);
    } catch {
      return [];
    }
  }
}
