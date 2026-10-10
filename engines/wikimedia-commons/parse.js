const _stripHtml = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]+>/g, "").trim();
};

const _extractSnippet = (extmetadata) => {
  if (!extmetadata) return "";
  const desc = _stripHtml(extmetadata.ImageDescription?.value ?? "");
  const artist = _stripHtml(extmetadata.Artist?.value ?? "");
  const license = extmetadata.LicenseShortName?.value ?? "";
  const parts = [];
  if (desc) parts.push(desc);
  if (artist) parts.push(`By ${artist}`);
  if (license) parts.push(license);
  return parts.join(" - ");
};

export const parseResults = (data, source) => {
  const pages = data?.query?.pages;
  if (!pages) return [];

  const items = Object.values(pages);
  items.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  return items
    .map((p) => {
      const info = Array.isArray(p.imageinfo) ? p.imageinfo[0] : null;
      if (!info) return null;
      const thumb = info.thumburl ?? info.url ?? "";
      const fullUrl = info.url ?? "";
      const pageUrl =
        info.descriptionurl ??
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title ?? "")}`;
      const title = (p.title ?? "").replace(/^File:/, "");
      return {
        title,
        url: pageUrl,
        snippet: _extractSnippet(info.extmetadata) || title,
        source,
        thumbnail: thumb,
        imageUrl: fullUrl,
      };
    })
    .filter((r) => r && r.thumbnail && r.url);
};
