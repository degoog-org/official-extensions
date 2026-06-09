import * as cheerio from "cheerio";

const CLOUDFLARE_CHALLENGE_MARKER = "Just a moment";
const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

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

    $(".result").each((_, el) => {
      const $el = $(el);
      const link = $el.find('a[href^="http"]').first();
      const href = link.attr("href") ?? "";
      const title = link.text().trim();
      const snippetEl = $el.find(".result-snippet, .result-description").first();
      const snippet = snippetEl.text().trim();

      if (title && href && href.startsWith("http")) {
        try {
          const parsed = new URL(href);
          if (parsed.hostname === "www.ecosia.org") return;
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
