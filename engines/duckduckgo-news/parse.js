export const extractVqd = (html) => {
  const match = html.match(/vqd=['"]([^'"]+)['"]/);
  return match ? match[1] : null;
};

export const parseNews = (data, name) =>
  (data?.results ?? [])
    .map((item) => ({
      title: item.title ?? "",
      url: item.url ?? "",
      snippet: item.excerpt ?? item.body ?? "",
      source: item.source ?? name,
      ...(item.image ? { thumbnail: item.image } : {}),
    }))
    .filter((r) => r.title && r.url);
