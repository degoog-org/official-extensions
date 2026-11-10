import { IMAGES_RESPONSE, RESULTS_KEY } from "./const/search.js";
import { findClosing, readHoisted, readLiteral, readObject, splitTopLevel } from "./scan.js";

const _resolver = (hoisted) => (token) => {
  if (!token) return null;
  return readLiteral(token) ?? hoisted.get(token) ?? null;
};

const _toResult = (entry, resolve, source) => {
  const fields = readObject(entry);
  const thumb = readObject(fields.get("thumbnail") ?? "");
  const properties = readObject(fields.get("properties") ?? "");
  const thumbnail = resolve(thumb.get("src"));
  const imageUrl = resolve(thumb.get("original")) || resolve(properties.get("url"));
  if (!thumbnail || !imageUrl) return null;
  return {
    title: resolve(fields.get("title")) ?? "",
    url: resolve(fields.get("url")) || imageUrl,
    snippet: "",
    source,
    thumbnail,
    imageUrl,
  };
};

export const parseResults = (html, source) => {
  const anchor = html.indexOf(RESULTS_KEY, Math.max(html.indexOf(IMAGES_RESPONSE), 0));
  if (anchor < 0) return [];
  const listStart = anchor + RESULTS_KEY.length - 1;
  const listEnd = findClosing(html, listStart);
  if (listEnd < 0) return [];
  const resolve = _resolver(readHoisted(html, anchor));
  return splitTopLevel(html.slice(listStart + 1, listEnd))
    .map((entry) => _toResult(entry, resolve, source))
    .filter(Boolean);
};
