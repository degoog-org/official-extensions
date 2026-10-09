import {
  GOTO_ORIGIN,
  GOTO_PREFIX,
  MUTANT_SIGNATURES,
} from "./const/serp.js";

const _resolveHref = (href) => {
  if (!href.startsWith("/url?")) return href;
  try {
    const parsed = new URL(href, "https://www.google.com");
    return (
      parsed.searchParams.get("q") || parsed.searchParams.get("url") || href
    );
  } catch {
    return href;
  }
};

export const isInterstitial = (html) => {
  const head = html.slice(0, 4000);
  return MUTANT_SIGNATURES.some((m) => head.includes(m));
};

export const isExternal = (url) =>
  url.startsWith("http") && !url.includes("google.com");

export const parseDesktop = ($, name) => {
  const results = [];
  const seen = new Set();
  $("a:has(h3)").each((_, el) => {
    const linkEl = $(el);
    const href = linkEl.attr("href") || "";
    const goto = href.startsWith(GOTO_PREFIX) ? `${GOTO_ORIGIN}${href}` : "";
    const url = goto || _resolveHref(href);
    if (!goto && !isExternal(url)) return;
    const title = linkEl.find("h3").first().text().trim();
    if (!title || seen.has(url)) return;
    seen.add(url);
    const block = linkEl.closest("[data-hveid]");
    const snippet =
      block.find("[data-sncf]").first().text().trim() ||
      block.find(".VwiC3b").first().text().trim() ||
      "";
    results.push({ title, url, snippet, source: name });
  });
  return results;
};
