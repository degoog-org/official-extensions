let meiliUrl = "";
let apiKey = "";
let indexes = [];
let titleField = "title";
let urlField = "url";
let contentField = "content";
let thumbnailField = "thumbnail";
let template = "";
let resultItemTpl = "";

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PER_PAGE = 20;
const MEILISEARCH_LOGO =
  "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@refs/heads/main/svg/meilisearch.svg";

const _renderMain = (data) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] ?? "");

const _renderItem = (tpl, data) =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] ?? "");

const _thumbnailBlock = (url) => {
  const u = escHtml(url);
  if (!u) return "";
  return `<div class="result-thumbnail-wrap degoog-result--thumb"><img class="result-thumbnail-img" src="${u}" alt="" loading="lazy" onerror="this.parentElement.style.display = 'none'" /></div>`;
};

const _sourcesFromTags = (tags) =>
  tags
    .filter((t) => t && String(t).trim())
    .map(
      (t) =>
        `<span class="result-engine-tag degoog-badge degoog-badge--engine-tag">${escHtml(String(t).trim())}</span>`,
    )
    .join("");

const _citeFromUrl = (url) => {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.hostname}${path}`;
  } catch {
    return String(url).slice(0, 120);
  }
};

const _meiliHostname = () => {
  try {
    return new URL(meiliUrl).hostname;
  } catch {
    return "";
  }
};

async function searchIndex(meiliUrlVal, apiKeyVal, index, query, offset, fetchFn = fetch) {
  const headers = { "Content-Type": "application/json" };
  if (apiKeyVal) headers["Authorization"] = `Bearer ${apiKeyVal}`;
  const cropFields = [contentField, "description", "summary", "body", "text"];
  const res = await fetchFn(`${meiliUrlVal}/indexes/${index}/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      q: query,
      limit: PER_PAGE,
      offset,
      attributesToCrop: cropFields,
      cropLength: 200,
      attributesToHighlight: [contentField, titleField],
    }),
  });
  const data = await res.json();
  return {
    index,
    hits: data.hits || [],
    formatted: data.hits?.map((h) => h._formatted) || [],
    estimatedTotalHits: data.estimatedTotalHits ?? (data.hits?.length || 0),
  };
}

export default {
  name: "Meilisearch",
  description: "Search across your Meilisearch indexes",
  trigger: "meili",
  aliases: ["ms"],
  settingsSchema: [
    {
      key: "url",
      label: "Meilisearch URL",
      type: "url",
      required: true,
      placeholder: "http://localhost:7700",
      description: "Base URL of your Meilisearch instance",
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      secret: true,
      placeholder: "Leave blank if no key is set",
      description: "Optional master or search API key",
    },
    {
      key: "indexes",
      label: "Indexes",
      type: "text",
      required: true,
      placeholder: "my_index,another_index",
      description: "Comma-separated list of indexes to search",
    },
    {
      key: "titleField",
      label: "Title Field",
      type: "text",
      placeholder: "title",
      description: "Document field to use as the result title",
    },
    {
      key: "urlField",
      label: "URL Field",
      type: "text",
      placeholder: "url",
      description: "Document field to use as the result link",
    },
    {
      key: "contentField",
      label: "Content Field",
      type: "text",
      placeholder: "content",
      description: "Document field to use as the result snippet",
    },
    {
      key: "thumbnailField",
      label: "Thumbnail Field",
      type: "text",
      placeholder: "thumbnail",
      description: "Document field for the result thumbnail image (optional)",
    },
  ],

  async init(ctx) {
    template = ctx.template;
    resultItemTpl = await ctx.readFile("result.html");
  },

  configure(settings) {
    meiliUrl = settings.url || "";
    apiKey = settings.apiKey || "";
    indexes = (settings.indexes || "")
      .split(",")
      .map((s) => String(s).trim())
      .filter(Boolean);
    titleField = settings.titleField || "title";
    urlField = settings.urlField || "url";
    contentField = settings.contentField || "content";
    thumbnailField = settings.thumbnailField || "thumbnail";
  },

  async isConfigured() {
    return !!(meiliUrl && indexes.length > 0);
  },

  async execute(args, context) {
    const fetchFn = context?.fetch || fetch;
    if (!meiliUrl || indexes.length === 0) {
      return {
        title: "Meilisearch",
        html: `<div class="command-result"><p>Meilisearch is not configured. Go to <a href="/settings">Settings → Plugins</a> to set up your Meilisearch URL and indexes.</p></div>`,
      };
    }

    if (!args.trim()) {
      return {
        title: "Meilisearch",
        html: `<div class="command-result"><p>Usage: <code>!meili &lt;search term&gt;</code></p><p>Indexes: ${indexes.map((i) => `<code>${escHtml(i)}</code>`).join(", ")}</p></div>`,
      };
    }

    try {
      const term = args.trim();
      const page = context?.page ?? 1;
      const offset = (page - 1) * PER_PAGE;

      const settled = await Promise.allSettled(
        indexes.map((idx) => searchIndex(meiliUrl, apiKey, idx, term, offset, fetchFn)),
      );

      const allHits = [];
      let totalEstimated = 0;
      for (const result of settled) {
        if (result.status === "fulfilled") {
          totalEstimated += result.value.estimatedTotalHits;
          for (let i = 0; i < result.value.hits.length; i++) {
            allHits.push({
              hit: result.value.hits[i],
              formatted: result.value.formatted[i],
              index: result.value.index,
            });
          }
        }
      }

      if (allHits.length === 0) {
        return {
          title: "Meilisearch",
          html: `<div class="command-result"><p>No results found for "${escHtml(term)}"</p></div>`,
        };
      }

      const host = _meiliHostname();
      let rowIndex = offset;
      const chunks = [];

      for (const { hit, formatted, index } of allHits) {
        const title = String(hit[titleField] || "");
        const url = String(hit[urlField] || "");
        const fmt = formatted || {};
        const content = String(
          fmt[contentField] ||
            fmt["description"] ||
            fmt["summary"] ||
            fmt["body"] ||
            fmt["text"] ||
            hit[contentField] ||
            hit["description"] ||
            hit["summary"] ||
            hit["body"] ||
            hit["text"] ||
            hit["metadata_summary"] ||
            "",
        );
        const rawThumb = String(hit[thumbnailField] || "").trim();
        const thumbUrl =
          rawThumb && context?.signProxyUrl
            ? context.signProxyUrl(rawThumb)
            : rawThumb;
        const source = String(hit["source"] || "");
        const type = String(hit["type"] || "");

        if (!title || !url) continue;

        const indexLabel = index.replace(/_content$/, "");
        const sources = _sourcesFromTags(
          [indexLabel, type, source].filter((x) => x && String(x).trim()),
        );

        const citeDisp = _citeFromUrl(url) || host;

        chunks.push(
          _renderItem(resultItemTpl, {
            index: String(rowIndex++),
            thumbnail_block: _thumbnailBlock(thumbUrl),
            favicon_url: escHtml(MEILISEARCH_LOGO),
            favicon_host: escHtml(host),
            cite_url: escHtml(citeDisp),
            url: escHtml(url),
            link_target: "_blank",
            link_rel: "noopener noreferrer",
            title: escHtml(title),
            snippet: escHtml(content.slice(0, 300)),
            sources,
          }),
        );
      }

      if (chunks.length === 0) {
        return {
          title: "Meilisearch",
          html: `<div class="command-result"><p>No results found for "${escHtml(term)}"</p></div>`,
        };
      }

      const totalPages = Math.ceil(totalEstimated / PER_PAGE);
      const pageInfo = totalPages > 1 ? ` — Page ${page} of ${totalPages}` : "";
      return {
        title: `Meilisearch: ${term} — ${totalEstimated} results${pageInfo}`,
        html: _renderMain({ content: chunks.join("") }),
        totalPages,
      };
    } catch {
      return {
        title: "Meilisearch",
        html: `<div class="command-result"><p>Failed to connect to Meilisearch. Check your configuration.</p></div>`,
      };
    }
  },
};
