export const parseResults = (data, source) =>
  (data?.web?.results ?? []).map((item) => ({
    title: item.title ?? "",
    url: item.url ?? "",
    snippet: item.description ?? "",
    source,
    thumbnail: item.thumbnail?.src ?? "",
  }));
