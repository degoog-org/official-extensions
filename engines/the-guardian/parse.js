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

export const parseResults = (data, fallbackSource) => {
  const items = data?.response?.results ?? [];

  return items
    .map((item) => ({
      title: item.webTitle ?? "",
      url: item.webUrl ?? "",
      snippet: _stripHtml(item.fields?.trailText ?? ""),
      source: item.sectionName ? `The Guardian - ${item.sectionName}` : fallbackSource,
      ...(item.fields?.thumbnail ? { thumbnail: item.fields.thumbnail } : {}),
    }))
    .filter((r) => r.title && r.url);
};
