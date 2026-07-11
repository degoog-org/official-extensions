import { createThumbCache } from "./thumb-cache.js";

const thumb = createThumbCache();

let jellyfinUrl = "";
let apiKey = "";
let headerName = "X-Emby-Token";
let template = "";
let resultItemTpl = "";

const JELLYFIN_LOGO =
  "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@refs/heads/main/svg/jellyfin.svg";

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

const EPISODE_PATTERNS = [
  /^(.+?)\s+s(\d+)\s*e(\d+)$/i,
  /^(.+?)\s+season\s+(\d+)\s+episode\s+(\d+)$/i,
  /^(.+?)\s+season\s+(\d+)\s+ep\.?\s+(\d+)$/i,
  /^(.+?)\s+(\d+)x(\d+)$/i,
];

const SEASON_PATTERNS = [
  /^(.+?)\s+season\s+(\d+)$/i,
  /^(.+?)\s+s(\d+)$/i,
];

function parseEpisodeQuery(term) {
  for (const re of EPISODE_PATTERNS) {
    const m = term.match(re);
    if (m)
      return {
        series: m[1].trim(),
        season: parseInt(m[2], 10),
        episode: parseInt(m[3], 10),
      };
  }
  for (const re of SEASON_PATTERNS) {
    const m = term.match(re);
    if (m)
      return {
        series: m[1].trim(),
        season: parseInt(m[2], 10),
        episode: null,
      };
  }
  return null;
}

function buildSnippet(item) {
  const type = String(item["Type"] || "");
  const parts = [];
  if (type === "Episode") {
    const series = item["SeriesName"] || "";
    const sNum = item["ParentIndexNumber"];
    const eNum = item["IndexNumber"];
    const ep = [];
    if (series) ep.push(series);
    if (sNum != null && eNum != null)
      ep.push(`S${String(sNum).padStart(2, "0")}E${String(eNum).padStart(2, "0")}`);
    else if (eNum != null) ep.push(`Episode ${eNum}`);
    if (ep.length) parts.push(ep.join(" — "));
  } else if (type === "Season") {
    const series = item["SeriesName"] || "";
    if (series) parts.push(series);
  }
  const overview = String(item["Overview"] || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
  if (overview) parts.push(overview);
  return parts.join(" — ");
}

async function _itemThumbSrc(item, fetchFn, authHeaders) {
  const imageTags = item["ImageTags"];
  if (!imageTags?.["Primary"] || !item["Id"]) return "";
  return thumb.store(
    fetchFn,
    `${jellyfinUrl}/Items/${item["Id"]}/Images/Primary?maxHeight=120`,
    authHeaders,
  );
}

async function _renderCards(items, startIndex, fetchFn, authHeaders) {
  const cards = await Promise.all(
    items.map(async (item, i) => {
      const thumbSrc = await _itemThumbSrc(item, fetchFn, authHeaders);
      return renderCard(item, startIndex + i, thumbSrc);
    }),
  );
  return cards.join("");
}

function renderCard(item, index, thumbSrc) {
  const type = String(item["Type"] || "");
  const year = item["ProductionYear"] ? ` (${item["ProductionYear"]})` : "";

  const matchedPeople = item["MatchedPeople"];
  const badgeParts = [type, "Jellyfin"];
  if (matchedPeople?.length) badgeParts.push(matchedPeople.join(", "));
  const sources = badgeParts
    .filter(Boolean)
    .map(
      (t) =>
        `<span class="result-engine-tag degoog-badge degoog-badge--engine-tag">${escHtml(t)}</span>`,
    )
    .join("");

  let host = "";
  try {
    host = new URL(jellyfinUrl).hostname;
  } catch {
    host = "";
  }
  const cite = host ? `${host} · ${type}` : jellyfinUrl;

  const data = {
    index: String(index),
    thumbnail_block: thumbSrc ? _thumbnailBlock(thumbSrc) : "",
    favicon_url: escHtml(JELLYFIN_LOGO),
    favicon_host: escHtml(host),
    cite_url: escHtml(cite),
    url: escHtml(`${jellyfinUrl}/web/index.html#!/details?id=${item["Id"]}`),
    link_target: "_blank",
    link_rel: "noopener noreferrer",
    title: escHtml(String(item["Name"] || "")) + year,
    snippet: escHtml(buildSnippet(item)),
    sources,
  };
  return resultItemTpl.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");
}

async function findEpisode(epQuery, authHeaders, itemFields, limit, startIndex, fetchFn = fetch) {
  const seriesVariants = searchVariants(epQuery.series);
  const seriesFetches = seriesVariants.map((v) =>
    fetchFn(
      `${jellyfinUrl}/Items?SearchTerm=${encodeURIComponent(v)}&Recursive=true&Limit=10&Fields=ImageTags&IncludeItemTypes=Series`,
      { headers: authHeaders },
    ).then((r) => r.json()),
  );
  const seriesResults = await Promise.all(seriesFetches);
  const seen = new Set();
  const allSeries = [];
  for (const data of seriesResults) {
    for (const s of data.Items || []) {
      if (!seen.has(s.Id)) {
        seen.add(s.Id);
        allSeries.push(s);
      }
    }
  }
  if (allSeries.length === 0) return [];

  const episodeFetches = allSeries.map((s) => {
    let url = `${jellyfinUrl}/Shows/${s.Id}/Episodes?Fields=${itemFields}&Limit=${limit}&StartIndex=${startIndex}`;
    if (epQuery.season != null) url += `&Season=${epQuery.season}`;
    return fetchFn(url, { headers: authHeaders }).then((r) => r.json());
  });
  const episodeResults = await Promise.all(episodeFetches);

  const items = [];
  for (const data of episodeResults) {
    for (const ep of data.Items || []) {
      if (epQuery.episode != null) {
        if (ep.IndexNumber === epQuery.episode) items.push(ep);
      } else {
        items.push(ep);
      }
    }
  }
  return items;
}

export default {
  isClientExposed: false,
  name: "Jellyfin",
  description: "Search your Jellyfin media library",
  trigger: "jellyfin",
  aliases: ["jf"],
  settingsSchema: [
    {
      key: "url",
      label: "Jellyfin URL",
      type: "url",
      required: true,
      placeholder: "https://your-jellyfin-server.com",
      description: "Base URL of your Jellyfin server",
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      secret: true,
      required: true,
      placeholder: "Enter your Jellyfin API key",
      description: "Found in Jellyfin Dashboard → API Keys",
    },
    {
      key: "headerName",
      label: "Auth Header",
      type: "text",
      default: "X-Emby-Token",
      placeholder: "X-Emby-Token",
      description:
        "HTTP header for Jellyfin API requests. Change only if your server requires a different header.",
    },
  ],

  routes: [thumb.route],

  async init(ctx) {
    thumb.useApiBase(ctx.apiBase);
    template = ctx.template;
    resultItemTpl = await ctx.readFile("result.html");
  },

  configure(settings) {
    jellyfinUrl = settings.url || "";
    apiKey = settings.apiKey || "";
    headerName = settings.headerName || "X-Emby-Token";
  },

  async isConfigured() {
    return !!jellyfinUrl;
  },

  async execute(args, context) {
    const fetchFn = context?.fetch || fetch;
    if (!jellyfinUrl || !apiKey) {
      return {
        title: "Jellyfin Search",
        html: `<div class="command-result"><p>Jellyfin is not configured. Go to <a href="/settings">Settings → Plugins</a> to set up your Jellyfin URL and API key.</p></div>`,
      };
    }

    if (!args.trim()) {
      return {
        title: "Jellyfin Search",
        html: `<div class="command-result"><p>Usage: <code>!jellyfin &lt;search term&gt;</code></p></div>`,
      };
    }

    try {
      const term = args.trim();
      const page = context?.page ?? 1;
      const perPage = 25;
      const startIndex = (page - 1) * perPage;

      const authHeaders = { [headerName]: apiKey };
      const itemFields =
        "Overview,People,SeriesName,SeasonName,IndexNumber,ParentIndexNumber,ImageTags,ProductionYear";
      const itemTypes =
        "Movie,Series,Episode,Audio,MusicAlbum,MusicArtist,Season";

      const epQuery = parseEpisodeQuery(term);
      if (epQuery) {
        const epResults = await findEpisode(epQuery, authHeaders, itemFields, perPage, startIndex, fetchFn);
        if (epResults.length > 0) {
          const results = await _renderCards(
            epResults,
            startIndex,
            fetchFn,
            authHeaders,
          );
          return {
            title: `Jellyfin: ${term} — ${epResults.length} results`,
            html: _renderMain({ content: results }),
          };
        }
      }

      const variants = searchVariants(term);
      const fetches = [];
      for (const v of variants) {
        const enc = encodeURIComponent(v);
        fetches.push(
          fetchFn(
            `${jellyfinUrl}/Items?SearchTerm=${enc}&Recursive=true&Limit=${perPage}&StartIndex=${startIndex}&Fields=${itemFields}&IncludeItemTypes=${itemTypes}`,
            { headers: authHeaders },
          ).then((r) => r.json()),
        );
        fetches.push(
          fetchFn(
            `${jellyfinUrl}/Search/Hints?searchTerm=${enc}&Limit=${perPage}&StartIndex=${startIndex}&IncludeItemTypes=${itemTypes}`,
            { headers: authHeaders },
          ).then((r) => r.json()),
        );
      }
      fetches.push(
        fetchFn(
          `${jellyfinUrl}/Persons?searchTerm=${encodeURIComponent(term)}&Limit=5&Fields=Overview,PrimaryImageAspectRatio`,
          { headers: authHeaders },
        ).then((r) => r.json()),
      );

      const responses = await Promise.all(fetches);
      const peopleData = responses.pop();
      const itemsResults = [];
      const hintsResults = [];
      for (let i = 0; i < responses.length; i++) {
        if (i % 2 === 0) itemsResults.push(responses[i]);
        else hintsResults.push(responses[i]);
      }

      const people = peopleData.Items || [];
      const personIds = people.map((p) => p["Id"]);

      let personItems = [];
      if (personIds.length > 0) {
        const personItemsRes = await fetchFn(
          `${jellyfinUrl}/Items?PersonIds=${personIds.join(",")}&Recursive=true&Limit=30&Fields=${itemFields}&IncludeItemTypes=Movie,Series`,
          { headers: authHeaders },
        );
        const personItemsData = await personItemsRes.json();
        personItems = personItemsData.Items || [];
      }

      const seen = new Set();
      const allItems = [];
      let totalRecordCount = 0;

      for (const data of itemsResults) {
        if (data.TotalRecordCount > totalRecordCount)
          totalRecordCount = data.TotalRecordCount;
        for (const item of data.Items || []) {
          const id = String(item["Id"] || "");
          if (id && !seen.has(id)) {
            seen.add(id);
            allItems.push({ ...item, MatchedFrom: "search" });
          }
        }
      }

      for (const data of hintsResults) {
        for (const hint of data.SearchHints || []) {
          const id = String(hint["ItemId"] || "");
          if (id && !seen.has(id)) {
            seen.add(id);
            allItems.push({
              Id: id,
              Name: hint["Name"],
              Type: hint["Type"],
              ProductionYear: hint["ProductionYear"],
              Overview: hint["Overview"] || "",
              SeriesName: hint["Series"] || "",
              ImageTags: hint["PrimaryImageTag"]
                ? { Primary: hint["PrimaryImageTag"] }
                : {},
              MatchedFrom: "search",
            });
          }
        }
      }

      for (const item of personItems) {
        const id = String(item["Id"] || "");
        if (id && !seen.has(id)) {
          seen.add(id);
          const itemPeople = item["People"] || [];
          const termLower = term.toLowerCase();
          const matchedPeople = itemPeople
            .filter((p) =>
              String(p["Name"] || "")
                .toLowerCase()
                .includes(termLower),
            )
            .map(
              (p) =>
                `${String(p["Name"])} (${String(p["Type"] || p["Role"] || "Cast")})`,
            )
            .slice(0, 3);
          allItems.push({
            ...item,
            MatchedFrom: "person",
            MatchedPeople: matchedPeople,
          });
        }
      }

      if (allItems.length === 0) {
        return {
          title: "Jellyfin Search",
          html: `<div class="command-result"><p>No results found for "${escHtml(term)}"</p></div>`,
        };
      }

      const results = await _renderCards(
        allItems,
        startIndex,
        fetchFn,
        authHeaders,
      );

      const totalHints = totalRecordCount || allItems.length;
      const totalPages = Math.ceil(totalHints / perPage);
      const pageInfo = totalPages > 1 ? ` — Page ${page} of ${totalPages}` : "";
      return {
        title: `Jellyfin: ${term} — ${totalHints} results${pageInfo}`,
        html: _renderMain({ content: results }),
        totalPages,
      };
    } catch {
      return {
        title: "Jellyfin Search",
        html: `<div class="command-result"><p>Failed to connect to Jellyfin. Check your configuration.</p></div>`,
      };
    }
  },
};
