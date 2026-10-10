export const trimUrl = (v) => String(v ?? "").trim().replace(/\/+$/, "");

export const buildSearchRequest = (immichUrl, apiKey, query, page, pageSize) => ({
  url: `${immichUrl}/api/search/smart`,
  init: {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ query, page, size: pageSize, withExif: true }),
  },
});

export const buildThumbUrl = (immichUrl, id, size) =>
  `${immichUrl}/api/assets/${id}/thumbnail?size=${size}`;
