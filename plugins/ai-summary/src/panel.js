import { createHash } from "node:crypto";

export const MAX_SOURCES = 6;

const STACK_LIMIT = 3;

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

const iconHtml = (host, cls, size) =>
  host
    ? `<img class="${cls}" data-favicon-host="${escapeHtml(host)}" alt="" width="${size}" height="${size}" loading="lazy">`
    : "";

const stackHtml = (sources) =>
  sources
    .filter((s) => s.host)
    .slice(0, STACK_LIMIT)
    .map((s) => iconHtml(s.host, "glance-ai-stack-icon", 18))
    .join("");

const railCard = (s) =>
  `<a class="glance-ai-rail-card" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">` +
  '<span class="glance-ai-rail-head">' +
  iconHtml(s.host, "glance-ai-rail-icon", 14) +
  `<span class="glance-ai-rail-host">${escapeHtml(s.host || s.url)}</span>` +
  "</span>" +
  `<span class="glance-ai-rail-title">${escapeHtml(s.title || s.host || s.url)}</span>` +
  "</a>";

const countLabel = (t, n) =>
  n === 1 ? t("ai-summary.site", { n }) : t("ai-summary.sites", { n });

const titleHtml = (t) =>
  '<div class="glance-ai-title">' +
  '<i class="fa-solid fa-robot" aria-hidden="true"></i>' +
  `<span>${escapeHtml(t("ai-summary.badge"))}</span>` +
  "</div>";

export const sourcesHtml = (t, sources) => {
  const title = titleHtml(t);
  if (!sources.length) return `<div class="glance-ai-head">${title}</div>`;
  return (
    '<div class="glance-ai-head">' +
    title +
    '<button class="glance-ai-sources-toggle" type="button" aria-expanded="false">' +
    `<span class="glance-ai-stack">${stackHtml(sources)}</span>` +
    `<span class="glance-ai-sources-label">${escapeHtml(countLabel(t, sources.length))}</span>` +
    "</button>" +
    "</div>" +
    '<div class="glance-ai-rail" hidden>' +
    sources.map(railCard).join("") +
    "</div>"
  );
};

export const buildPanelHtml = (t, query, sources, hideOnError, enableInputStyling) => {
  const sourcesJson = JSON.stringify(
    sources.map((s) => ({ i: s.index, u: s.url, t: s.title, h: s.host, s: s.snippet })),
  );
  const inputWrapClass = enableInputStyling
    ? "glance-ai-input-wrap glance-ai-input-wrap--styled"
    : "glance-ai-input-wrap";
  return (
    '<div class="glance-ai degoog-panel degoog-panel--slot degoog-panel--slot-body-padded degoog-vstack"' +
    ` data-stream="1" data-query="${escapeHtml(query)}"` +
    ` data-hide-on-error="${hideOnError ? "1" : "0"}"` +
    ` data-sources="${escapeHtml(sourcesJson)}">` +
    sourcesHtml(t, sources) +
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
    '<button class="glance-ai-expand" type="button">{{ t:ai-summary.read-more }}</button>' +
    "</div>" +
    '<div class="glance-ai-chat" hidden>' +
    '<div class="glance-ai-messages"></div>' +
    '<textarea class="glance-ai-input degoog-input degoog-input--chat" placeholder="${t("ai-summary.follow-up-placeholder")}" rows="1"></textarea>' +
    "</div>" +
    "</div>" +
    `<button class="glance-ai-collapse" type="button" hidden>${t("ai-summary.show-less")}</button>` +
    "</div>"
  );
};
