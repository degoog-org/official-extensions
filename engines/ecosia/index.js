import * as cheerio from "cheerio";

const CLOUDFLARE_CHALLENGE_MARKER = "Just a moment";
const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

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

export default class EcosiaEngine {
  isClientExposed = false;
  name = "Ecosia";
  bangShortcut = "ecosia";

  async executeSearch(query, page = 1, _timeFilter, context) {
    const p = Math.max(0, (page || 1) - 1);
    const params = new URLSearchParams({ q: query });
    if (p > 0) params.set("p", String(p));
    const url = `https://www.ecosia.org/search?${params.toString()}`;
    const doFetch = context?.fetch ?? fetch;
    const headers = {
      "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": context?.buildAcceptLanguage?.() ?? "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Cache-Control": "max-age=0",
    };
    const response = await doFetch(url, { headers });
    context?.sentinel?.(response, this.name);
    const html = await response.text();
    if (html.includes(CLOUDFLARE_CHALLENGE_MARKER)) {
      if (context?.engineError) {
        throw context.engineError("captcha", `${this.name} returned a Cloudflare challenge`, { engine: this.name });
      }
      throw new Error(
        "Ecosia returned a Cloudflare challenge page; server-side requests are often blocked. Try another engine or use Ecosia in your browser.",
      );
    }
    const $ = cheerio.load(html);
    const results = [];

    $(".result, article.result, [data-test-id='mainline-result-web']").each((_, el) => {
      const $el = $(el);
      const titleLink = _pickTitleLink($, $el);
      const href = titleLink.attr("href") ?? "";
      const title = titleLink.text().trim();
      const snippetEl = $el
        .find(".result-snippet, .result-description, [data-test-id='result-snippet']")
        .first();
      const snippet = snippetEl.text().trim();

      if (title && href && href.startsWith("http")) {
        try {
          const parsed = new URL(href);
          if (parsed.hostname === "ecosia.org" || parsed.hostname.endsWith(".ecosia.org")) return;
        } catch {
          //
        }
        results.push({
          title,
          url: href,
          snippet: snippet || "",
          source: this.name,
        });
      }
    });

    return results;
  }
}
