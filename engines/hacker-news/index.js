export const type = "news";

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const API_BASE = "https://hn.algolia.com/api/v1";

const _timeFilterToRange = (timeFilter, dateFrom, dateTo) => {
  const now = Math.floor(Date.now() / 1000);
  switch (timeFilter) {
    case "hour":
      return { since: now - 3600 };
    case "day":
      return { since: now - 86400 };
    case "week":
      return { since: now - 7 * 86400 };
    case "month":
      return { since: now - 30 * 86400 };
    case "year":
      return { since: now - 365 * 86400 };
    case "custom": {
      const out = {};
      if (dateFrom) out.since = Math.floor(new Date(`${dateFrom}T00:00:00Z`).getTime() / 1000);
      if (dateTo) out.until = Math.floor(new Date(`${dateTo}T23:59:59Z`).getTime() / 1000);
      return out;
    }
    default:
      return {};
  }
};

export default class HackerNewsEngine {
  isClientExposed = false;
  name = "Hacker News";
  bangShortcut = "hn";

  async executeSearch(query, page = 1, timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const useDate = timeFilter && timeFilter !== "any";
    const endpoint = useDate ? "search_by_date" : "search";
    const params = new URLSearchParams({
      query,
      tags: "story",
      hitsPerPage: "30",
      page: String(Math.max(0, (page || 1) - 1)),
    });

    const range = _timeFilterToRange(timeFilter, context?.dateFrom, context?.dateTo);
    const filters = [];
    if (range.since) filters.push(`created_at_i>${range.since}`);
    if (range.until) filters.push(`created_at_i<${range.until}`);
    if (filters.length) params.set("numericFilters", filters.join(","));

    try {
      const response = await doFetch(`${API_BASE}/${endpoint}?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": context?.userAgent?.() || FALLBACK_UA,
        },
      });
      context?.sentinel?.(response, this.name);
      const data = await response.json();
      const hits = data?.hits ?? [];

      return hits
        .map((hit) => {
          const hnLink = `https://news.ycombinator.com/item?id=${hit.objectID}`;
          const url = hit.url || hnLink;
          const points = typeof hit.points === "number" ? hit.points : 0;
          const comments = typeof hit.num_comments === "number" ? hit.num_comments : 0;
          const author = hit.author ? `by ${hit.author}` : "";
          const snippet = [
            `${points} points`,
            `${comments} comments`,
            author,
            `Discussion: ${hnLink}`,
          ]
            .filter(Boolean)
            .join(" • ");
          return {
            title: hit.title ?? hit.story_title ?? "",
            url,
            snippet,
            source: this.name,
          };
        })
        .filter((r) => r.title && r.url);
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      return [];
    }
  }
}
