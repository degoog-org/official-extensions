// iNaturalist observation photos come from two CDNs; photo.url is always the
// square thumbnail. Swapping the size token in the path gives larger renditions.
const _sizeUrl = (url, size) =>
  typeof url === "string" ? url.replace(/\/(square|small|medium|large|original)\./, `/${size}.`) : "";

const _title = (observation) => {
  const taxon = observation?.taxon ?? null;
  const common = taxon?.preferred_common_name ?? "";
  const scientific = taxon?.name ?? "";
  if (common && scientific) {
    return common === scientific ? scientific : `${common} (${scientific})`;
  }
  return scientific || common || observation?.species_guess || "Unidentified organism";
};

const _snippet = (observation) => {
  const parts = [];
  const grade = observation?.quality_grade;
  if (grade === "research") parts.push("research grade");
  else if (grade === "needs_id") parts.push("needs ID");
  const who = observation?.user?.login;
  if (who) parts.push(`observed by ${who}`);
  const where = observation?.place_guess;
  if (where) parts.push(where);
  const when = observation?.observed_on_details?.date ?? observation?.observed_on;
  if (when) parts.push(when);
  return parts.join(" · ");
};

export const parseItems = (data, source) =>
  (data?.results ?? [])
    .map((observation) => {
      const photo = (observation?.photos ?? []).find((p) => p?.url);
      if (!photo) return null;

      const id = observation?.id ?? observation?.uuid ?? "";
      const pageUrl = id ? `https://www.inaturalist.org/observations/${encodeURIComponent(id)}` : _sizeUrl(photo.url, "medium");
      const thumb = _sizeUrl(photo.url, "square");
      const full = _sizeUrl(photo.url, "original");

      return {
        title: _title(observation),
        url: pageUrl,
        snippet: _snippet(observation),
        source,
        thumbnail: thumb,
        imageUrl: full || thumb,
      };
    })
    .filter((r) => r && r.thumbnail && r.url);
