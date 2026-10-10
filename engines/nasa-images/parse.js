const _pickThumbnail = (links) => {
  if (!Array.isArray(links)) return "";
  const preview = links.find((l) => l.rel === "preview" && l.href);
  return preview?.href ?? links[0]?.href ?? "";
};

export const parseItems = (data, source) =>
  (data?.collection?.items ?? [])
    .map((item) => {
      const meta = Array.isArray(item.data) ? item.data[0] : null;
      if (!meta) return null;
      const thumb = _pickThumbnail(item.links);
      const nasaId = meta.nasa_id ?? "";
      const pageUrl = nasaId ? `https://images.nasa.gov/details-${encodeURIComponent(nasaId)}` : (item.href ?? thumb);
      return {
        title: meta.title ?? "",
        url: pageUrl,
        snippet: meta.description ?? meta.description_508 ?? "",
        source,
        thumbnail: thumb,
        imageUrl: thumb,
      };
    })
    .filter((r) => r && r.thumbnail && r.url);
