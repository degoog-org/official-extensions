import * as cheerio from "cheerio";
import { isExternal, isGoLink, toGoUrl } from "./go.js";

const _resultHref = ($, $el) => {
  const href = $el
    .find("a[href]")
    .map((_, a) => $(a).attr("href"))
    .get()
    .find((candidate) => isExternal(candidate) || isGoLink(candidate));
  if (!href) return "";
  return isGoLink(href) ? toGoUrl(href) : href;
};

export const parseResults = (html, source) => {
  const $ = cheerio.load(html);
  const results = [];

  $('div[data-type="web"]').each((_, el) => {
    const $el = $(el);
    const href = _resultHref($, $el);
    const titleEl = $el.find('div.search-snippet-title, div[class*="search-snippet-title"]').first();
    const contentEl = $el.find("div.generic-snippet div.content").first();

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
