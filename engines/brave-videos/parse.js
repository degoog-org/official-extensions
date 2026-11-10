import { RESULTS_KEY, VIDEOS_RESPONSE } from "./const/search.js";
import { findClosing, readHoisted, readLiteral, readObject, splitTopLevel } from "./scan.js";

const _resolver = (hoisted) => (token) => {
  if (!token) return null;
  return readLiteral(token) ?? hoisted.get(token) ?? null;
};

const _toResult = (entry, resolve, source) => {
  const fields = readObject(entry);
  const video = readObject(fields.get("video") ?? "");
  const thumb = readObject(fields.get("thumbnail") ?? "");
  const url = resolve(fields.get("url"));
  const thumbnail = resolve(thumb.get("src"));
  if (!url || !thumbnail) return null;
  return {
    title: resolve(fields.get("title")) ?? "",
    url,
    snippet: resolve(fields.get("description")) ?? "",
    source,
    thumbnail,
    duration: resolve(video.get("duration")) ?? "",
  };
};

export const parseResults = (html, source) => {
  const anchor = html.indexOf(RESULTS_KEY, Math.max(html.indexOf(VIDEOS_RESPONSE), 0));
  if (anchor < 0) return [];
  const listStart = anchor + RESULTS_KEY.length - 1;
  const listEnd = findClosing(html, listStart);
  if (listEnd < 0) return [];
  const resolve = _resolver(readHoisted(html, anchor));
  return splitTopLevel(html.slice(listStart + 1, listEnd))
    .map((entry) => _toResult(entry, resolve, source))
    .filter(Boolean);
};
