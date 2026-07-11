import * as cheerio from "cheerio";

const _decodeJsUrl = (value) =>
  String(value ?? "")
    .replace(/\\u003d/g, "=")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/\\x27/g, "'")
    .replace(/\\x22/g, '"');

const _parseIschjJson = (html, sourceName) => {
  const jsonStart = html.indexOf('{"ischj":');
  if (jsonStart < 0) return [];
  try {
    const data = JSON.parse(html.substring(jsonStart));
    const metadata = data.ischj?.metadata || [];
    const results = [];
    for (const item of metadata) {
      const title = item.result?.page_title?.replace(/<[^>]+>/g, "") || "";
      const url = item.result?.referrer_url || "";
      const thumbnail = item.thumbnail?.url || "";
      if (title && url) {
        results.push({
          title,
          url,
          snippet: item.result?.site_title || "",
          source: sourceName,
          thumbnail,
          imageUrl: item.original_image?.url || thumbnail,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
};

const _parseImageArrays = (html) => {
  const images = new Map();
  const re =
    /\[(\d+),"([^"]+)",\["((?:\\.|[^"\\])+)",(\d+),(\d+)\],\["((?:\\.|[^"\\])+)",(\d+),(\d+)\]/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const key = match[2];
    const thumb = _decodeJsUrl(match[3]);
    const original = _decodeJsUrl(match[6]);
    if (original.startsWith("x-raw-image")) continue;
    if (!images.has(key) || original.startsWith("http")) {
      images.set(key, { thumbnail: thumb, imageUrl: original });
    }
  }
  return images;
};

const _parseLdi = (html) => {
  const ldi = {};
  for (const match of html.matchAll(/google\.ldi\s*=\s*(\{[^;]+\})/g)) {
    try {
      Object.assign(ldi, JSON.parse(match[1]));
    } catch {}
  }
  return ldi;
};

const _parseTiles = ($, images, ldi, sourceName) => {
  const results = [];
  const seen = new Set();

  $("[data-lpage][data-docid]").each((_, el) => {
    const tile = $(el);
    const url = tile.attr("data-lpage") || "";
    const docid = tile.attr("data-docid") || "";
    if (!url.startsWith("http") || seen.has(url)) return;

    const img = tile.find("img[alt]").first();
    const title =
      img.attr("alt")?.trim() ||
      tile.find("h3").first().text().trim() ||
      "";
    if (!title) return;

    const imgId = img.attr("id") || "";
    const fromArray = images.get(docid);
    const thumbnail =
      fromArray?.thumbnail ||
      ldi[imgId] ||
      img.attr("src") ||
      "";
    const imageUrl = fromArray?.imageUrl || thumbnail;

    if (thumbnail.startsWith("data:") && !fromArray?.imageUrl) return;

    seen.add(url);
    results.push({
      title,
      url,
      snippet: "",
      source: sourceName,
      thumbnail,
      imageUrl,
    });
  });

  return results;
};

export function parseGoogleImagesHtml(html, sourceName) {
  const fromJson = _parseIschjJson(html, sourceName);
  if (fromJson.length > 0) return fromJson;

  const images = _parseImageArrays(html);
  const ldi = _parseLdi(html);
  const $ = cheerio.load(html);
  return _parseTiles($, images, ldi, sourceName);
}
