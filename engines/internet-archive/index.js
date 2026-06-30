export const type = "file";

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const _formatBytes = (bytes) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};
export default class InternetArchiveEngine {
  isClientExposed = true;
  name = "Internet Archive";
  bangShortcut = "ia";

  async executeSearch(query, page = 1, timeFilter, context) {
    const rows = 20;
    let q = query;
    if (timeFilter === "hour") q += " AND date:[NOW-1HOUR TO NOW]";
    else if (timeFilter === "day") q += " AND date:[NOW-1DAY TO NOW]";
    else if (timeFilter === "week") q += " AND date:[NOW-7DAYS TO NOW]";
    else if (timeFilter === "month") q += " AND date:[NOW-1MONTH TO NOW]";
    else if (timeFilter === "year") q += " AND date:[NOW-1YEAR TO NOW]";
    else if (timeFilter === "custom" && context?.dateFrom) {
      const to = context.dateTo ?? "NOW";
      q += ` AND date:[${context.dateFrom} TO ${to}]`;
    }
    const params = new URLSearchParams({
      q,
      output: "json",
      rows: String(rows),
      page: String(page),
      "fl[]": "identifier,title,description,mediatype,item_size,downloads",
      "sort[]": "downloads desc",
    });

    const url = `https://archive.org/advancedsearch.php?${params.toString()}`;
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: {
        "User-Agent": context?.userAgent?.() || FALLBACK_UA,
        Accept: "application/json",
      },
    });
    context?.sentinel?.(response, this.name);

    const data = await response.json();
    const docs = data?.response?.docs ?? [];

    return docs.map((doc) => {
      const identifier = doc.identifier || "";
      const itemUrl = `https://archive.org/download/${identifier}`;
      const rawDesc = Array.isArray(doc.description)
        ? doc.description[0] || ""
        : doc.description || "";
      const mediatype = doc.mediatype || "unknown";
      const downloads = doc.downloads ? Number(doc.downloads).toLocaleString() : "0";
      const size = doc.item_size ? _formatBytes(Number(doc.item_size)) : "";
      const meta = [mediatype, size, `${downloads} downloads`].filter(Boolean).join(" · ");
      const snippet = meta + (rawDesc ? ` — ${rawDesc.slice(0, 200)}` : "");

      return {
        title: doc.title || identifier,
        url: itemUrl,
        snippet,
        source: this.name,
        thumbnail: `https://archive.org/services/img/${identifier}`,
      };
    });
  }
}