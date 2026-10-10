const _parseMmeta = (raw) => {
  try { return JSON.parse(raw); } catch { return null; }
};

const _tileTitle = ($tile) => {
  const aria = $tile.find("a[aria-label]").first().attr("aria-label")?.trim();
  if (aria) {
    const head = aria.split(/\bfrom\s+/i)[0]?.trim() ?? aria;
    return head.replace(/^[\s"'""]+|[\s"'""]+$/g, "").trim();
  }
  const titled = $tile.find("[title]").not("img").first().attr("title")?.trim();
  if (titled) return titled;
  return $tile.text().replace(/\s+/g, " ").trim();
};

const _tileDuration = ($tile) => {
  const hit = $tile.text().match(/\b\d{1,3}:\d{2}(:\d{2})?\b/);
  return hit?.[0] ?? "";
};

export const parseResults = ($, name) => {
  const results = [];
  const seen = new Set();

  const $tiles = $('[data-svcptid="VideoResults"]').find("[mmeta]");
  $tiles.each((_, el) => {
    const $el = $(el);
    const data = _parseMmeta($el.attr("mmeta") ?? "");
    const videoUrl = data?.murl || data?.pgurl || "";
    if (!videoUrl.startsWith("http")) return;
    let thumbnail = data?.turl ?? "";
    if (!thumbnail) {
      const img = $el.find("img").first();
      thumbnail = img.attr("data-src-hq") || img.attr("src") || "";
    }
    const title = _tileTitle($el);
    const duration = _tileDuration($el);
    if (!title || seen.has(videoUrl)) return;
    seen.add(videoUrl);
    results.push({ title, url: videoUrl, snippet: "", source: name, thumbnail, duration });
  });

  return results;
};
