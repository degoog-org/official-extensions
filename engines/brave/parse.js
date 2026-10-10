import * as cheerio from "cheerio";
import { BASE_URL } from "./const/search.js";

export const parseResults = (html, source) => {
  const $ = cheerio.load(html);
  const results = [];

  $('div[data-type="web"]').each((_, el) => {
    const $el = $(el);
    const linkEl = $el.find('a[href^="http"]').first();
    const href = linkEl.attr("href") ?? "";
    const titleEl = $el.find('div.search-snippet-title, div[class*="search-snippet-title"]').first();
    const contentEl = $el.find("div.generic-snippet div.content").first();

    try {
      const parsed = new URL(href, BASE_URL);
      if (parsed.origin === new URL(BASE_URL).origin) return;
    } catch { return; }
    if (!href) return;
    const title = titleEl.text().trim();
    const snippet = contentEl.text().trim();
    if (!title) return;
    const thumbnail = $el.find('a[class*="thumbnail"] img[src]').first().attr("src");
    results.push({
      title, url: href, snippet, source,
      ...(thumbnail ? { thumbnail } : {}),
    });
  });

  return results;
};
