import { createHash } from "node:crypto";

export const MAX_SOURCES = 6;

const hostname = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const buildSources = (results) =>
  results.slice(0, MAX_SOURCES).map((r, i) => ({
    index: i + 1,
    title: r.title || "",
    url: r.url,
    snippet: r.snippet || "",
    host: hostname(r.url),
  }));

export const buildUserPrompt = (query, sources) => {
  const block = sources
    .map((s) => `[${s.index}] ${s.title}${s.host ? ` (${s.host})` : ""}\n${s.snippet}`)
    .join("\n\n");
  return `Query: ${query.trim()}\n\nSearch results:\n${block}`;
};

export const summaryCacheKey = (query, results) => {
  const fp = results
    .slice(0, MAX_SOURCES)
    .map((r) => `${r.url}\n${r.snippet}`)
    .join("\n\n");
  const hash = createHash("sha256").update(fp).digest("hex").slice(0, 24);
  return `${query.trim().toLowerCase()}|${hash}`;
};

export const buildPanelHtml = (t, query, sources) => {
  const sourcesJson = JSON.stringify(
    sources.map((s) => ({ i: s.index, u: s.url, t: s.title, h: s.host, s: s.snippet })),
  );
  return (
    '<div class="glance-ai degoog-panel degoog-panel--slot degoog-panel--slot-body-padded degoog-vstack"' +
    ` data-stream="1" data-query="${escapeHtml(query)}"` +
    ` data-sources="${escapeHtml(sourcesJson)}">` +
    '<div class="glance-ai-summary-wrap">' +
    '<div class="glance-ai-body glance-ai-body--clamped">' +
    '<div class="glance-snippet glance-ai-stream degoog-text degoog-text--md" data-state="pending">' +
    '<div class="skeleton-glance glance-ai-skeleton" aria-hidden="true">' +
    '<div class="skeleton-line skeleton-line--snippet"></div>' +
    '<div class="skeleton-line skeleton-line--snippet"></div>' +
    '<div class="skeleton-line skeleton-line--snippet-short"></div>' +
    "</div>" +
    "</div>" +
    "</div>" +
    `<button class="glance-ai-expand" type="button">${t("ai-summary.read-more")}</button>` +
    "</div>" +
    '<div class="glance-ai-chat" hidden>' +
    '<div class="glance-ai-messages"></div>' +
    `<textarea class="glance-ai-input degoog-input degoog-input--chat" placeholder="${t("ai-summary.follow-up-placeholder")}" rows="1"></textarea>` +
    "</div>" +
    "</div>"
  );
};
