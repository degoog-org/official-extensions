import { RESULT_RE } from "./const/search.js";

const _decode = (raw) =>
  raw
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

export const parseResults = (html, source) => {
  const results = [];
  for (const match of html.matchAll(RESULT_RE)) {
    const [, title, pageUrl, , thumbSrc, original] = match;
    const thumbnail = _decode(thumbSrc);
    const imageUrl = _decode(original);
    if (!thumbnail || !imageUrl) continue;
    results.push({
      title: _decode(title),
      url: _decode(pageUrl) || imageUrl,
      snippet: "",
      source,
      thumbnail,
      imageUrl,
    });
  }
  return results;
};
