export const extractVqd = (html) => {
  const match =
    html.match(/vqd=['"]([^'"]+)['"]/) ||
    html.match(/name=['"]vqd['"][^>]*value=['"]([^'"]+)['"]/);
  return match ? match[1] : null;
};

const _resolveRedirect = (href) => {
  try {
    const parsed = new URL(href, "https://duckduckgo.com");
    if (parsed.searchParams.has("uddg")) return parsed.searchParams.get("uddg");
    if (parsed.pathname.endsWith("/y.js") && parsed.searchParams.has("u")) return parsed.searchParams.get("u");
  } catch {}
  return href;
};

const _isInternal = (url) => {
  try {
    const h = new URL(url).hostname;
    return h === "duckduckgo.com" || h.endsWith(".duckduckgo.com");
  } catch { return false; }
};

export const parseResults = ($, name) => {
  const results = [];
  $(".result").each((_, el) => {
    const titleEl = $(el).find(".result__title a").first();
    const snippetEl = $(el).find(".result__snippet").first();
    const title = titleEl.text().trim();
    const href = _resolveRedirect(titleEl.attr("href") || "");
    const snippet = snippetEl.text().trim();
    if (title && href && href.startsWith("http") && !_isInternal(href)) {
      results.push({ title, url: href, snippet, source: name });
    }
  });
  return results;
};
