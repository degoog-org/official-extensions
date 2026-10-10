import { ID_RE } from "./const/api.js";
import { sign } from "./sign.js";
import { translate } from "./translate.js";

const _date = (iso) => {
  const d = new Date(iso ?? "");
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const _place = (exif) => [exif?.city, exif?.country].filter(Boolean).join(", ");

export const parseAssets = (data, { base, source, t, routeUrl }) => {
  const items = Array.isArray(data?.assets?.items) ? data.assets.items : [];
  return items
    .filter((asset) => ID_RE.test(String(asset?.id ?? "")))
    .map((asset) => {
      const id = String(asset.id);
      const sig = sign(id);
      return {
        title: asset.originalFileName || translate(t, "result.photo", "Photo"),
        url: `${base}/photos/${encodeURIComponent(id)}`,
        snippet: [_date(asset.localDateTime || asset.fileCreatedAt), _place(asset.exifInfo)].filter(Boolean).join(" · "),
        source,
        thumbnail: routeUrl(`/thumb?id=${id}&sig=${sig}`),
        imageUrl: routeUrl(`/thumb?id=${id}&sig=${sig}&size=preview`),
      };
    });
};
