export const parseResults = ($, name, context) => {
  const results = [];

  $(".news-card").each((_, el) => {
    const $el = $(el);
    const href =
      $el.attr("url") || $el.attr("data-url") ||
      $el.find("a[href^='http']").first().attr("href") || "";
    if (!href || !href.startsWith("http")) return;

    const title = $el.find(".title").text().trim() || $el.find("a.title").text().trim();
    const snippet = $el.find(".snippet").text().trim();
    const thumbnail = context?.extractImageUrl?.($el, "https://www.bing.com", [".image img", ".imagelink img"]) ?? "";

    if (title) {
      results.push({
        title, url: href, snippet, source: name,
        ...(thumbnail ? { thumbnail } : {}),
      });
    }
  });

  return results;
};
