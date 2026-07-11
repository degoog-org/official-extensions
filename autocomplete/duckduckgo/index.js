export default class DuckDuckGoAutocompleteProvider {
  isClientExposed = false;
  name = "DuckDuckGo Autocomplete";
  description = "Autocomplete suggestions from DuckDuckGo.";

  settingsSchema = [
    {
      key: "richSuggestions",
      label: "Rich suggestions",
      type: "toggle",
      default: "false",
      description:
        "Show entity cards (image, description) at the top of suggestions when available. Uses the DuckDuckGo Instant Answer API (extra call per query, careful with usage).",
      advanced: false,
    },
  ];

  richEnabled = false;

  configure(settings) {
    this.richEnabled = settings.richSuggestions === "true";
  }

  async getSuggestions(query, context) {
    if (!query || !query.trim()) return [];
    const doFetch = context?.fetch ?? fetch;
    const encoded = encodeURIComponent(query);

    const [suggestRes, richRes] = await Promise.allSettled([
      doFetch(`https://duckduckgo.com/ac/?q=${encoded}&type=list`),
      this.richEnabled
        ? doFetch(
            `https://api.duckduckgo.com/?q=${encoded}&format=json&no_redirect=1&no_html=1&skip_disambig=1`,
          )
        : Promise.resolve(null),
    ]);

    let suggestions = [];
    if (suggestRes.status === "fulfilled") {
      try {
        const data = await suggestRes.value.json();
        suggestions = Array.isArray(data) ? (data[1] ?? []) : [];
      } catch {
        suggestions = [];
      }
    }

    let rich = null;
    if (
      this.richEnabled &&
      richRes.status === "fulfilled" &&
      richRes.value !== null
    ) {
      try {
        const ia = await richRes.value.json();
        if (ia.Heading && ia.AbstractText) {
          const richData = {};
          if (ia.AbstractText) richData.description = ia.AbstractText;
          if (ia.Image)
            richData.thumbnail = `https://duckduckgo.com${ia.Image}`;
          if (ia.Entity) richData.type = ia.Entity;
          rich = { text: ia.Heading, rich: richData };
        }
      } catch {
        rich = null;
      }
    }

    const results = [];
    if (rich) results.push(rich);
    for (const s of suggestions) {
      if (
        rich &&
        typeof s === "string" &&
        s.toLowerCase() === rich.text.toLowerCase()
      )
        continue;
      results.push(s);
    }
    return results;
  }
}
