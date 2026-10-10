const _decodeUrl = (href) => {
  if (!href.startsWith("https://www.bing.com/ck/a?")) return href;
  try {
    const u = new URL(href).searchParams.get("u");
    if (!u || !u.startsWith("a1")) return href;
    const b64 = u.slice(2).replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
    return atob(padded);
  } catch {
    return href;
  }
};

export const parseResults = ($, name) => {
  const results = [];

  const items = $("li.b_algo").length > 0 ? $("li.b_algo") : $('li[class*="b_algo"]');
  items.each((_, el) => {
    const titleEl = $(el).find("h2 a").first();
    const snippetEl = $(el).find(".b_caption p").first();
    const title = titleEl.text().trim();
    const href = _decodeUrl(titleEl.attr("href") || "");
    const snippet = snippetEl.text().trim();
    if (title && href && href.startsWith("http")) {
      results.push({ title, url: href, snippet, source: name });
    }
  });

  if (results.length === 0) {
    $("#b_results li, main li").each((_, el) => {
      const $li = $(el);
      const titleEl = $li.find("h2 a").first();
      const href = _decodeUrl(titleEl.attr("href") || "");
      const title = titleEl.text().trim();
      if (title && href && href.startsWith("http")) {
        const snippetEl = $li.find("p").first();
        results.push({ title, url: href, snippet: snippetEl.text().trim(), source: name });
      }
    });
  }

  return results;
};
