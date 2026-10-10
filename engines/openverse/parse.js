export const parseResults = (data, source) =>
  (data?.results ?? [])
    .map((item) => ({
      title: item.title ?? "",
      url: item.foreign_landing_url ?? item.url ?? "",
      snippet: item.creator
        ? `By ${item.creator}${item.license ? ` - ${item.license}` : ""}`
        : (item.license ?? ""),
      source,
      thumbnail: item.thumbnail ?? item.url ?? "",
      imageUrl: item.url ?? item.thumbnail ?? "",
    }))
    .filter((r) => r.url && r.thumbnail);
