export default class GoogleAutocompleteProvider {
  isClientExposed = false;
  name = "Google Autocomplete";
  description = "Autocomplete suggestions from Google.";

  settingsSchema = [
    {
      key: "richSuggestions",
      label: "Rich suggestions",
      type: "toggle",
      default: "false",
      description:
        "Show entity cards (image, description) at the top of suggestions when available. Switches to the Chrome client endpoint.",
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

    try {
      if (this.richEnabled) {
        const url = `https://www.google.com/complete/search?q=${encoded}&client=gws-wiz&xssi=t&hl=${context?.lang || "en"}`;
        const res = await doFetch(url);
        const buf = await res.arrayBuffer();
        let text = new TextDecoder("iso-8859-1").decode(buf);
        if (text.startsWith(")]}'")) text = text.substring(4);
        const data = JSON.parse(text);
        const items = data[0] || [];
        return items.map((item) => {
          const raw = (item[0] || "")
            .replace(/<\/?b>/gi, "")
            .replace(/&#39;/g, "'");
          const meta = item[3];
          if (!meta) return raw;
          const rich = {};
          if (meta.zi) rich.description = meta.zi;
          if (meta.zs) rich.thumbnail = meta.zs;
          return Object.keys(rich).length > 0 ? { text: raw, rich } : raw;
        });
      }
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encoded}`;
      const res = await doFetch(url);
      const buf = await res.arrayBuffer();
      const text = new TextDecoder("iso-8859-1").decode(buf);
      return JSON.parse(text)[1] ?? [];
    } catch {
      return [];
    }
  }
}
