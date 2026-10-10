export const extractVqd = (html) => {
  const match = html.match(/vqd=['"]([^'"]+)['"]/);
  return match ? match[1] : null;
};

const _thumbnail = (images) => {
  if (!images || typeof images !== "object") return "";
  return images.small ?? images.medium ?? images.large ?? "";
};

export const parseVideos = (data, name) =>
  (data?.results ?? [])
    .map((item) => ({
      title: item.title ?? "",
      url: item.content ?? "",
      snippet: item.description ?? "",
      source: name,
      thumbnail: _thumbnail(item.images),
      duration: item.duration ?? "",
    }))
    .filter((r) => r.url && r.title);
