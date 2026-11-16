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

// For text-search fallbacks (no taxon resolved): drop observations whose taxon
// only matches the query through stray metadata in iNat's whole-text index
// ("trump" -> 36k unrelated observations). Require a query token (>= 3 chars)
// to word-hit the taxon's common or scientific name; the loose two-way prefix
// lets "opiliones" match *Phalangium opilio* and "cats" match "Cat".
const _nameRelevant = (query, observation) => {
  const tokens = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return true;
  const taxon = observation?.taxon ?? {};
  const words = `${taxon.preferred_common_name ?? ""} ${taxon.name ?? ""} ${observation?.species_guess ?? ""}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  return tokens.some((t) =>
    words.some((w) => w.startsWith(t) || t.startsWith(w)),
  );
};

export const parseItems = (data, source, query) =>
  (data?.results ?? [])
    .filter((observation) => _nameRelevant(query, observation))
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
