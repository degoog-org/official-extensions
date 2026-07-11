import { createThumbCache } from "./thumb-cache.js";

const thumb = createThumbCache();

let rommUrl = "";
let username = "";
let password = "";
let template = "";
let resultItemTpl = "";

const ROMM_LOGO =
  "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@refs/heads/main/svg/romm.svg";

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const _renderMain = (data) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] ?? "");

const _thumbnailBlock = (src) => {
  const u = escHtml(src);
  if (!u) return "";
  return `<div class="result-thumbnail-wrap degoog-result--thumb"><img class="result-thumbnail-img" src="${u}" alt="" loading="lazy" onerror="this.parentElement.style.display = 'none'" /></div>`;
};

function searchVariants(term) {
  const variants = [term];
  if (term.includes("-")) variants.push(term.replace(/-/g, " "));
  else if (/\w\s+\w/.test(term)) variants.push(term.replace(/\s+/g, "-"));
  if (term.includes(".")) variants.push(term.replace(/\./g, " "));
  if (term.includes("'")) variants.push(term.replace(/'/g, ""));
  return [...new Set(variants)];
}

function _basicAuthValue(user, pass) {
  const raw = `${user}:${pass}`;
  const encoded =
    typeof Buffer !== "undefined"
      ? Buffer.from(raw, "utf8").toString("base64")
      : btoa(raw);
  return `Basic ${encoded}`;
}

function _authHeaders() {
  if (!username || !password) return {};
  return { Authorization: _basicAuthValue(username, password) };
}

function _coverHeaders(coverUrl) {
  if (!coverUrl) return {};
  try {
    const coverHost = new URL(coverUrl).hostname;
    const rommHost = new URL(rommUrl).hostname;
    if (coverHost === rommHost) return _authHeaders();
  } catch { }
  return {};
}

function buildSnippet(item) {
  const parts = [];
  const platform = item.platform_display_name || item.platform_slug || "";
  if (platform) parts.push(platform);
  const regions = item.regions;
  if (regions?.length) parts.push(regions.join(", "));
  const summary = String(item.summary || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
  if (summary) parts.push(summary);
  else {
    const fsName = String(item.fs_name || "").trim();
    if (fsName) parts.push(fsName);
  }
  return parts.join(" — ");
}

function _coverUrl(item) {
  const pathCover = item.path_cover_small || item.path_cover_large;
  if (pathCover) {
    const path = pathCover.startsWith("/") ? pathCover : `/${pathCover}`;
    return `${rommUrl}${path}`;
  }
  const external = item.url_cover;
  return external?.trim() ? external.trim() : "";
}

async function _itemThumbSrc(item, fetchFn) {
  const cover = _coverUrl(item);
  if (!cover) return "";
  return thumb.store(fetchFn, cover, _coverHeaders(cover));
}

async function _renderCards(items, startIndex, fetchFn) {
  const cards = await Promise.all(
    items.map(async (item, i) => {
      const thumbSrc = await _itemThumbSrc(item, fetchFn);
      return renderCard(item, startIndex + i, thumbSrc);
    }),
  );
  return cards.join("");
}

function renderCard(item, index, thumbSrc) {
  const name = item.name || item.fs_name_no_tags || item.fs_name || "Unknown";
  const platform = item.platform_display_name || item.platform_slug || "ROM";
  const badgeParts = [platform, "RomM"];
  const sources = badgeParts
    .filter(Boolean)
    .map(
      (t) =>
        `<span class="result-engine-tag degoog-badge degoog-badge--engine-tag">${escHtml(t)}</span>`,
    )
    .join("");

  let host = "";
  try {
    host = new URL(rommUrl).hostname;
  } catch {
    host = "";
  }
  const cite = host ? `${host} · ${platform}` : rommUrl;
  const romId = item.id ?? item.slug ?? "";

  const data = {
    index: String(index),
    thumbnail_block: thumbSrc ? _thumbnailBlock(thumbSrc) : "",
    favicon_url: escHtml(ROMM_LOGO),
    favicon_host: escHtml(host),
    cite_url: escHtml(cite),
    url: escHtml(`${rommUrl}/rom/${romId}`),
    link_target: "_blank",
    link_rel: "noopener noreferrer",
    title: escHtml(String(name)),
    snippet: escHtml(buildSnippet(item)),
    sources,
  };
  return resultItemTpl.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");
}

export default {
  isClientExposed: false,
  name: "RomM",
  description: "Search your RomM game library",
  trigger: "romm",
  aliases: ["rom"],
  settingsSchema: [
    {
      key: "url",
      label: "RomM URL",
      type: "url",
      required: true,
      placeholder: "https://your-romm-server.com",
      description: "Base URL of your RomM instance",
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "RomM login username",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      secret: true,
      required: true,
      placeholder: "RomM login password",
    },
  ],

  routes: [thumb.route],

  async init(ctx) {
    thumb.useApiBase(ctx.apiBase);
    template = ctx.template;
    resultItemTpl = await ctx.readFile("result.html");
  },

  configure(settings) {
    rommUrl = (settings.url || "").replace(/\/+$/, "");
    username = settings.username || "";
    password = settings.password || "";
  },

  async isConfigured() {
    return !!rommUrl && !!username && !!password;
  },

  async execute(args, context) {
    const fetchFn = context?.fetch || fetch;
    if (!rommUrl || !username || !password) {
      return {
        title: "RomM Search",
        html: `<div class="command-result"><p>RomM is not configured. Go to <a href="/settings">Settings → Plugins</a> and set your RomM URL, username, and password.</p></div>`,
      };
    }

    if (!args.trim()) {
      return {
        title: "RomM Search",
        html: `<div class="command-result"><p>Usage: <code>!romm &lt;search term&gt;</code></p></div>`,
      };
    }

    try {
      const term = args.trim();
      const page = context?.page ?? 1;
      const perPage = 25;
      const offset = (page - 1) * perPage;
      const authHeaders = _authHeaders();

      const variants = searchVariants(term);
      const seen = new Set();
      const allItems = [];
      let totalRecordCount = 0;

      for (const v of variants) {
        const res = await fetchFn(
          `${rommUrl}/api/roms?search_term=${encodeURIComponent(v)}&limit=${perPage}&offset=${offset}`,
          { headers: authHeaders },
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (data.total > totalRecordCount) totalRecordCount = data.total;
        for (const item of data.items || []) {
          const id = String(item.id ?? "");
          if (id && !seen.has(id)) {
            seen.add(id);
            allItems.push(item);
          }
        }
      }

      if (allItems.length === 0) {
        return {
          title: "RomM Search",
          html: `<div class="command-result"><p>No results found for "${escHtml(term)}"</p></div>`,
        };
      }

      const results = await _renderCards(allItems, offset, fetchFn);

      const totalHints = totalRecordCount || allItems.length;
      const totalPages = Math.ceil(totalHints / perPage);
      const pageInfo = totalPages > 1 ? ` — Page ${page} of ${totalPages}` : "";
      return {
        title: `RomM: ${term} — ${totalHints} results${pageInfo}`,
        html: _renderMain({ content: results }),
        totalPages,
      };
    } catch {
      return {
        title: "RomM Search",
        html: `<div class="command-result"><p>Failed to connect to RomM. Check your URL and credentials.</p></div>`,
      };
    }
  },
};
