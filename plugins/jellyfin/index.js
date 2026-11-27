let jellyfinUrl = "";
let apiKey = "";
let headerName = "X-Emby-Token";
let authMethod = "auto";

const AUTH_METHODS = ["auto", "modern", "legacy"];
const JELLYFIN_SITE = "https://jellyfin.org";

const _authHeaders = () => {
  const modern = { Authorization: `MediaBrowser Token="${apiKey}"` };
  const legacy = { [headerName]: apiKey };
  if (authMethod === "modern") return modern;
  if (authMethod === "legacy") return legacy;
  return { ...legacy, ...modern };
};
let searchType = "web";
let _signFaviconUrl = null;
let thumbHeight = 400;
let previewHeight = 1600;
let _searchTypes = null;

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
    else if (eNum != null) ep.push(_tr("messages.episode", "Episode {n}", { n: eNum }));
    if (ep.length) parts.push(ep.join(" · "));
  } else if (type === "Season") {
    const series = item["SeriesName"] || "";
    if (series) parts.push(series);
  }
  const overview = String(item["Overview"] || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
  if (overview) parts.push(overview);
  return parts.join(" · ");
}

const _height = (value, fallback) => {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n >= 50 && n <= 4000 ? n : fallback;
};

const _imageUrl = (item, height) => {
  const own = item["ImageTags"]?.["Primary"];
  const tag = own || item["SeriesPrimaryImageTag"];
  const owner = own ? item["Id"] : item["SeriesId"];
  if (!tag || !owner) return undefined;
  const id = encodeURIComponent(String(owner));
  return `${jellyfinUrl}/Items/${id}/Images/Primary?maxHeight=${height}&quality=90&tag=${encodeURIComponent(String(tag))}`;
};

const _normTitle = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

const _exactFirst = (items, term) => {
  const want = _normTitle(term);
  const exact = items.filter((item) => _normTitle(item["Name"]) === want);
  return exact.length ? [...exact, ...items.filter((item) => !exact.includes(item))] : items;
};

const _withSeasons = async (items, fetchFn, authHeaders, itemFields) => {
  const present = new Set(items.map((item) => String(item["Id"] || "")));
  const seasons = await Promise.all(
    items.map((item) =>
      item["Type"] === "Series" && item["Id"]
        ? fetchFn(
            `${jellyfinUrl}/Shows/${encodeURIComponent(String(item["Id"]))}/Seasons?Fields=${itemFields}`,
            { headers: authHeaders },
          )
            .then((r) => (r.ok ? r.json() : { Items: [] }))
            .then((data) => (data.Items || []).filter((s) => s["Id"] && !present.has(String(s["Id"]))))
            .catch(() => [])
        : [],
    ),
  );
  return items.flatMap((item, i) => [item, ...seasons[i]]);
};

const _toResult = (item) => {
  const year = item["ProductionYear"] ? ` (${item["ProductionYear"]})` : "";
  const people = item["MatchedPeople"]?.length
    ? _tr("messages.with", "With {people}", { people: item["MatchedPeople"].join(", ") })
    : "";
  const name =
    item["Type"] === "Season" && item["SeriesName"]
      ? `${item["SeriesName"]}: ${item["Name"] || ""}`
      : String(item["Name"] || "");
  return {
    title: `${name}${year}`,
    url: `${jellyfinUrl}/web/index.html#!/details?id=${encodeURIComponent(String(item["Id"]))}`,
    snippet: [String(item["Type"] || ""), people, buildSnippet(item)].filter(Boolean).join(" · "),
    source: "Jellyfin",
    favicon: _signFaviconUrl?.(JELLYFIN_SITE) || undefined,
    thumbnail: _imageUrl(item, thumbHeight),
    imageUrl: _imageUrl(item, previewHeight),
  };
};

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

const ID = "jellyfin-command";
const AUTH_LABELS = {"auto": "Automatic, sends both", "modern": "Modern only, Authorization header", "legacy": "Legacy only, the header below"};

const _tr = (key, fallback, vars = {}) => {
  const value = jellyfin.t?.(`${ID}.${key}`, vars);
  if (typeof value === "string" && value !== `${ID}.${key}`) return value;
  return fallback.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
};

const _schema = () => [
  {
    key: "url",
    label: "Jellyfin URL",
    type: "url",
    required: true,
    placeholder: "https://your-jellyfin-server.com",
    description: "The base URL of your Jellyfin server.",
  },
  {
    key: "apiKey",
    label: "API key",
    type: "password",
    secret: true,
    required: true,
    placeholder: "Your Jellyfin API key",
    description: "Create one in Jellyfin under Dashboard > API Keys.",
  },
  {
    key: "authMethod",
    label: "Auth method",
    type: "select",
    default: "auto",
    options: AUTH_METHODS,
    optionLabels: AUTH_METHODS.map((m) => _tr(`options.authMethod.${m}`, AUTH_LABELS[m])),
    description:
      "Newer Jellyfin servers only accept the Authorization header. Automatic sends both, so it works with old and new servers.",
  },
  {
    key: "headerName",
    label: "Legacy auth header",
    type: "text",
    default: "X-Emby-Token",
    placeholder: "X-Emby-Token",
    advanced: true,
    description:
      "The header the legacy method sends. Only change it if your server expects a different one.",
    visibleWhen: { key: "authMethod", equals: ["auto", "legacy"] },
  },
  {
    key: "thumbHeight",
    label: "Thumbnail height in pixels",
    type: "number",
    min: "50",
    max: "4000",
    default: "400",
    advanced: true,
    description: "Jellyfin resizes result thumbnails to this height.",
  },
  {
    key: "previewHeight",
    label: "Preview image height in pixels",
    type: "number",
    min: "50",
    max: "4000",
    default: "1600",
    advanced: true,
    description: "Jellyfin resizes the image in the preview panel to this height.",
  },
  {
    key: "searchType",
    label: "Show results on",
    type: "select",
    default: "web",
    options: ["web"],
    optionsFrom: { dependsOn: [], refreshLabel: _tr("options.loadTabs", "Load tabs"), auto: true },
    description: "The results tab !jellyfin opens on.",
  },
];

const jellyfin = {
  isClientExposed: false,
  name: "Jellyfin",
  description: "Search your Jellyfin media library.",
  trigger: "jellyfin",
  aliases: ["jf"],
  get settingsSchema() {
    return _schema();
  },

  async init(ctx) {
    if (typeof ctx.searchTypes === "function") _searchTypes = ctx.searchTypes;
    if (typeof ctx.signFaviconUrl === "function") _signFaviconUrl = ctx.signFaviconUrl;
  },

  configure(settings) {
    jellyfinUrl = settings.url || "";
    apiKey = settings.apiKey || "";
    headerName = settings.headerName || "X-Emby-Token";
    authMethod = AUTH_METHODS.includes(settings.authMethod) ? settings.authMethod : "auto";
    searchType = typeof settings.searchType === "string" && settings.searchType ? settings.searchType : "web";
    thumbHeight = _height(settings.thumbHeight, 400);
    previewHeight = _height(settings.previewHeight, 1600);
  },

  async getFieldOptions(key) {
    if (key !== "searchType") return { options: [] };
    const types = _searchTypes ? await _searchTypes() : ["web"];
    return {
      options: types.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })),
      notice: _tr("notices.tabs", "{count} tabs on this instance", { count: types.length }),
    };
  },

  async isConfigured() {
    return !!jellyfinUrl;
  },

  async execute(args, context) {
    const result = await jellyfin.run(args, context);
    return searchType && searchType !== "web" ? { ...result, searchType } : result;
  },

  async run(args, context) {
    const fetchFn = context?.fetch || fetch;
    if (!jellyfinUrl || !apiKey) {
      return {
        title: _tr("messages.title", "Jellyfin"),
        html: `<div class="command-result"><p>{{ t:${ID}.messages.notConfigured }} <a href="/settings">{{ t:${ID}.messages.settingsLink }}</a>.</p></div>`,
      };
    }

    if (!args.trim()) {
      return {
        title: _tr("messages.title", "Jellyfin"),
        html: `<div class="command-result"><p>{{ t:${ID}.messages.usage }} <code>!jellyfin &lt;search term&gt;</code></p></div>`,
      };
    }

    try {
      const term = args.trim();
      const page = context?.page ?? 1;
      const perPage = 25;
      const startIndex = (page - 1) * perPage;

      const authHeaders = _authHeaders();
      const itemFields =
        "Overview,People,SeriesName,SeasonName,IndexNumber,ParentIndexNumber,ImageTags,ProductionYear";
      const itemTypes =
        "Movie,Series,Episode,Audio,MusicAlbum,MusicArtist,Season";

      const epQuery = parseEpisodeQuery(term);
      if (epQuery) {
        const epResults = await findEpisode(epQuery, authHeaders, itemFields, perPage, startIndex, fetchFn);
        if (epResults.length > 0) {
          return {
            title: _tr("messages.resultsTitle", "Jellyfin: {term}, {count} results", {
              term,
              count: epResults.length,
            }),
            html: "",
            results: epResults.map(_toResult),
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
                `${String(p["Name"])} (${String(p["Type"] || p["Role"] || _tr("messages.cast", "Cast"))})`,
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
          title: _tr("messages.title", "Jellyfin"),
          html: `<div class="command-result"><p>{{ t:${ID}.messages.noResults }} <strong>${escHtml(term)}</strong>.</p></div>`,
        };
      }

      const totalHints = totalRecordCount || allItems.length;
      const totalPages = Math.ceil(totalHints / perPage);
      const ordered = await _withSeasons(_exactFirst(allItems, term), fetchFn, authHeaders, itemFields);
      return {
        title: _tr("messages.resultsTitle", "Jellyfin: {term}, {count} results", {
          term,
          count: totalHints,
        }),
        html: "",
        results: ordered.map(_toResult),
        totalPages,
      };
    } catch {
      return {
        title: _tr("messages.title", "Jellyfin"),
        html: `<div class="command-result"><p>{{ t:${ID}.messages.failed }}</p></div>`,
      };
    }
  },
};

export default jellyfin;
