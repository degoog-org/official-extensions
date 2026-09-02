const WEATHER_CODES = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Drizzle",
  53: "Drizzle",
  55: "Drizzle",
  56: "Drizzle",
  57: "Drizzle",
  61: "Rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain",
  81: "Moderate rain",
  82: "Heavy rain",
  85: "Snow",
  86: "Snow",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

// The Dynacat API serializes no reusable data for these types: the payload is
// empty, config-derived, an opaque blob, or transient client state.
export const EXCLUDED_TYPES = new Set([
  "search",
  "bookmarks",
  "to-do",
  "clock",
  "calendar",
  "calendar-legacy",
  "html",
  "iframe",
  "stopwatch",
  "split-column",
  "group",
  "custom-api",
  "dynawidgets",
  "extension",
  "torrenting",
  "speedtest",
  "playing",
  "latest-media",
]);

export const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const num = (value, digits = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const clampPct = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const relTime = (input) => {
  const date = input instanceof Date ? input : new Date(input);
  if (!date || Number.isNaN(date.getTime())) return "";
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const duration = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url || "");
  }
};

const toneFor = (pct) => {
  if (pct >= 90) return "bad";
  if (pct >= 70) return "warn";
  return "ok";
};

const meter = (label, pct, detail) => {
  const value = clampPct(pct);
  return `
  <div class="dyn-meter">
    <div class="dyn-meter-head">
      <span class="dyn-meter-label">${esc(label)}</span>
      <span class="dyn-meter-side">
        ${detail ? `<span class="dyn-meter-detail">${esc(detail)}</span>` : ""}
        <span class="dyn-meter-value">${value}%</span>
      </span>
    </div>
    <div class="dyn-meter-track"><div class="dyn-meter-fill dyn-tone-${toneFor(value)}" style="width:${value}%"></div></div>
  </div>`;
};

const pill = (text, tone) =>
  `<span class="dyn-pill dyn-tone-${esc(tone || "neutral")}">${esc(text)}</span>`;

const emptyState = (text) => `<p class="dyn-empty">${esc(text)}</p>`;

const listRow = (parts) => `<li class="dyn-row">${parts.join("")}</li>`;

// Widget links come from whatever Dynacat aggregates, so a poisoned feed entry
// could otherwise land a javascript: URL in the href.
const safeHref = (url) => {
  try {
    const { protocol } = new URL(url, "http://dynacat.invalid");
    return protocol === "http:" || protocol === "https:" ? url : "";
  } catch {
    return "";
  }
};

const linkTitle = (url, title) => {
  const href = url ? safeHref(url) : "";
  return href
    ? `<a class="dyn-row-title" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>`
    : `<span class="dyn-row-title">${esc(title)}</span>`;
};

const thumb = (url, ctx) => {
  const src = ctx.image(url);
  if (!src) return "";
  return `<img class="dyn-thumb" src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">`;
};

const serverStats = (data) => {
  const servers = data.Servers || [];
  if (servers.length === 0) return emptyState("No servers reported.");
  return servers
    .map((server) => {
      const info = server.Info || {};
      const cpu = info.CPU || {};
      const mem = info.Memory || {};
      const mounts = info.Mountpoints || [];
      if (!server.IsReachable) {
        return `<div class="dyn-server">${pill(server.StatusText || "unreachable", "bad")}</div>`;
      }
      const head = `
        <div class="dyn-server-head">
          <span class="dyn-server-name">${esc(info.Hostname || "server")}</span>
          <span class="dyn-server-meta">${esc(info.Platform || "")}${info.BootTime ? ` &middot; up ${esc(duration(Date.now() / 1000 - info.BootTime))}` : ""}</span>
        </div>`;
      const bars = [];
      if (cpu.LoadIsAvailable) {
        const temp = cpu.TemperatureIsAvailable ? `${num(cpu.TemperatureC)}°C` : "";
        bars.push(meter("CPU", cpu.Load1Percent, temp));
      }
      if (mem.IsAvailable) {
        bars.push(
          meter("Memory", mem.UsedPercent, `${num(mem.UsedMB)} / ${num(mem.TotalMB)} MB`),
        );
      }
      for (const mount of mounts.slice(0, 3)) {
        bars.push(
          meter(
            mount.Name || mount.Path || "disk",
            mount.UsedPercent,
            `${num(mount.UsedMB / 1024, 1)} / ${num(mount.TotalMB / 1024, 1)} GB`,
          ),
        );
      }
      return `<div class="dyn-server">${head}${bars.join("")}</div>`;
    })
    .join("");
};

const WEATHER_BAR_MIN_PCT = 18;

const weather = (data) => {
  const place = data.Place || {};
  const current = data.Weather || {};
  const labels = data.TimeLabels || [];
  const columns = current.Columns || [];
  const currentIndex = current.CurrentColumn;
  const bars = columns
    .map((col, i) => {
      const scale = Number(col.Scale) || 0;
      const height = Math.round(
        WEATHER_BAR_MIN_PCT + scale * (100 - WEATHER_BAR_MIN_PCT),
      );
      const isNow = i === currentIndex;
      const now = isNow ? " dyn-wcol--now" : "";
      const rain = col.HasPrecipitation ? " dyn-wbar--rain" : "";
      const tip = `${isNow ? "now &middot; " : ""}${esc(labels[i] || "")} &middot; ${esc(num(col.Temperature))}°${col.HasPrecipitation ? " &middot; rain" : ""}`;
      return `<div class="dyn-wcol${now}">
        <span class="dyn-wtip">${tip}</span>
        <div class="dyn-wtrack"><div class="dyn-wbar${rain}" style="height:${height}%"></div></div>
        <span class="dyn-wlabel">${isNow ? "now" : ""}</span>
      </div>`;
    })
    .join("");
  return `
    <div class="dyn-weather">
      <div class="dyn-weather-now">
        <span class="dyn-weather-temp">${esc(num(current.Temperature))}°</span>
        <div class="dyn-weather-text">
          <span class="dyn-weather-cond">${esc(WEATHER_CODES[current.WeatherCode] || "")}</span>
          <span class="dyn-weather-place">${esc([place.Name, place.Country].filter(Boolean).join(", "))}</span>
          <span class="dyn-weather-feels">Feels like ${esc(num(current.ApparentTemperature))}°</span>
        </div>
      </div>
      <div class="dyn-weather-chart">${bars}</div>
    </div>`;
};

const markets = (data) => {
  const items = data.Markets || [];
  if (items.length === 0) return emptyState("No market data.");
  return `<ul class="dyn-list">${items
    .map((market) => {
      const change = Number(market.PercentChange) || 0;
      const tone = change >= 0 ? "ok" : "bad";
      const spark = market.SvgChartPoints
        ? `<svg class="dyn-spark dyn-tone-${tone}" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true"><polyline points="${esc(market.SvgChartPoints)}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`
        : "";
      return listRow([
        `<span class="dyn-row-title">${esc(market.Name)}</span>`,
        spark,
        `<span class="dyn-row-value">${esc(market.Currency || "")}${esc(num(market.Price, market.PriceHint ?? 2))}</span>`,
        `<span class="dyn-row-side dyn-tone-${tone}">${change >= 0 ? "+" : ""}${esc(num(change, 2))}%</span>`,
      ]);
    })
    .join("")}</ul>`;
};

const monitor = (data) => {
  const sites = data.Sites || [];
  if (sites.length === 0) return emptyState("No sites configured.");
  const failing = sites.filter((s) => s.StatusStyle !== "ok").length;
  const summary = `<div class="dyn-summary">${pill(`${sites.length - failing} up`, "ok")}${failing ? pill(`${failing} down`, "bad") : ""}</div>`;
  return (
    summary +
    `<ul class="dyn-list">${sites
      .map((site) => {
        const tone = site.StatusStyle === "ok" ? "ok" : "bad";
        const ms = site.Status?.ResponseTime
          ? `${num(site.Status.ResponseTime / 1e6)}ms`
          : "";
        return listRow([
          `<span class="dyn-dot dyn-tone-${tone}"></span>`,
          linkTitle(site.URL, site.Title || hostOf(site.URL)),
          `<span class="dyn-row-side">${esc(ms)}</span>`,
          pill(site.StatusLabel || site.StatusText || "", tone),
        ]);
      })
      .join("")}</ul>`
  );
};

const containerTone = (stateIcon) => {
  if (stateIcon === "ok") return "ok";
  if (stateIcon === "pending") return "warn";
  return "bad";
};

const containers = (data) => {
  const items = data.Containers || [];
  if (items.length === 0) return emptyState("No containers.");
  const running = items.filter((c) => c.State === "running").length;
  const summary = `<div class="dyn-summary">${pill(`${running} running`, "ok")}${pill(`${items.length - running} stopped`, "neutral")}</div>`;
  return (
    summary +
    `<ul class="dyn-list">${items
      .slice(0, 24)
      .map((container) => {
        const tone = containerTone(container.StateIcon);
        return `<li class="dyn-row dyn-row--stacked">
          <span class="dyn-dot dyn-tone-${tone} dyn-dot--inline"></span>
          <div class="dyn-row-main">
            ${linkTitle(container.URL, container.Name)}
            <span class="dyn-row-meta">${esc(container.StateText || container.State || "")}</span>
          </div>
        </li>`;
      })
      .join("")}</ul>`
  );
};

const metaLine = (parts) => parts.filter(Boolean).join(" · ");

const stackedList = (items, limit, ctx, toRow) =>
  `<ul class="dyn-list dyn-list--stacked">${items
    .slice(0, limit)
    .map((item) => {
      const row = toRow(item);
      return `<li class="dyn-row dyn-row--stacked">
        ${thumb(row.image, ctx)}
        <div class="dyn-row-main">
          ${linkTitle(row.url, row.title)}
          <span class="dyn-row-meta">${esc(row.meta)}</span>
        </div>
      </li>`;
    })
    .join("")}</ul>`;

const posts = (data, ctx) => {
  const items = data.Posts || [];
  if (items.length === 0) return emptyState("No posts.");
  return stackedList(items, 12, ctx, (post) => ({
    image: post.ThumbnailUrl,
    url: post.TargetUrl || post.DiscussionUrl,
    title: post.Title,
    meta: metaLine([
      post.TargetUrlDomain || "",
      post.Score ? `${num(post.Score)} points` : "",
      post.CommentCount ? `${num(post.CommentCount)} comments` : "",
      relTime(post.TimePosted),
    ]),
  }));
};

const feed = (data, ctx) => {
  const items = data.Items || [];
  if (items.length === 0) return emptyState("No feed items.");
  return stackedList(items, 12, ctx, (item) => ({
    image: item.ImageURL,
    url: item.Link,
    title: item.Title,
    meta: metaLine([item.ChannelName, relTime(item.PublishedAt)]),
  }));
};

const videos = (data, ctx) => {
  const items = data.Videos || [];
  if (items.length === 0) return emptyState("No videos.");
  return stackedList(items, 10, ctx, (video) => ({
    image: video.ThumbnailUrl,
    url: video.Url,
    title: video.Title,
    meta: metaLine([video.Author, relTime(video.TimePosted)]),
  }));
};

const releases = (data) => {
  const items = data.Releases || [];
  if (items.length === 0) return emptyState("No releases.");
  return `<ul class="dyn-list">${items
    .slice(0, 12)
    .map((release) =>
      listRow([
        linkTitle(release.NotesUrl || release.Url, release.Name || release.Repository || ""),
        `<span class="dyn-row-value">${esc(release.Version || "")}</span>`,
        `<span class="dyn-row-side">${esc(relTime(release.TimeReleased || release.PublishedAt))}</span>`,
      ]),
    )
    .join("")}</ul>`;
};

const watches = (data) => {
  const items = data.ChangeDetections || [];
  if (items.length === 0) return emptyState("No watches.");
  return `<ul class="dyn-list">${items
    .slice(0, 12)
    .map((watch) =>
      listRow([
        linkTitle(watch.DiffURL, watch.Title),
        `<span class="dyn-row-side">${esc(relTime(watch.LastChanged))}</span>`,
      ]),
    )
    .join("")}</ul>`;
};

const isScalar = (value) =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const genericList = (key, rows) => {
  const columns = Object.keys(rows[0] || {})
    .filter((k) => isScalar(rows[0][k]))
    .slice(0, 3);
  if (columns.length === 0) return "";
  return `<div class="dyn-generic-group">
    <span class="dyn-generic-label">${esc(key)}</span>
    <ul class="dyn-list">${rows
      .slice(0, 8)
      .map((row) =>
        listRow(
          columns.map(
            (col, i) =>
              `<span class="${i === 0 ? "dyn-row-title" : "dyn-row-side"}">${esc(String(row[col]))}</span>`,
          ),
        ),
      )
      .join("")}</ul>
  </div>`;
};

const generic = (data) => {
  const tiles = [];
  const blocks = [];
  const walk = (value, path, depth) => {
    if (depth > 2 || value == null) return;
    if (isScalar(value)) {
      tiles.push(
        `<div class="dyn-tile"><span class="dyn-tile-value">${esc(typeof value === "number" ? num(value, Number.isInteger(value) ? 0 : 2) : value)}</span><span class="dyn-tile-label">${esc(path)}</span></div>`,
      );
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      if (value.every(isScalar)) {
        blocks.push(
          `<div class="dyn-generic-group"><span class="dyn-generic-label">${esc(path)}</span><p class="dyn-generic-text">${esc(value.slice(0, 12).join(", "))}</p></div>`,
        );
        return;
      }
      blocks.push(genericList(path, value));
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      walk(nested, path ? `${path}.${key}` : key, depth + 1);
    }
  };
  walk(data, "", 0);
  const tileBlock = tiles.length
    ? `<div class="dyn-tiles">${tiles.slice(0, 8).join("")}</div>`
    : "";
  const body = tileBlock + blocks.join("");
  return body || emptyState("No displayable data.");
};

const RENDERERS = {
  "server-stats": serverStats,
  weather,
  markets,
  stocks: markets,
  monitor,
  "docker-containers": containers,
  "docker-controller": containers,
  "hacker-news": posts,
  reddit: posts,
  lobsters: posts,
  rss: feed,
  "change-detection": watches,
  videos,
  releases,
};

const SMALL_TYPES = new Set([
  "weather",
  "server-stats",
  "monitor",
  "markets",
  "stocks",
  "dns-stats",
]);

export const hasRenderer = (type) => Boolean(RENDERERS[type]);

export const cardSize = (type) => (SMALL_TYPES.has(type) ? "small" : "large");

export const renderBody = (card, ctx) => {
  if (card.error) return `<p class="dyn-error">${esc(card.error)}</p>`;
  if (!card.data) return emptyState("No data returned.");
  const renderer = RENDERERS[card.type] || generic;
  try {
    return renderer(card.data, ctx) || emptyState("No displayable data.");
  } catch {
    return `<p class="dyn-error">Could not render this widget.</p>`;
  }
};

export const renderCard = (card, ctx) => `
  <article class="dyn-card" data-key="${esc(card.key)}" data-span="${esc(card.span || 1)}" data-size="${cardSize(card.type)}">
    <header class="dyn-card-head">
      <h3 class="dyn-card-title">${esc(card.title)}</h3>
      <span class="dyn-card-type">${esc(card.type)}</span>
    </header>
    <div class="dyn-card-body">${renderBody(card, ctx)}</div>
  </article>`;
