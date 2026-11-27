const GREADER_BASE = "/api/greader.php";

const ENDPOINT = Object.freeze({
  AUTH: `${GREADER_BASE}/accounts/ClientLogin`,
});

const GR_STATE = Object.freeze({
  READ: "user/-/state/com.google/read",
});

const AUTH_TTL = 30 * 60 * 1000;
const WRITE_TOKEN_TTL = 25 * 60 * 1000;
const CACHE_TTL = 5 * 60 * 1000;
const FETCH_COUNT = 100;
const PAGE_SIZE = 20;

let _instanceUrl = "";
let _username = "";
let _apiPassword = "";
let _category = "";
let _unreadOnly = false;
let _showOnDesktop = false;
let _gateBehindAuth = false;
let _signProxyUrl = null;
let _signFaviconUrl = null;
let _template = "";
let _cardTpl = "";

let _authToken = null;
let _authAt = 0;
let _writeToken = null;
let _writeTokenAt = 0;
let _itemsCache = null;
let _cacheAt = 0;

const _esc = (str) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const _stripHtml = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/gi, " ")
    .trim();

const _formatDate = (ts) => {
  if (!ts) return "";
  const date = new Date(ts * 1000);
  const diff = Date.now() - date.getTime();
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

const _proxyImg = (url) => {
  if (!url || !_signProxyUrl) return "";
  return _signProxyUrl(url);
};

const _thumbnail = (item) => {
  if (Array.isArray(item.enclosure)) {
    for (const enc of item.enclosure) {
      if (enc.type?.startsWith("image/") && enc.href) return enc.href;
    }
  }
  const html = item.summary?.content || item.content?.content || "";
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match?.[1]?.startsWith("http")) return match[1];
  return null;
};

const _clientLogin = async (fetchFn) => {
  const body = new URLSearchParams({ Email: _username, Passwd: _apiPassword });
  const res = await fetchFn(`${_instanceUrl}${ENDPOINT.AUTH}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`FreshRSS auth failed: ${res.status}`);
  const text = await res.text();
  const match = text.match(/^Auth=(.+)$/m);
  if (!match) throw new Error("FreshRSS: no Auth token in response");
  return match[1].trim();
};

const _getToken = async (fetchFn) => {
  if (_authToken && Date.now() - _authAt < AUTH_TTL) return _authToken;
  _authToken = await _clientLogin(fetchFn);
  _authAt = Date.now();
  return _authToken;
};

const _getWriteToken = async (fetchFn) => {
  if (_writeToken && Date.now() - _writeTokenAt < WRITE_TOKEN_TTL) return _writeToken;
  const auth = await _getToken(fetchFn);
  const res = await fetchFn(`${_instanceUrl}${GREADER_BASE}/reader/api/0/token`, {
    headers: { Authorization: `GoogleLogin auth=${auth}` },
  });
  if (!res.ok) throw new Error(`FreshRSS write token failed: ${res.status}`);
  _writeToken = (await res.text()).trim();
  _writeTokenAt = Date.now();
  return _writeToken;
};

const _streamEndpoint = () => {
  const base = `${_instanceUrl}${GREADER_BASE}/reader/api/0/stream/contents`;
  if (_category) return `${base}/user/-/label/${encodeURIComponent(_category)}`;
  return `${base}/user/-/state/com.google/reading-list`;
};

const _fetchItems = async (fetchFn = fetch) => {
  if (_itemsCache && Date.now() - _cacheAt < CACHE_TTL) return _itemsCache;
  const token = await _getToken(fetchFn);
  const params = new URLSearchParams({
    output: "json",
    n: String(FETCH_COUNT),
  });
  if (_unreadOnly) params.set("xt", GR_STATE.READ);
  const res = await fetchFn(`${_streamEndpoint()}?${params}`, {
    headers: { Authorization: `GoogleLogin auth=${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) _authToken = null;
    throw new Error(`FreshRSS stream failed: ${res.status}`);
  }
  const data = await res.json();
  const items = (data.items || [])
    .map((item) => {
      const url = item.canonical?.[0]?.href || item.alternate?.[0]?.href || "";
      return {
        id: item.id || "",
        title: _stripHtml(item.title || ""),
        url,
        description: _stripHtml(
          item.summary?.content || item.content?.content || "",
        ).slice(0, 500),
        source: item.origin?.title || _cleanUrl(url),
        pubDate: item.published || null,
        thumbnail: _thumbnail(item),
      };
    })
    .filter((i) => i.title && i.url.startsWith("http"));
  _itemsCache = items;
  _cacheAt = Date.now();
  return items;
};

const _renderItem = (item) => {
  const dateStr = _formatDate(item.pubDate);
  const thumbBlock = item.thumbnail
    ? `<div class="result-thumbnail-wrap"><img class="result-thumbnail-img" src="${_esc(_proxyImg(item.thumbnail))}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
    : "";
  let badges = `<span class="result-engine-tag">${_esc(item.source)}</span>`;
  if (dateStr)
    badges += `<span class="rss-result-date">${_esc(dateStr)}</span>`;
  const data = {
    faviconSrc: _esc(_faviconUrl(item.url)),
    cite: _esc(_cleanUrl(item.url)),
    itemUrl: _esc(item.url),
    title: _esc(item.title),
    snippet: _esc(item.description.slice(0, 200)),
    badges,
    thumbBlock,
  };
  return _template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");
};

const _renderHtml = (items, query) => {
  if (items.length === 0) {
    return `<div class="command-result"><p>No FreshRSS results${query ? ` for <strong>${_esc(query)}</strong>` : ""}.</p></div>`;
  }
  return items.map(_renderItem).join("");
};

const _toResultItem = (item) => ({
  id: item.id,
  title: item.title,
  url: item.url,
  snippet: item.description,
  source: item.source,
  thumbnail: _proxyImg(item.thumbnail),
  favicon: _faviconUrl(item.url),
  pubDate: item.pubDate ? new Date(item.pubDate * 1000).toISOString() : null,
});

const _search = async (query, page, fetchFn) => {
  const all = await _fetchItems(fetchFn);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? all.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q),
      )
    : all;
  const start = (page - 1) * PAGE_SIZE;
  return {
    items: filtered.slice(start, start + PAGE_SIZE),
    total: filtered.length,
  };
};

const _notConfigured = () => !_instanceUrl || !_username || !_apiPassword;

const _isOpenTo = (context) => !_gateBehindAuth || context?.authenticated === true;

const _shallNotPass = () =>
  new Response(JSON.stringify({ error: "You shall not pass!" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

const slot = {
  isClientExposed: false,
  name: "FreshRSS",
  description:
    "FreshRSS integration. Works the same way as the home rss plugin but uses the FreshRSS API instead.",
  trigger: "freshrss",
  aliases: ["frss"],
  naturalLanguagePhrases: [
    "rss feed",
    "my rss feeds",
    "news from freshrss",
    "what's new",
  ],

  settingsSchema: [
    {
      key: "instanceUrl",
      label: "FreshRSS URL",
      type: "text",
      description:
        "Base URL of your FreshRSS instance (e.g. https://rss.example.com).",
      placeholder: "https://rss.example.com",
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      description: "Your FreshRSS username.",
      placeholder: "admin",
    },
    {
      key: "apiPassword",
      label: "API Password",
      type: "password",
      description:
        "Your FreshRSS API password. Check the plugin README for more info.",
      placeholder: "••••••••",
    },
    {
      key: "category",
      label: "Category",
      type: "text",
      description:
        "Filter by a FreshRSS category name. Leave empty to show all feeds.",
      placeholder: "Tech",
    },
    {
      key: "unreadOnly",
      label: "Unread only",
      type: "toggle",
      description: "Only show articles you have not read yet in FreshRSS.",
    },
    {
      key: "showOnDesktop",
      label: "Show on desktop",
      type: "toggle",
      description:
        "Display the feed on the home page on desktop too (horizontal scrolling).",
    },
    {
      key: "gateBehindAuth",
      label: "Gate behind auth",
      type: "toggle",
      default: "false",
      description:
        "Only people signed in to Settings see your feed, on the home page and through the bang, and can mark articles as read.",
    },
  ],

  async init(ctx) {
    _template = ctx.template;
    _cardTpl = await ctx.readFile("card.html");
    if (ctx.signProxyUrl) _signProxyUrl = ctx.signProxyUrl;
    if (ctx.signFaviconUrl) _signFaviconUrl = ctx.signFaviconUrl;
  },

  configure(settings) {
    _instanceUrl = (settings.instanceUrl || "").replace(/\/$/, "");
    _username = settings.username || "";
    _apiPassword = settings.apiPassword || "";
    _category = (settings.category || "").trim();
    _unreadOnly =
      settings.unreadOnly === true || settings.unreadOnly === "true";
    _showOnDesktop =
      settings.showOnDesktop === true || settings.showOnDesktop === "true";
    _gateBehindAuth =
      settings.gateBehindAuth === true || settings.gateBehindAuth === "true";
    _authToken = null;
    _authAt = 0;
    _writeToken = null;
    _writeTokenAt = 0;
    _itemsCache = null;
    _cacheAt = 0;
  },

  async execute(args, context) {
    const fetchFn = context?.fetch || fetch;
    const page = context?.page ?? 1;
    const query = args.trim();
    if (!_isOpenTo(context)) return { title: "FreshRSS", html: "" };
    if (_notConfigured()) {
      return {
        title: "FreshRSS",
        html: `<div class="command-result"><p>FreshRSS is not configured. Set your instance URL, username, and API password in settings.</p></div>`,
      };
    }
    try {
      const { items, total } = await _search(query, page, fetchFn);
      const totalPages = Math.ceil(total / PAGE_SIZE);
      return {
        title: query ? `FreshRSS - "${query}"` : "FreshRSS - Latest",
        html: _renderHtml(items, query),
        totalPages: totalPages > 1 ? totalPages : undefined,
      };
    } catch (err) {
      console.error("[freshrss] execute:", err);
      return {
        title: "FreshRSS",
        html: `<div class="command-result"><p>Failed to fetch FreshRSS feed. Check your settings and make sure the API is enabled.</p></div>`,
      };
    }
  },
};

const routes = [
  {
    method: "get",
    path: "/feed",
    handler: async (req, context) => {
      if (!_isOpenTo(context)) return _shallNotPass();
      const empty = {
        results: [],
        showOnDesktop: _showOnDesktop,
        cardTemplate: _cardTpl,
      };
      if (_notConfigured()) {
        return new Response(JSON.stringify(empty), {
          headers: { "Content-Type": "application/json" },
        });
      }
      try {
        const url = new URL(req.url);
        const page = Math.max(
          1,
          parseInt(url.searchParams.get("page") || "1", 10),
        );
        const { items } = await _search("", page);
        return new Response(
          JSON.stringify({
            results: items.map(_toResultItem),
            showOnDesktop: _showOnDesktop,
            cardTemplate: _cardTpl,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      } catch (err) {
        console.error("[freshrss] /feed:", err);
        return new Response(JSON.stringify(empty), {
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  },
  {
    method: "post",
    path: "/mark-read",
    handler: async (req, context) => {
      if (!_isOpenTo(context)) return _shallNotPass();
      const json = { "Content-Type": "application/json" };
      try {
        const { id } = await req.json();
        if (!id) return new Response(JSON.stringify({ ok: false }), { status: 400, headers: json });
        const auth = await _getToken(fetch);
        const wt = await _getWriteToken(fetch);
        const body = new URLSearchParams({ i: id, a: GR_STATE.READ, T: wt });
        const res = await fetch(`${_instanceUrl}${GREADER_BASE}/reader/api/0/edit-tag`, {
          method: "POST",
          headers: {
            Authorization: `GoogleLogin auth=${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        });
        if (!res.ok) {
          if (res.status === 401) { _authToken = null; _writeToken = null; }
          throw new Error(`mark-read failed: ${res.status}`);
        }
        _itemsCache = null;
        return new Response(JSON.stringify({ ok: true }), { headers: json });
      } catch (err) {
        console.error("[freshrss] /mark-read:", err);
        return new Response(JSON.stringify({ ok: false }), { status: 500, headers: json });
      }
    },
  },
  {
    method: "get",
    path: "/feed/stream",
    handler: async (_req, context) => {
      if (!_isOpenTo(context)) return _shallNotPass();
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event, data) => {
            controller.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
          };
          send("init", {
            showOnDesktop: _showOnDesktop,
            cardTemplate: _cardTpl,
            unreadOnly: _unreadOnly,
          });
          if (_notConfigured()) {
            send("done", {});
            controller.close();
            return;
          }
          try {
            const items = await _fetchItems(fetch);
            if (items.length > 0) send("items", items.map(_toResultItem));
          } catch (err) {
            console.error("[freshrss] /feed/stream:", err);
          }
          send("done", {});
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    },
  },
];

module.exports = slot;
module.exports.routes = routes;
module.exports.default = slot;
