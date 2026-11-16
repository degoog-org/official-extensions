import * as cheerio from "cheerio";
import { THUMBNAIL_SELECTORS } from "./const/search.js";
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

export const parseResults = (html, name, context) => {
  const $ = cheerio.load(html);
  const results = [];

  $("div.snippet[data-type='news'], div[data-type='news']").each((_, el) => {
    const $el = $(el);
    const href = _resultHref($, $el);
    const title = $el.find("div.title").text().trim() || $el.text().trim();
    const snippet = $el.find("div.description").text().trim() || "";
    const source = $el.find(".site-name-content > span:first-child").text().trim() || "";
    const thumbnail = context?.extractImageUrl?.($el, "https://search.brave.com", THUMBNAIL_SELECTORS) ?? "";
    if (title) {
      results.push({
        title, url: href, snippet, source: source ?? name,
        ...(thumbnail ? { thumbnail } : {}),
      });
    }
  });

  return results;
};
