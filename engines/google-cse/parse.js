const _webItem = (item, sourceName) => {
  const url = item.unescapedUrl;
  if (!url) return null;
  return {
    title: item.titleNoFormatting || "",
    url,
    snippet: item.contentNoFormatting || "",
    source: sourceName,
    thumbnail: item.richSnippet?.cseThumbnail?.src || undefined,
  };
};

const _imageItem = (item, sourceName) => {
  const url = item.originalContextUrl;
  const imageUrl = item.unescapedUrl;
  if (!url || !imageUrl) return null;
  return {
    title: item.titleNoFormatting || "",
    url,
    snippet: item.contentNoFormatting || "",
    source: sourceName,
    thumbnail: item.tbUrl || imageUrl,
    imageUrl,
  };
};

export const cseBody = (text) => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

export const cseResults = (data, category, sourceName) => {
  const items = Array.isArray(data?.results) ? data.results : [];
  const mapItem = category === "image" ? _imageItem : _webItem;
  return items
    .map((item) => mapItem(item, sourceName))
    .filter((result) => result !== null);
};
