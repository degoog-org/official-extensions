let apiKey = "";
const opts = { browserLanguage: true, details: true, crew: true, collection: true, personBio: true, exactTitle: true };
let template = "";
let _signProxy = null;

const IMAGE_BASE = "https://image.tmdb.org/t/p";
const POSTER_SIZE = "w185";
const PROFILE_SIZE = "w185";
const MAX_TABS = 5;
const DEFAULT_LANG = "en-US";
const DEFAULT_REGION = "US";
const DEFAULT_MIN_VOTES = 50;
let minVotes = DEFAULT_MIN_VOTES;
const T_PREFIX = "tmdb-slot.template";

const MEDIA_KEYWORDS =
  /\b(movie|film|show|series|cast|actor|actress|director|season|episode|trailer|anime|manga|tv|imdb|tmdb|netflix|hulu|streaming|watch|rating|review|screenplay|box\s?office|filmography|remake|sequel|prequel|dubbed|subbed|ost|soundtrack)\b/i;

const CAST_PATTERN = /^(.+?)\s+cast\s*$/i;

const NON_MEDIA_PATTERN =
  /^(how\s|what\s(is|are|does|do)\s(a|an|the)?\s?(best\s)?(way|method|difference|meaning|purpose|reason)|why\s|where\s(can|do|is)|when\s(did|does|is|was)|can\si|should\si|how\sto|define\s|weather|recipe|price\sof|buy\s|download\s|install\s|code\s|error\s|fix\s|debug\s|www\.|https?:)/i;

const KEYWORDS_KEY = "tmdb-slot.keywords";

const _keywordPattern = (list) => {
  const words = String(list || "")
    .split(",")
    .map((w) => w.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .filter(Boolean);
  if (!words.length) return null;

  return new RegExp(`(?<![\\p{L}\\p{N}])(${words.join("|")})(?![\\p{L}\\p{N}])`, "iu");
};

const _hasMediaIntent = (query, patterns) => {
  if (patterns.some((p) => p.test(query))) return true;
  if (CAST_PATTERN.test(query)) return true;

  return false;
};

const _titleSimilarity = (query, title) => {
  const q = query.toLowerCase().trim();
  const t = (title || "").toLowerCase().trim();
  if (!t) return 0;
  if (t === q) return 1;
  const qWords = q.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  const tWords = t.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  if (!qWords.length || !tWords.length) return 0;
  const _startsWith = (words, prefix) => prefix.every((w, i) => words[i] === w);
  if (_startsWith(tWords, qWords) || _startsWith(qWords, tWords)) return 0.9;
  const matches = qWords.filter((w) => tWords.includes(w)).length;

  return matches / Math.max(qWords.length, tWords.length);
};

const _isConfidentMatch = (query, result, mediaIntent) => {
  if (!result) return false;

  const sim = _titleSimilarity(query, result.title || result.name);
  const pop = result.popularity || 0;

  if (sim >= 1 && pop >= 5) return true;
  if (!opts.exactTitle && sim >= 0.9 && pop >= 15) return true;
  if (!opts.exactTitle && sim >= 0.7 && pop >= 40) return true;
  if (mediaIntent && sim >= 0.9) return true;
  if (mediaIntent && sim >= 0.7 && pop >= 10) return true;

  return false;
};

const _stripMediaKeywords = (query, patterns) => {
  return patterns
    .reduce((q, p) => q.replace(p, ""), query)
    .replace(/\s{2,}/g, " ")
    .trim();
};

const _esc = (s) => {
  if (typeof s !== "string") return "";
  
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\{\{/g, "&#123;&#123;");
};

const _imgUrl = (path, size) => {
  if (!path || typeof path !== "string") return "";

  const p = path.trim();

  if (!p) return "";

  const url = `${IMAGE_BASE}/${size}${p.startsWith("/") ? p : "/" + p}`;
  return _signProxy ? _signProxy(url) : "";
};

const _render = (data) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");
};  

const _tmdb = async (key, path, fetchFn = fetch) => {
  const base = "https://api.themoviedb.org/3";
  const sep = path.includes("?") ? "&" : "?";
  const full = `${base}/${path}${sep}api_key=${encodeURIComponent(key)}&language=en-US`;
  const res = await fetchFn(full);

  if (!res.ok) return null;

  return res.json();
};

const _localeInfo = (locale) => {
  const m = String(locale || "").match(/^([a-z]{2})(?:[-_]([a-z]{2}))?$/i);
  const lang = m && m[1].toLowerCase() !== "en" ? m[1].toLowerCase() : null;
  return { lang, region: m?.[2]?.toUpperCase() || DEFAULT_REGION };
};

const _localized = (details, field, locale) => {
  if (!locale.lang) return details?.[field] || "";
  const matches = (details?.translations?.translations || []).filter(
    (tr) => tr.iso_639_1 === locale.lang && tr.data?.[field],
  );
  const match = matches.find((tr) => tr.iso_3166_1 === locale.region) || matches[0];
  return match?.data[field] || details?.[field] || "";
};

const _t = (key) => `{{ t:${T_PREFIX}.${key} }}`;

const _formatDate = (iso, locale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));

const _parseQuery = (query) => {
  const q = query.trim();
  const castMatch = q.match(CAST_PATTERN);

  if (castMatch) {
    return { intent: "cast", term: castMatch[1].trim() };
  }

  return { intent: "search", term: q };
};

const _buildCastStrip = (cast) => {
  if (!Array.isArray(cast) || cast.length === 0) return "";
  return cast
    .slice(0, 24)
    .map((c) => {
      const name = _esc(c.name || "");
      const character = c.character ? _esc(c.character) : "";
      const photoUrl = _imgUrl(c.profile_path, PROFILE_SIZE);
      const img = photoUrl
        ? `<img src="${_esc(photoUrl)}" alt="" loading="lazy" class="imdb-cast-photo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : "";
      const initial = (c.name || "").trim().charAt(0).toUpperCase();
      const fallback = `<span class="imdb-cast-initial" style="${img ? "display:none" : ""}">${_esc(initial)}</span>`;
      const href = c.id ? `https://www.themoviedb.org/person/${c.id}` : "";
      const inner = `<div class="imdb-cast-photo-wrap">${img}${fallback}</div><span class="imdb-cast-name">${name}</span>${character ? `<span class="imdb-cast-character">${character}</span>` : ""}`;
      return href
        ? `<a href="${_esc(href)}" target="_blank" rel="noopener" class="imdb-cast-card">${inner}</a>`
        : `<div class="imdb-cast-card">${inner}</div>`;
    })
    .join("");
};

const _buildMovieCards = (movies) => {
  if (!Array.isArray(movies) || movies.length === 0) return "";
  return movies
    .slice(0, 30)
    .map((m) => {
      const title = _esc(m.title || m.name || "");
      const year = (m.release_date || m.first_air_date || "").slice(0, 4);
      const posterUrl = _imgUrl(m.poster_path, POSTER_SIZE);
      const posterHtml = posterUrl
        ? `<img src="${_esc(posterUrl)}" alt="" loading="lazy" class="imdb-movie-poster-img">`
        : `<span class="imdb-movie-poster-placeholder">${(title || "?").charAt(0)}</span>`;
      return `<a href="https://www.themoviedb.org/${m.media_type || "movie"}/${m.id}" target="_blank" rel="noopener" class="imdb-movie-card"><div class="imdb-movie-poster">${posterHtml}</div><span class="imdb-movie-title">${title}</span><span class="imdb-movie-year">${year}</span></a>`;
    })
    .join("");
};

const _tabLabel = (item, mediaType) => {
  const title = item.title || item.name || "";
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);
  const type = mediaType === "tv" ? "TV" : "Movie";
  return year ? `${title} (${type}, ${year})` : `${title} (${type})`;
};

const _buildSeasonAccordion = (season, tmdbId) => {
  const name = _esc(season.name || `Season ${season.season_number}`);
  const epCount = season.episode_count || 0;
  const airYear = (season.air_date || "").slice(0, 4);
  const overview = season.overview ? _esc(season.overview) : "";
  const posterUrl = _imgUrl(season.poster_path, "w92");
  const posterHtml = posterUrl
    ? `<img src="${_esc(posterUrl)}" alt="" loading="lazy" class="tmdb-season-poster">`
    : "";
  const meta = [airYear, `${epCount} episode${epCount !== 1 ? "s" : ""}`]
    .filter(Boolean)
    .join(" · ");
  const link = `https://www.themoviedb.org/tv/${tmdbId}/season/${season.season_number}`;

  return `<details class="tmdb-accordion"><summary class="tmdb-accordion-summary">${name}<span class="tmdb-accordion-meta">${_esc(meta)}</span></summary><div class="tmdb-accordion-body"><div class="tmdb-season-detail">${posterHtml}<div class="tmdb-season-info">${overview ? `<p class="tmdb-season-overview">${overview}</p>` : ""}<a href="${_esc(link)}" target="_blank" rel="noopener" class="tmdb-season-link">View episodes</a></div></div></div></details>`;
};

const _buildSeasonsSection = (details, tmdbId) => {
  const seasons = details?.seasons;

  if (!Array.isArray(seasons) || seasons.length === 0) return "";

  const seasonHtml = seasons
    .filter((s) => s.season_number > 0)
    .map((s) => _buildSeasonAccordion(s, tmdbId))
    .join("");
  if (!seasonHtml) return "";

  return `<details class="tmdb-accordion"><summary class="tmdb-accordion-summary">Seasons<span class="tmdb-accordion-meta">${seasons.filter((s) => s.season_number > 0).length} seasons</span></summary><div class="tmdb-accordion-body">${seasonHtml}</div></details>`;
};

const _certification = (details, mediaType, region) => {
  const certOf = (r) =>
    mediaType === "tv" ? r?.rating : r?.release_dates?.find((d) => d.certification)?.certification;
  const results = (mediaType === "tv" ? details?.content_ratings : details?.release_dates)?.results || [];

  return (
    certOf(results.find((r) => r.iso_3166_1 === region)) ||
    certOf(results.find((r) => r.iso_3166_1 === DEFAULT_REGION)) ||
    ""
  );
};

const _plural = (n, word) => `${n} ${_t(n !== 1 ? `${word}s` : word)}`;

const _lengthInfo = (details, mediaType) => {
  if (mediaType === "tv") {
    const seasons = details?.number_of_seasons;
    const episodes = details?.number_of_episodes;
    return [seasons && _plural(seasons, "season"), episodes && _plural(episodes, "episode")]
      .filter(Boolean)
      .join(" · ");
  }

  const total = details?.runtime;
  if (!total) return "";
  const h = Math.floor(total / 60);
  return h ? `${h}${_t("hoursShort")} ${total % 60}${_t("minutesShort")}` : `${total}${_t("minutesShort")}`;
};

const _crewLine = (details, mediaType) => {
  const byJob = (jobs) =>
    [...new Set((details?.credits?.crew || []).filter((c) => jobs.includes(c.job)).map((c) => c.name))]
      .slice(0, 3)
      .join(", ");
  const parts =
    mediaType === "tv"
      ? [[_t("createdBy"), (details?.created_by || []).map((c) => c.name).slice(0, 3).join(", ")]]
      : [
          [_t("director"), byJob(["Director"])],
          [_t("writer"), byJob(["Screenplay", "Writer"])],
        ];

  return parts
    .filter(([, names]) => names)
    .map(([label, names]) => `<span class="tmdb-crew-label">${label}</span> ${_esc(names)}`)
    .join(" · ");
};

const _buildCollection = (details, collection, itemId) => {
  const ref = details?.belongs_to_collection;
  if (!ref?.id) return "";

  const name = collection?.name || ref.name || "";
  const parts = [...(collection?.parts || [])].sort((a, b) =>
    (a.release_date || "9999").localeCompare(b.release_date || "9999"),
  );
  const n = parts.findIndex((p) => p.id === itemId) + 1;
  const text = n ? `${name} (${n}/${parts.length})` : name;

  return `<a href="https://www.themoviedb.org/collection/${ref.id}" target="_blank" rel="noopener" class="tmdb-collection">${_esc(text)}</a>`;
};

const _buildItemPanel = (item, details, cast, mediaType, collection, locale) => {
  const title = item.title || item.name || details?.title || details?.name || "";
  const original =
    item.original_title || item.original_name || details?.original_title || details?.original_name || "";
  const year = (
    item.release_date ||
    item.first_air_date ||
    details?.release_date ||
    details?.first_air_date ||
    ""
  ).slice(0, 4);
  const typeLabel = mediaType === "tv" ? "TV Series" : "Movie";
  const plot = _localized(details, "overview", locale);
  const posterUrl = _imgUrl(item.poster_path || details?.poster_path, POSTER_SIZE);
  const posterHtml = posterUrl
    ? `<div class="imdb-poster"><img src="${_esc(posterUrl)}" alt="" loading="lazy"></div>`
    : "";
  const status = details?.status && details.status !== "Released" ? details.status : "";
  const genres = (details?.genres || []).map((g) => g.name).join(", ");
  const extra = opts.details
    ? [_esc(_certification(details, mediaType, locale.region)), _lengthInfo(details, mediaType), _esc(status), _esc(genres)]
    : [];
  const metaLine = [typeLabel, _esc(year), ...extra].filter(Boolean).join(" · ");
  const originalHtml =
    opts.details && original && original !== title
      ? `<div class="tmdb-original-title">${_esc(original)}</div>`
      : "";
  const taglineText = opts.details ? _localized(details, "tagline", locale) : "";
  const tagline = taglineText ? `<p class="tmdb-tagline">${_esc(taglineText)}</p>` : "";
  const crew = opts.crew ? _crewLine(details, mediaType) : "";
  const crewBlock = crew ? `<div class="tmdb-crew">${crew}</div>` : "";
  const collectionHtml = opts.collection ? _buildCollection(details, collection, item.id) : "";
  const castStrip = _buildCastStrip(cast);
  const castSection = castStrip
      ? `<details class="tmdb-accordion" open><summary class="tmdb-accordion-summary">Cast<span class="tmdb-accordion-meta">${cast.length} ${cast.length === 1 ? "person" : "people"}</span></summary><div class="tmdb-accordion-body"><div class="imdb-cast-scroll"><div class="imdb-cast-strip">${castStrip}</div></div></div></details>`
    : "";
  const seasonsSection = mediaType === "tv" ? _buildSeasonsSection(details, item.id) : "";
  const plotBlock = plot ? `<p class="imdb-plot">${_esc(plot)}</p>` : "";
  const tmdbHref = item.id ? `https://www.themoviedb.org/${mediaType}/${item.id}` : "";
  const titleHtml = tmdbHref
    ? `<a href="${_esc(tmdbHref)}" target="_blank" rel="noopener" class="imdb-title-link"><h3 class="imdb-title">${_esc(title)}</h3></a>`
    : `<h3 class="imdb-title">${_esc(title)}</h3>`;

  return `<div class="imdb-hero">${posterHtml}<div class="imdb-hero-text"><div class="imdb-meta">${metaLine}</div>${titleHtml}${originalHtml}${tagline}${crewBlock}${collectionHtml}</div></div>${plotBlock}${castSection}${seasonsSection}`;
};

const _wrapTabs = (tabs) => {
  if (tabs.length === 1) return tabs[0].panel;
  
  const tabButtons = tabs
    .map(
      (t, i) =>
        `<button class="tmdb-tab-btn${i === 0 ? " tmdb-tab-btn--active" : ""}" data-tmdb-tab="${i}" onclick="this.parentElement.querySelectorAll('.tmdb-tab-btn').forEach(b=>b.classList.remove('tmdb-tab-btn--active'));this.classList.add('tmdb-tab-btn--active');this.closest('.tmdb-tabs').querySelectorAll('.tmdb-tab-panel').forEach((p,j)=>{p.style.display=j===${i}?'block':'none'})">${_esc(t.label)}</button>`,
    )
    .join("");

  const tabPanels = tabs
    .map(
      (t, i) =>
        `<div class="tmdb-tab-panel" style="${i === 0 ? "" : "display:none"}">${t.panel}</div>`,
    )
    .join("");

  return `<div class="tmdb-tabs"><div class="tmdb-tab-bar">${tabButtons}</div>${tabPanels}</div>`;
};

export const slot = {
  isClientExposed: false,
  id: "tmdb",
  name: "TMDb",
  position: "above-results",
  description: "Shows movie/TV show details above search results.",

  settingsSchema: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      secret: true,
      placeholder: "Free at themoviedb.org",
      description:
        "Key is needed in order to get cast photos, filmography, movie/TV search. Get one at https://www.themoviedb.org/settings/api",
    },
    {
      key: "browserLanguage",
      label: "Use browser language",
      type: "toggle",
      default: "true",
      description:
        "Show overviews, taglines and biographies in the visitor's browser language when TMDB has them.",
    },
    {
      key: "details",
      label: "Show extra details",
      type: "toggle",
      default: "true",
      description: "Age rating, runtime or season count, status, genres, tagline and original title.",
    },
    {
      key: "crew",
      label: "Show director and writer",
      type: "toggle",
      default: "true",
      description: "Director and writer for movies, creators for TV shows.",
    },
    {
      key: "collection",
      label: "Show collection",
      type: "toggle",
      default: "true",
      description: "Which film of a series it is. Costs one extra request per movie in a collection.",
    },
    {
      key: "personBio",
      label: "Show person biography",
      type: "toggle",
      default: "true",
      description: "Photo, birth date, place of birth and biography above a person's filmography.",
    },
    {
      key: "exactTitle",
      label: "Exact title match",
      type: "toggle",
      default: "true",
      description:
        "Only show titles and people whose name matches the query exactly. Words like \"movie\" or \"series\" in the query still allow close matches.",
    },
    {
      key: "minVotes",
      label: "Minimum votes",
      type: "number",
      min: "0",
      default: String(DEFAULT_MIN_VOTES),
      description:
        "Hide movies and TV shows with fewer TMDB votes than this, so obscure titles that only share a name stay out. Words like \"movie\" or \"series\" in the query skip this check. Upcoming titles always show. 0 shows everything.",
    },
  ],

  init(ctx) {
    template = ctx.template;
    if (ctx.signProxyUrl) _signProxy = ctx.signProxyUrl;
  },

  configure(settings) {
    const raw = (settings && settings.apiKey) || "";
    apiKey = typeof raw === "string" ? raw.trim() : "";
    for (const key of Object.keys(opts)) opts[key] = String(settings?.[key] ?? "true") === "true";
    const votes = Number.parseInt(settings?.minVotes, 10);
    minVotes = votes >= 0 ? votes : DEFAULT_MIN_VOTES;
  },

  trigger(query) {
    const q = query.trim();
    if (q.length < 2 || q.length > 80) return false;
    if (NON_MEDIA_PATTERN.test(q)) return false;
    return true;
  },

  async execute(query, context) {
    if (!apiKey) return { title: "", html: "" };

    const fetchFn = context?.fetch || fetch;
    const { intent, term } = _parseQuery(query);
    if (!term) return { title: "", html: "" };

    const localWords = this.t?.(KEYWORDS_KEY, undefined, context?.locale);
    const patterns = [localWords !== KEYWORDS_KEY && _keywordPattern(localWords), MEDIA_KEYWORDS].filter(Boolean);
    const searchTerm = _stripMediaKeywords(term, patterns) || term;
    const mediaIntent = _hasMediaIntent(query, patterns);
    const locale = _localeInfo(opts.browserLanguage ? context?.locale : undefined);
    const dateLocale = /^[a-z]{2}(-[a-z]{2})?$/i.test(context?.locale) ? context.locale : DEFAULT_LANG;
    const translations = locale.lang ? ",translations" : "";

    try {
      const multi = await _tmdb(apiKey, `search/multi?query=${encodeURIComponent(searchTerm)}`, fetchFn);
      const allResults = multi?.results || [];

      if (intent === "cast") {
        const item =
          allResults.find((r) => r.media_type === "movie" || r.media_type === "tv") ||
          allResults[0];
        if (!item || !item.id) return { title: "", html: "" };
        const mediaType = item.media_type || "movie";
        const cred = await _tmdb(apiKey, `${mediaType}/${item.id}/credits`, fetchFn);
        const cast = cred?.cast || [];
        const title = item.title || item.name || "";
        const year = (item.release_date || item.first_air_date || "").slice(0, 4);
        const typeLabel = mediaType === "tv" ? "TV Series" : "Movie";
        const posterUrl = _imgUrl(item.poster_path, POSTER_SIZE);
        const posterHtml = posterUrl
          ? `<div class="imdb-poster"><img src="${_esc(posterUrl)}" alt="" loading="lazy"></div>`
          : "";
        const metaLine = [typeLabel, year].filter(Boolean).join(" · ");
        const castStrip = _buildCastStrip(cast);
        const castSection = castStrip
          ? `<h4 class="imdb-cast-heading">Cast</h4><div class="imdb-cast-scroll"><div class="imdb-cast-strip">${castStrip}</div></div>`
          : "";
        const tmdbHref = item.id ? `https://www.themoviedb.org/${mediaType}/${item.id}` : "";
        const titleHtml = tmdbHref
          ? `<a href="${_esc(tmdbHref)}" target="_blank" rel="noopener" class="imdb-title-link"><h3 class="imdb-title">${_esc(title)}</h3></a>`
          : `<h3 class="imdb-title">${_esc(title)}</h3>`;
        const content = `<div class="imdb-hero imdb-hero--compact">${posterHtml}<div class="imdb-hero-text"><div class="imdb-meta">${_esc(metaLine)}</div>${titleHtml}</div></div>${castSection}`;
        return { title: "", html: _render({ content }) };
      }

      const person = allResults.find((r) => r.media_type === "person");
      if (person && person.id && _isConfidentMatch(searchTerm, person, mediaIntent)) {
        const info = await _tmdb(
          apiKey,
          `person/${person.id}?append_to_response=movie_credits,tv_credits${translations}`,
          fetchFn,
        );
        const dept = info?.known_for_department || person.known_for_department || "Acting";
        const inDept = (c) => c.department === dept;
        const useCrew =
          dept !== "Acting" && [info?.movie_credits, info?.tv_credits].some((l) => l?.crew?.some(inDept));
        const credits = (list) => {
          const seen = new Set();
          return ((useCrew ? list?.crew?.filter(inDept) : list?.cast) || []).filter(
            (c) => !seen.has(c.id) && seen.add(c.id),
          );
        };
        const movieCast = credits(info?.movie_credits);
        const tvCast = credits(info?.tv_credits);
        const movies = movieCast
          .map((c) => ({ ...c, media_type: "movie", release_date: c.release_date }))
          .filter((c) => c.title && c.release_date)
          .sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));
        const tvShows = tvCast
          .map((c) => ({ ...c, media_type: "tv", first_air_date: c.first_air_date }))
          .filter((c) => c.name && (c.first_air_date || c.release_date))
          .sort((a, b) =>
            (b.first_air_date || b.release_date || "").localeCompare(
              a.first_air_date || a.release_date || "",
            ),
          );
        const filmography = [...movies, ...tvShows].slice(0, 30);
        if (filmography.length > 0) {
          const movieCards = _buildMovieCards(filmography);
          const personHref = `https://www.themoviedb.org/person/${person.id}`;
          const personTitleHtml = `<a href="${_esc(personHref)}" target="_blank" rel="noopener" class="imdb-title-link"><h3 class="imdb-filmography-title">${_esc(person.name || searchTerm)}</h3></a>`;
          const filmographyHtml = `<h4 class="imdb-section-heading">Filmography</h4><div class="imdb-filmography-scroll"><div class="imdb-filmography-strip">${movieCards}</div></div>`;
          let content = `${personTitleHtml}${filmographyHtml}`;
          if (opts.personBio) {
            const bio = _localized(info, "biography", locale);
            const photoUrl = _imgUrl(info?.profile_path || person.profile_path, PROFILE_SIZE);
            const photoHtml = photoUrl
              ? `<div class="imdb-poster"><img src="${_esc(photoUrl)}" alt="" loading="lazy"></div>`
              : "";
            const life = [
              info?.birthday &&
                `<span class="tmdb-crew-label">${_t("born")}</span> ${_esc(
                  [_formatDate(info.birthday, dateLocale), info.place_of_birth].filter(Boolean).join(", "),
                )}`,
              info?.deathday && `<span class="tmdb-crew-label">${_t("died")}</span> ${_esc(_formatDate(info.deathday, dateLocale))}`,
            ].filter(Boolean);
            const lifeHtml = life.length ? `<div class="tmdb-crew">${life.join(" · ")}</div>` : "";
            const bioHtml = bio ? `<p class="imdb-plot tmdb-bio">${_esc(bio)}</p>` : "";
            content = `<div class="imdb-hero">${photoHtml}<div class="imdb-hero-text"><div class="imdb-meta">${_esc(dept)}</div>${personTitleHtml}${lifeHtml}</div></div>${bioHtml}${filmographyHtml}`;
          }
          return { title: "", html: _render({ content }) };
        }
      }

      const mediaResults = allResults.filter(
        (r) => r.media_type === "movie" || r.media_type === "tv",
      );
      const today = new Date().toISOString().slice(0, 10);
      const matches = mediaResults
        .filter((r) => _isConfidentMatch(searchTerm, r, mediaIntent))
        .filter(
          (r) =>
            mediaIntent ||
            (r.vote_count || 0) >= minVotes ||
            (r.release_date || r.first_air_date || "") > today,
        )
        .slice(0, MAX_TABS);
      if (matches.length === 0) return { title: "", html: "" };

      const seen = new Set();
      const unique = matches.filter((m) => {
        const key = `${m.media_type}-${m.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const enriched = await Promise.all(
        unique.map(async (item) => {
          const mediaType = item.media_type || "movie";
          const ratings = mediaType === "tv" ? "content_ratings" : "release_dates";
          const details = await _tmdb(
            apiKey,
            `${mediaType}/${item.id}?append_to_response=credits,${ratings}${translations}`,
            fetchFn,
          );
          const collectionId = opts.collection && details?.belongs_to_collection?.id;
          const collection = collectionId
            ? await _tmdb(apiKey, `collection/${collectionId}`, fetchFn).catch(() => null)
            : null;
          return { item, details, cast: details?.credits?.cast || [], mediaType, collection };
        }),
      );

      const tabs = enriched.map((e) => ({
        label: _tabLabel(e.item, e.mediaType),
        panel: _buildItemPanel(e.item, e.details, e.cast, e.mediaType, e.collection, locale),
      }));

      const content = _wrapTabs(tabs);
      return { title: "", html: _render({ content }) };
    } catch {
      return { title: "", html: "" };
    }
  },
};

export default { slot };
