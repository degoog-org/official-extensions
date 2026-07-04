export const type = "images";
export const filters = {
  nsfw: ["on", "moderate", "off"],
};

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const API_URL = "https://images-api.nasa.gov/search";
const PAGE_SIZE = 25;

const _pickThumbnail = (links) => {
  if (!Array.isArray(links)) return "";
  const preview = links.find((l) => l.rel === "preview" && l.href);
  return preview?.href ?? links[0]?.href ?? "";
};

export default class NasaImagesEngine {
  isClientExposed = false;
  name = "NASA Images";
  bangShortcut = "nasa";

  executeSearch = async (query, page = 1, _timeFilter, context) => {
    const doFetch = context?.fetch ?? fetch;
    const params = new URLSearchParams({
      q: query,
      media_type: "image",
      page: String(Math.max(1, page || 1)),
      page_size: String(PAGE_SIZE),
    });

    try {
      const response = await doFetch(`${API_URL}?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "Accept-Language": context?.buildAcceptLanguage?.() ?? "en,en-US;q=0.9",
          "User-Agent": context?.userAgent?.() || FALLBACK_UA,
        },
      });

      context?.sentinel?.(response, this.name);

      const data = await response.json();
      const items = data?.collection?.items ?? [];

      return items
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
            source: this.name,
            thumbnail: thumb,
            imageUrl: thumb,
          };
        })
        .filter((r) => r && r.thumbnail && r.url);
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      return [];
    }
  };
}
