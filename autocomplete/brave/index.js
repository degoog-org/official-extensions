export default class BraveAutocompleteProvider {
  isClientExposed = false;
  name = "Brave Autocomplete";
  description = "Autocomplete suggestions from Brave Search.";

  settingsSchema = [
    {
      key: "richSuggestions",
      label: "Rich suggestions",
      type: "toggle",
      default: "false",
      description:
        "Show entity cards (image, description) at the top of suggestions when available. Uses Brave's rich suggestions endpoint.",
      advanced: false,
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      secret: true,
      required: false,
      placeholder: "sk-...",
      description:
        "Optional Brave Search API key. If empty, the free unauthenticated endpoint is used.",
      advanced: false,
    },
  ];

  apiKey = "";
  richEnabled = false;

  configure(settings) {
    this.apiKey =
      typeof settings.apiKey === "string" ? settings.apiKey.trim() : "";
    this.richEnabled = settings.richSuggestions === "true";
  }

  async getSuggestions(query, context) {
    if (!query || !query.trim()) return [];

    const doFetch = context?.fetch ?? fetch;
    const lang = context?.lang ?? "en";
    const encoded = encodeURIComponent(query.trim());
    const url = `https://search.brave.com/api/suggest?q=${encoded}&rich=${this.richEnabled ? "true" : "false"}`;

    const headers = {
      Accept: "application/json",
      "Accept-Language": `${lang},en;q=0.9`,
    };

    if (this.apiKey) {
      headers["X-Subscription-Token"] = this.apiKey;
    }

    try {
      const res = await doFetch(url, { headers });
      if (!res.ok) return [];

      const data = await res.json();

      if (Array.isArray(data) && Array.isArray(data[1])) {
        if (!this.richEnabled) {
          return data[1]
            .map(String)
            .map((s) => s.trim())
            .filter(Boolean);
        }
        return data[1]
          .map((r) => {
            if (typeof r === "string") return r.trim();
            const textRaw =
              (r && typeof r.q === "string" && r.q) ||
              (r && typeof r.query === "string" && r.query) ||
              (r && typeof r.text === "string" && r.text) ||
              "";
            const text = typeof textRaw === "string" ? textRaw.trim() : "";
            if (!text) return "";
            const rich = {};
            if (r && typeof r.desc === "string" && r.desc.trim()) {
              rich.description = r.desc.trim();
            }
            if (
              r &&
              typeof r.description === "string" &&
              r.description.trim()
            ) {
              rich.description = r.description.trim();
            }
            if (r && typeof r.category === "string" && r.category.trim()) {
              rich.type = r.category.trim();
            }
            if (r && typeof r.type === "string" && r.type.trim()) {
              rich.type = r.type.trim();
            }
            const thumb =
              (r && typeof r.img === "string" && r.img.trim()) ||
              (r && typeof r.thumbnail === "string" && r.thumbnail.trim()) ||
              "";
            if (thumb) rich.thumbnail = thumb;
            return Object.keys(rich).length ? { text, rich } : text;
          })
          .filter(Boolean);
      }
      if (data && Array.isArray(data.results)) {
        if (!this.richEnabled) {
          return data.results
            .map((r) => {
              if (typeof r === "string") return r;
              if (r && typeof r.query === "string") return r.query;
              return "";
            })
            .map((s) => s.trim())
            .filter(Boolean);
        }
        return data.results
          .map((r) => {
            if (typeof r === "string") return r.trim();
            const textRaw =
              (r && typeof r.query === "string" && r.query) ||
              (r && typeof r.text === "string" && r.text) ||
              "";
            const text = typeof textRaw === "string" ? textRaw.trim() : "";
            if (!text) return "";
            const rich = {};
            if (
              r &&
              typeof r.description === "string" &&
              r.description.trim()
            ) {
              rich.description = r.description.trim();
            }
            if (r && typeof r.type === "string" && r.type.trim()) {
              rich.type = r.type.trim();
            }
            const thumb =
              (r && typeof r.thumbnail === "string" && r.thumbnail.trim()) ||
              (r &&
                typeof r.thumbnail_url === "string" &&
                r.thumbnail_url.trim()) ||
              (r &&
                typeof r.thumbnailUrl === "string" &&
                r.thumbnailUrl.trim()) ||
              "";
            if (thumb) rich.thumbnail = thumb;
            return Object.keys(rich).length ? { text, rich } : text;
          })
          .filter(Boolean);
      }

      return [];
    } catch {
      return [];
    }
  }
}
