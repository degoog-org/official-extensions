// eslint-disable-next-line @typescript-eslint/no-require-imports
const cheerio = require("cheerio");

let _signProxyUrl = null;
let _signFaviconUrl = null;

let template = "";
let cardTemplate = "";

const FEED_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CONCURRENCY = 5;
const MAX_ITEMS_PER_FEED = 50;
const MAX_CACHE_ENTRIES = 100;
const MAX_FEEDS_PER_REQUEST = 20;
const PAGE_SIZE = 20;
const CACHE = new Map();

const DEFAULT_NEWS_FEED_URLS = [
  "https://news.ycombinator.com/rss",
  "https://techcrunch.com/feed/",
  "https://feeds.arstechnica.com/arstechnica/index",
  "https://www.wired.com/feed/rss",
  "https://feeds.bbci.co.uk/news/technology/rss.xml",
  "https://www.theverge.com/rss/index.xml",
  "https://www.engadget.com/rss.xml",
  "https://www.cnet.com/rss/news/",
  "https://www.zdnet.com/news/rss.xml",
  "https://gizmodo.com/rss",
  "https://www.technologyreview.com/feed/",
  "https://readwrite.com/feed/",
  "https://venturebeat.com/feed/",
  "https://thenextweb.com/feed/",
];

let feedUrls = [];
let showOnDesktop = false;
let gateBehindAuth = false;

const _parseRssOrAtom = (xml, feedUrl) => {
  try {
    return _parseRssOrAtomInner(xml, feedUrl);
  } catch {
    return { items: [], feedTitle: new URL(feedUrl).hostname };
  }
};    

const _parseRssOrAtomInner = (xml, feedUrl) => {
  const $ = cheerio.load(xml, { xmlMode: true });
  const feedTitle =
    $("channel > title").first().text().trim() ||
    $("feed > title").first().text().trim() ||
    new URL(feedUrl).hostname;
  const items = [];

  $("channel > item, feed > entry").each((_, el) => {
    const $el = $(el);
    const title =
      $el.find("title").first().text().trim() ||
      $el.find("content").first().text().trim().slice(0, 200);
    let link =
      $el.find("link").first().attr("href") ||
      $el.find("link").first().text().trim();
    if (!link && $el.find("link").length) {
      const linkEl = $el.find("link").first();
      if (linkEl.attr("href")) link = linkEl.attr("href");
      else link = linkEl.text().trim();
    }
    const desc =
      $el.find("description").first().text().trim() ||
      $el.find("summary").first().text().trim() ||
      $el.find("content").first().text().trim() ||
      "";
    const pubDateStr =
      $el.find("pubDate").first().text().trim() ||
      $el.find("published").first().text().trim() ||
      $el.find("updated").first().text().trim() ||
      "";
    let pubDate = null;
    if (pubDateStr) {
      try {
        pubDate = new Date(pubDateStr);
        if (Number.isNaN(pubDate.getTime())) pubDate = null;
      } catch {
        pubDate = null;
      }
    }
    let thumbnail;

    const mediaImages = $el.find("media\\:content").filter(function () {
      return (
        $(this).attr("medium") === "image" ||
        /\.(jpe?g|png|webp|gif)/i.test($(this).attr("url") || "")
      );
    });

    if (mediaImages.length) {
      let bestUrl = mediaImages.first().attr("url") || "";
      let bestWidth =
        parseInt(mediaImages.first().attr("width") || "0", 10) || 0;
      mediaImages.each(function () {
        const w = parseInt($(this).attr("width") || "0", 10) || 0;
        if (w > bestWidth) {
          bestWidth = w;
          bestUrl = $(this).attr("url") || "";
        }
      });
      if (bestUrl && bestUrl.startsWith("http")) thumbnail = bestUrl;
    }

    if (!thumbnail) {
      const mediaThumb = $el.find("media\\:thumbnail").first();
      if (mediaThumb.length) {
        const url = mediaThumb.attr("url");
        if (url && url.startsWith("http")) thumbnail = url;
      }
    }

    if (!thumbnail) {
      const enclosure = $el
        .find("enclosure")
        .filter(function () {
          const t = $(this).attr("type") || "";
          return t.startsWith("image/");
        })
        .first();
      if (enclosure.length) {
        const encUrl = enclosure.attr("url");
        if (encUrl && encUrl.startsWith("http")) thumbnail = encUrl;
      }
    }

    if (!thumbnail) {
      const htmlContent =
        $el.find("content\\:encoded").first().text() ||
        $el.find("description").first().text() ||
        $el.find("content").first().text() ||
        "";
      const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1] && imgMatch[1].startsWith("http")) {
        thumbnail = imgMatch[1];
      }
      if (!thumbnail) {
        const posterMatch = htmlContent.match(/<video[^>]+poster=["']([^"']+)["']/i);
        if (posterMatch && posterMatch[1] && posterMatch[1].startsWith("http")) {
          thumbnail = posterMatch[1];
        }
      }
    }
    if (title && link && link.startsWith("http")) {
      items.push({
        title,
        url: link,
        description: desc.replace(/<[^>]+>/g, "").slice(0, 500),
        source: feedTitle,
        pubDate,
        thumbnail,
      });
    }
  });

  return { items: items.slice(0, MAX_ITEMS_PER_FEED), feedTitle };
}

const _fetchFeed = async (url, fetchFn = fetch) => {
  const cached = CACHE.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { items: cached.items, feedTitle: cached.feedTitle };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; degoog/1.0; +https://github.com/degoog)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const xml = await res.text();
    const parsed = _parseRssOrAtom(xml, url);
    CACHE.set(url, {
      items: parsed.items,
      feedTitle: parsed.feedTitle,
      fetchedAt: Date.now(),
    });
    if (CACHE.size > MAX_CACHE_ENTRIES) {
      let oldest = null;
      let oldestTime = Infinity;
      for (const [key, val] of CACHE) {
        if (val.fetchedAt < oldestTime) {
          oldestTime = val.fetchedAt;
          oldest = key;
        }
      }
      if (oldest) CACHE.delete(oldest);
    }
    return parsed;
  } catch {
    clearTimeout(timeout);
    return null;
  }
};

const _fetchAllFeeds = async (urls, fetchFn = fetch) => {
  const capped = urls.slice(0, MAX_FEEDS_PER_REQUEST);
  const bySource = new Map();
  for (let i = 0; i < capped.length; i += CONCURRENCY) {
    const batch = capped.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((u) => _fetchFeed(u, fetchFn)));
    for (const r of results) {
      if (!r || r.items.length === 0) continue;
      const key = r.feedTitle || capped[i];
      const sorted = [...r.items].sort((a, b) => {
        const ta = a.pubDate?.getTime() ?? 0;
        const tb = b.pubDate?.getTime() ?? 0;
        return tb - ta;
      });
      bySource.set(key, sorted);
    }
  }
  return _interleaveFeeds(bySource);
};

const _interleaveFeeds = (bySource) => {
  const queues = [...bySource.values()].map((items) => ({ items, idx: 0 }));
  queues.sort((a, b) => {
    const ta = a.items[0]?.pubDate?.getTime() ?? 0;
    const tb = b.items[0]?.pubDate?.getTime() ?? 0;
    return tb - ta;
  });
  const result = [];
  let remaining = queues.length;
  while (remaining > 0) {
    for (const q of queues) {
      if (q.idx >= q.items.length) continue;
      result.push(q.items[q.idx++]);
      if (q.idx >= q.items.length) remaining--;
    }
  }
  return result;
};

const _getActiveUrls = () => {
  return feedUrls.length > 0 ? feedUrls : [...DEFAULT_NEWS_FEED_URLS];
};

const _searchFeeds = async (query, page, fetchFn = fetch) => {
  const urls = _getActiveUrls();
  if (urls.length === 0) return [];
  const allItems = await _fetchAllFeeds(urls, fetchFn);
  const q = query.trim().toLowerCase();
  const filtered =
    q === ""
      ? allItems
      : allItems.filter((item) => {
        const title = item.title.toLowerCase();
        const desc = item.description.toLowerCase();
        return title.includes(q) || desc.includes(q);
      });
  const start = (page - 1) * PAGE_SIZE;
  return filtered.slice(start, start + PAGE_SIZE);
};

const _esc = (str) => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};  

const _formatDate = (date) => {
  if (!date) return "";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const _cleanUrl = (url) => {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).replace(/\/$/, "");
  } catch {
    return url;
  }
};

const _faviconUrl = (url) => (_signFaviconUrl ? _signFaviconUrl(url) : "");

const _proxyImageUrl = (url) => {
  if (!url || !_signProxyUrl) return "";
  return _signProxyUrl(url);
};

const _renderResultItem = (item) => {
  const dateStr = _formatDate(item.pubDate);
  const thumbBlock = item.thumbnail
    ? `<div class="result-thumbnail-wrap"><img class="result-thumbnail-img" src="${_esc(_proxyImageUrl(item.thumbnail))}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
    : "";
  let badges = `<span class="result-engine-tag">${_esc(item.source)}</span>`;
  if (dateStr) badges += `<span class="rss-result-date">${_esc(dateStr)}</span>`;
  const data = {
    faviconSrc: _esc(_faviconUrl(item.url)),
    cite: _esc(_cleanUrl(item.url)),
    itemUrl: _esc(item.url),
    title: _esc(item.title),
    snippet: _esc(item.description.slice(0, 200)),
    badges,
    thumbBlock,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");
};

const _renderResultsHtml = (items, page, query) => {
  if (items.length === 0) {
    return `<div class="command-result"><p>No RSS results found${query ? ` for <strong>${_esc(query)}</strong>` : ""}.</p></div>`;
  }
  return items.map(_renderResultItem).join("");
};

const _isOpenTo = (context) => !gateBehindAuth || context?.authenticated === true;

const _shallNotPass = () =>
  new Response(JSON.stringify({ error: "You shall not pass!" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

const _serializeItem = (item) => {
  return {
    title: item.title,
    url: item.url,
    snippet: item.description,
    source: item.source,
    thumbnail: _proxyImageUrl(item.thumbnail),
    favicon: _faviconUrl(item.url),
    pubDate: item.pubDate ? item.pubDate.toISOString() : null,
  };
}

const slot = {
  isClientExposed: false,
  name: "Home RSS Feeds",
  description: "RSS/Atom news feed reader with home page integration",
  trigger: "rss",
  aliases: ["news", "feed"],
  naturalLanguagePhrases: ["latest news", "news feed", "rss feed"],

  defaultFeedUrls: DEFAULT_NEWS_FEED_URLS,

  settingsSchema: [
    {
      key: "urls",
      label: "Feed URLs",
      type: "urllist",
      description:
        "Manage your RSS/Atom feed URLs. Remove individual feeds or add new ones below.",
      placeholder: "https://example.com/feed.xml",
    },
    {
      key: "showOnDesktop",
      label: "Show news on desktop",
      type: "toggle",
      description:
        "Display the news feed on the home page on desktop too (horizontal scrolling).",
    },
    {
      key: "gateBehindAuth",
      label: "Gate behind auth",
      type: "toggle",
      default: "false",
      description:
        "Only people signed in to Settings see your feeds, on the home page and through the bang.",
    },
  ],

  async init(ctx) {
    template = ctx.template;
    cardTemplate = await ctx.readFile("card.html");
    if (ctx.signProxyUrl) _signProxyUrl = ctx.signProxyUrl;
    if (ctx.signFaviconUrl) _signFaviconUrl = ctx.signFaviconUrl;
  },

  configure(settings) {
    const urlsVal = settings.urls;
    let parsed = [];
    if (Array.isArray(urlsVal)) {
      parsed = urlsVal.filter((u) => typeof u === "string" && u.startsWith("http"));
    } else if (typeof urlsVal === "string" && urlsVal.trim()) {
      try {
        const json = JSON.parse(urlsVal);
        if (Array.isArray(json)) {
          parsed = json.filter((u) => typeof u === "string" && u.startsWith("http"));
        }
      } catch {
        parsed = urlsVal
          .split("\n")
          .map((u) => u.trim())
          .filter((u) => {
            try {
              return u.startsWith("http") && !!new URL(u);
            } catch {
              return false;
            }
          });
      }
    }
    feedUrls = parsed;
    showOnDesktop =
      settings.showOnDesktop === true || settings.showOnDesktop === "true";
    gateBehindAuth =
      settings.gateBehindAuth === true || settings.gateBehindAuth === "true";
  },

  async execute(args, context) {
    if (!_isOpenTo(context)) return { title: "RSS Feeds", html: "" };
    const fetchFn = context?.fetch || fetch;
    const page = context?.page ?? 1;
    const query = args.trim();
    const items = await _searchFeeds(query, page, fetchFn);
    const totalItems = await (async () => {
      const urls = _getActiveUrls();
      const allItems = await _fetchAllFeeds(urls, fetchFn);
      const q = query.toLowerCase();
      return q
        ? allItems.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.description.toLowerCase().includes(q),
        ).length
        : allItems.length;
    })();
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);
    return {
      title: query
        ? `RSS Feeds - "${query}"`
        : "RSS Feeds - Latest",
      html: _renderResultsHtml(items, page, query),
      totalPages: totalPages > 1 ? totalPages : undefined,
    };
  },
};

const routes = [
  {
    method: "get",
    path: "/feed",
    handler: async (req, context) => {
      if (!_isOpenTo(context)) return _shallNotPass();
      const url = new URL(req.url);
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
      const items = await _searchFeeds("", page);
      const results = items.map(_serializeItem);
      return new Response(
        JSON.stringify({ results, showOnDesktop, cardTemplate }),
        { headers: { "Content-Type": "application/json" } },
      );
    },
  },
  {
    method: "get",
    path: "/feed/stream",
    handler: async (_req, context) => {
      if (!_isOpenTo(context)) return _shallNotPass();
      const urls = _getActiveUrls();
      const capped = urls.slice(0, MAX_FEEDS_PER_REQUEST);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event, data) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };
          send("init", { showOnDesktop, totalFeeds: capped.length, cardTemplate });
          let active = 0;
          let idx = 0;
          await new Promise((resolve) => {
            function next() {
              if (idx >= capped.length && active === 0) return resolve();
              while (active < CONCURRENCY && idx < capped.length) {
                const url = capped[idx++];
                active++;
                _fetchFeed(url).then((r) => {
                  if (r && r.items.length > 0) {
                    send("items", r.items.map(_serializeItem));
                  }
                }).catch(() => { }).finally(() => {
                  active--;
                  next();
                });
              }
            }
            next();
          });
          send("done", {});
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-CACHE",
          Connection: "keep-alive",
        },
      });
    },
  },
];

module.exports = slot;
module.exports.routes = routes;
module.exports.default = slot;
