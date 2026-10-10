import * as cheerio from "cheerio";
import { THUMBNAIL_SELECTORS } from "./const/search.js";

export const parseResults = (html, name, context) => {
  const $ = cheerio.load(html);
  const results = [];

  $("div.snippet[data-type='news'], div[data-type='news']").each((_, el) => {
    const $el = $(el);
    const linkEl = $el.find("a[href^='http']").first();
    const href = linkEl.attr("href") ?? "";
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
