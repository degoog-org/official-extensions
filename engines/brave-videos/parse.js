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
    const [, title, pageUrl, snippet, duration, thumbSrc] = match;
    const url = _decode(pageUrl);
    const thumbnail = _decode(thumbSrc);
    if (!url || !thumbnail) continue;
    results.push({
      title: _decode(title),
      url,
      snippet: snippet ? _decode(snippet) : "",
      source,
      thumbnail,
      duration: duration ?? "",
    });
  }
  return results;
};
