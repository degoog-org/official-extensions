const _formatBytes = (bytes) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const parseDocs = (data, source) =>
  (data?.response?.docs ?? []).map((doc) => {
    const identifier = doc.identifier || "";
    const itemUrl = `https://archive.org/download/${identifier}`;
    const rawDesc = Array.isArray(doc.description)
      ? doc.description[0] || ""
      : doc.description || "";
    const mediatype = doc.mediatype || "unknown";
    const downloads = doc.downloads ? Number(doc.downloads).toLocaleString() : "0";
    const size = doc.item_size ? _formatBytes(Number(doc.item_size)) : "";
    const meta = [mediatype, size, `${downloads} downloads`].filter(Boolean).join(" · ");
    const snippet = meta + (rawDesc ? ` - ${rawDesc.slice(0, 200)}` : "");

    return {
      title: doc.title || identifier,
      url: itemUrl,
      snippet,
      source,
      thumbnail: `https://archive.org/services/img/${identifier}`,
    };
  });
