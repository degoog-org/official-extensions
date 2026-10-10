import {
  DURATION_RE,
  GOTO_ORIGIN,
  GOTO_PREFIX,
  MUTANT_SIGNATURES,
  SORRY_SIGNATURES,
} from "./const/serp.js";

const _resolveHref = (href) => {
  if (!href.startsWith("/url?")) return href;
  try {
    const parsed = new URL(href, "https://www.google.com");
    return parsed.searchParams.get("q") || parsed.searchParams.get("url") || href;
  } catch {
    return href;
  }
};

export const ytThumbnail = (href) => {
  const match = href.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
  return match ? `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg` : "";
};

const _durationFromScope = ($, $scope) => {
  let found = "";
  $scope.find("span").each((_, node) => {
    if (found) return;
    const t = $(node).text().trim();
    if (DURATION_RE.test(t)) found = t;
  });
  return found;
};

const HEAD_BYTES = 4000;

export const isInterstitial = (html) => {
  const head = html.slice(0, HEAD_BYTES);
  return MUTANT_SIGNATURES.some((m) => head.includes(m));
};

export const isSorryPage = (html) => {
  const head = html.slice(0, HEAD_BYTES);
  return SORRY_SIGNATURES.some((m) => head.includes(m));
};

export const isExternal = (url) => url.startsWith("http") && !url.includes("google.com");

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
    results.push({
      title,
      url,
      snippet,
      source: name,
      thumbnail: goto ? "" : ytThumbnail(url),
      duration: block.length ? _durationFromScope($, block) : "",
    });
  });
  return results;
};

export const parseLite = ($, name) => {
  const results = [];
  const seen = new Set();

  const pushVideo = (title, href, snippet, $scope) => {
    const url = _resolveHref(href);
    if (!title || !url || !url.startsWith("http") || url.includes("google.com/search") || seen.has(url)) return;
    seen.add(url);
    results.push({
      title,
      url,
      snippet,
      source: name,
      thumbnail: ytThumbnail(url),
      duration: $scope?.length ? _durationFromScope($, $scope) : "",
    });
  };

  $('a[href^="/url?q="]').each((_, el) => {
    const linkEl = $(el);
    const title =
      linkEl.find("h3").first().text().trim() ||
      linkEl.find("span").first().text().trim();
    const href = linkEl.attr("href") || "";
    const snippet = linkEl.parent().next("div").text().trim();
    const block = linkEl.closest("[data-hveid]");
    pushVideo(title, href, snippet, block.length ? block : linkEl.parent());
  });

  if (results.length === 0) {
    $("[data-hveid] a[href]").each((_, el) => {
      const linkEl = $(el);
      const block = linkEl.closest("[data-hveid]");
      const title =
        linkEl.find("h3").first().text().trim() ||
        block.find("[role='link']").first().text().trim();
      const href = linkEl.attr("href") || "";
      const snippet = block.find("[data-sncf]").first().text().trim();
      pushVideo(title, href, snippet, block);
    });
  }

  return results;
};
