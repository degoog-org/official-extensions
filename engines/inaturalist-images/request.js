import { API_URL, TAXA_URL, FALLBACK_UA, PAGE_SIZE } from "./const/api.js";

// Text search over observations matches descriptions, tags and places, so a
// plain word like "cat" surfaces skunks and squirrels. The engine therefore
// resolves the query to a taxon first and searches within that taxon only.
export const buildResolveUrl = (query) => {
  const params = new URLSearchParams({
    q: query,
    per_page: "20",
  });
  return `${TAXA_URL}?${params.toString()}`;
};

export const buildSearchUrl = (query, page, taxonId) => {
  const params = new URLSearchParams({
    photos: "true",
    page: String(Math.max(1, page || 1)),
    per_page: String(PAGE_SIZE),
    order_by: "observations",
    order: "desc",
  });
  if (taxonId) params.set("taxon_id", String(taxonId));
  else params.set("q", query);
  return `${API_URL}?${params.toString()}`;
};

export const buildHeaders = (context) => ({
  Accept: "application/json",
  "Accept-Language": context?.buildAcceptLanguage?.() ?? "en,en-US;q=0.9",
  "User-Agent": context?.userAgent?.() || FALLBACK_UA,
});
