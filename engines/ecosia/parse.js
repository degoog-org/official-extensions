import * as cheerio from "cheerio";
import { RESULT_SELECTOR, SNIPPET_SELECTOR } from "./const/serp.js";

const _looksLikeUrl = (text) =>
  !text ||
  /^https?:\/\//i.test(text) ||
  text.includes("›") ||
  /^[\w-]+(\.[\w-]+)+(\s|\/|$)/.test(text);

const _pickTitleLink = ($, $el) => {
  const heading = $el.find("h2 a, h3 a, a:has(h2), a:has(h3)").first();
  if (heading.length && heading.attr("href")?.startsWith("http")) return heading;

  let picked = $();
  $el.find('a[href^="http"]').each((_, a) => {
    if (picked.length) return;
    const $a = $(a);
    if (!_looksLikeUrl($a.text().trim())) picked = $a;
  });
  return picked.length ? picked : $el.find('a[href^="http"]').first();
};

const _isEcosiaHost = (href) => {
  try {
    const parsed = new URL(href);
    return parsed.hostname === "ecosia.org" || parsed.hostname.endsWith(".ecosia.org");
  } catch {
    return false;
  }
};

export const parseResults = (html, name) => {
  const $ = cheerio.load(html);
  const results = [];

  $(RESULT_SELECTOR).each((_, el) => {
    const $el = $(el);
    const titleLink = _pickTitleLink($, $el);
    const href = titleLink.attr("href") ?? "";
    const title = titleLink.text().trim();
    const snippet = $el.find(SNIPPET_SELECTOR).first().text().trim();

    if (title && href && href.startsWith("http") && !_isEcosiaHost(href)) {
      results.push({
        title,
        url: href,
        snippet: snippet || "",
        source: name,
      });
    }
  });

  return results;
};
