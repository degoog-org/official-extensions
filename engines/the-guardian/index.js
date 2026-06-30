export const type = "news";

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const API_URL = "https://content.guardianapis.com/search";


const _timeFilterToDates = (timeFilter, dateFrom, dateTo) => {
  if (timeFilter === "custom") {
    return { from: dateFrom || "", to: dateTo || "" };
  }
  const now = new Date();
  const toIso = (d) => d.toISOString().slice(0, 10);
  const out = { from: "", to: toIso(now) };
  const d = new Date(now);
  switch (timeFilter) {
    case "hour":
      d.setHours(d.getHours() - 1);
      break;
    case "day":
      d.setDate(d.getDate() - 1);
      break;
    case "week":
      d.setDate(d.getDate() - 7);
      break;
    case "month":
      d.setMonth(d.getMonth() - 1);
      break;
    case "year":
      d.setFullYear(d.getFullYear() - 1);
      break;
    default:
      return { from: "", to: "" };
  }
  out.from = toIso(d);
  return out;
};


const _stripHtml = (html) => {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
};

export default class TheGuardianEngine {
  isClientExposed = false;
  name = "The Guardian";
  bangShortcut = "guardian";

  settingsSchema = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      secret: true,
      required: true,
      placeholder: "Enter your Guardian Open Platform API key",
      description:
        "Get a free API key at open-platform.theguardian.com/access/. Required to use this engine.",
    },
  ];

  apiKey = "";

  configure(settings) {
    this.apiKey = settings?.apiKey || "";
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!this.apiKey) return [];
    const doFetch = context?.fetch ?? fetch;

    const params = new URLSearchParams({
      q: query,
      "api-key": this.apiKey,
      "show-fields": "trailText,thumbnail",
      "page-size": "20",
      page: String(Math.max(1, page || 1)),
      "order-by": "newest",
    });

    const { from, to } = _timeFilterToDates(timeFilter, context?.dateFrom, context?.dateTo);
    if (from) params.set("from-date", from);
    if (to) params.set("to-date", to);

    try {
      const response = await doFetch(`${API_URL}?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": context?.userAgent?.() || FALLBACK_UA,
        },
      });
      context?.sentinel?.(response, this.name);
      const data = await response.json();
      const items = data?.response?.results ?? [];

      return items
        .map((item) => ({
          title: item.webTitle ?? "",
          url: item.webUrl ?? "",
          snippet: _stripHtml(item.fields?.trailText ?? ""),
          source: item.sectionName ? `The Guardian — ${item.sectionName}` : this.name,
          ...(item.fields?.thumbnail ? { thumbnail: item.fields.thumbnail } : {}),
        }))
        .filter((r) => r.title && r.url);
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      return [];
    }
  }
}
