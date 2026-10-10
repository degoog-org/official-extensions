export const parseResults = (data, host, source) => {
  if (data?.error) return [];
  const items = data?.query?.search;
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    title: item.title,
    url: `https://${host}/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
    snippet: (item.snippet ?? "").replace(/<[^>]+>/g, "").trim(),
    source,
  }));
};
