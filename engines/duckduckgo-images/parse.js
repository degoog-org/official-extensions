export const extractVqd = (html) => {
  const match = html.match(/vqd=['"]([^'"]+)['"]/);
  return match ? match[1] : null;
};

export const parseImages = (data, name) =>
  (data?.results ?? [])
    .map((item) => ({
      title: item.title ?? "",
      url: item.url ?? "",
      snippet: item.title ?? "",
      source: name,
      thumbnail: item.thumbnail ?? "",
      imageUrl: item.image ?? item.thumbnail ?? "",
    }))
    .filter((r) => r.url && r.thumbnail);
