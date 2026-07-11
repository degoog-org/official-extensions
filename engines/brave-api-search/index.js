const API_URL = "https://api.search.brave.com/res/v1/web/search";

export default class BraveApiSearchEngine {
  isClientExposed = false;
  name = "Brave Search";
  bangShortcut = "brave";

  settingsSchema = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      secret: true,
      required: true,
      placeholder: "Enter your API key",
      description: "Get an API key at brave.com/search/api",
    },
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "strict"],
      default: "moderate",
      description: "Filter explicit content from results.",
    },
  ];

  apiKey = "";
  safeSearch = "moderate";

  configure(settings) {
    this.apiKey = settings.apiKey || "";
    this.safeSearch = settings.safeSearch || "moderate";
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!this.apiKey) return [];

    const doFetch = context?.fetch ?? fetch;
    const offset = ((page || 1) - 1) * 20;

    const params = new URLSearchParams({
      q: query,
      count: "20",
      offset: String(offset),
      safesearch: this.safeSearch,
    });

    if (context?.lang) params.set("search_lang", context.lang);

    const timeMap = { hour: "ph", day: "pd", week: "pw", month: "pm", year: "py" };
    if (timeFilter && timeFilter !== "any" && timeFilter !== "custom" && timeMap[timeFilter]) {
      params.set("freshness", timeMap[timeFilter]);
    }

    try {
      const response = await doFetch(`${API_URL}?${params}`, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": this.apiKey,
        },
      });

      context?.sentinel?.(response, this.name);

      const data = await response.json();
      const items = data?.web?.results ?? [];

      return items.map((item) => ({
        title: item.title ?? "",
        url: item.url ?? "",
        snippet: item.description ?? "",
        source: this.name,
        thumbnail: item.thumbnail?.src ?? "",
      }));
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      return [];
    }
  }
}
