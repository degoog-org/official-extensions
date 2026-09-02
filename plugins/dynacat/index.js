import { createClient, flattenWidgets } from "./api.js";
import { EXCLUDED_TYPES, esc, hasRenderer, renderCard } from "./render.js";
import {
  applyLayout,
  readPageLayout,
  readSelectedPage,
  writePageLayout,
  writeSelectedPage,
} from "./layout.js";

const SECRET_MASK = "__SET__";
const MIN_CACHE_MS = 15000;

let _baseUrl = "";
let _token = "";
let _username = "";
let _password = "";
let _page = "";
let _showOnHome = true;
let _showOnMobile = true;
let _refreshSeconds = 60;

let _signProxyUrl = null;
let _fetch = null;
let _cache = null;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const client = () =>
  createClient({
    baseUrl: _baseUrl,
    token: _token,
    username: _username,
    password: _password,
    fetchFn: _fetch || fetch,
  });

const activePage = async () => (await readSelectedPage()) || _page;

const unmask = (value, current) => (value === SECRET_MASK ? current : value);

const enabled = (value) => value !== false && value !== "false";

const renderContext = (api) => ({
  image: (path) => {
    const absolute = api.absolute(path);
    if (!absolute) return "";
    return _signProxyUrl ? _signProxyUrl(absolute) : "";
  },
});

const pickable = (card) =>
  !EXCLUDED_TYPES.has(card.type) &&
  (Boolean(card.error) || hasRenderer(card.type) || Boolean(card.data));

const buildCards = async (slug, force = false) => {
  const ttl = Math.max(MIN_CACHE_MS, _refreshSeconds * 1000);
  if (!force && _cache?.page === slug && Date.now() - _cache.at < ttl) {
    return _cache.value;
  }
  const api = client();
  const page = await api.getPage(slug);
  const ctx = renderContext(api);
  const cards = flattenWidgets(page.widgets).filter(pickable);
  const layout = await readPageLayout(slug);
  const value = {
    page: page.slug,
    pageName: page.name || page.slug,
    cards: applyLayout(cards, layout).map((card) => ({
      key: card.key,
      title: card.title,
      type: card.type,
      visible: card.visible,
      span: card.span,
      error: card.error,
      html: renderCard(card, ctx),
    })),
  };
  _cache = { page: slug, at: Date.now(), value };
  return value;
};

const listPages = async () => {
  const pages = await client().listPages();
  return pages.map((page) => ({
    slug: page.slug,
    name: page.name || page.slug,
    widgets: (page.widgets || []).length,
  }));
};

const grid = (cards) =>
  `<div class="dyn-grid">${cards.map((card) => card.html).join("")}</div>`;

export default {
  name: "Dynacat",
  description:
    "Pulls widget data from a Dynacat dashboard through its read-only API and shows the widgets you care about on the Degoog home page.",
  trigger: "dynacat",
  aliases: ["dc"],
  isClientExposed: false,
  naturalLanguagePhrases: ["my dashboard", "server dashboard", "dynacat"],

  settingsSchema: [
    {
      key: "baseUrl",
      label: "Dynacat URL",
      type: "url",
      required: true,
      placeholder: "http://dynacat:8080",
      description:
        "Base URL of your Dynacat instance. The API must be enabled in its config with `api.enabled: true`.",
    },
    {
      key: "apiToken",
      label: "API token",
      type: "password",
      secret: true,
      placeholder: "••••••••",
      description: "Value of `api.token` from the Dynacat config.",
    },
    {
      key: "page",
      label: "Default page",
      type: "select",
      description:
        "Dynacat page to start from. The page dropdown on the dashboard overrides this once you pick one.",
      optionsFrom: {
        dependsOn: ["baseUrl", "apiToken"],
        refreshLabel: "Load pages",
        emptyHint: "Enter the Dynacat URL and token, then load the pages.",
      },
    },
    {
      key: "showOnHome",
      label: "Show on home page",
      type: "toggle",
      default: "true",
      description: "Render the dashboard under the search bar.",
    },
    {
      key: "showOnMobile",
      label: "Show on mobile",
      type: "toggle",
      default: "true",
    },
    {
      key: "refreshSeconds",
      label: "Refresh interval (seconds)",
      type: "number",
      default: "60",
      advanced: true,
      description: "How long widget data is cached before Dynacat is asked again.",
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      advanced: true,
      description: "Only needed for pages restricted with `allowed-users`.",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      secret: true,
      advanced: true,
    },
  ],

  async getFieldOptions(key, values, signal) {
    if (key !== "page") return { options: [] };
    const api = createClient({
      baseUrl: values.baseUrl || _baseUrl,
      token: unmask(values.apiToken, _token) || "",
      username: values.username || _username,
      password: unmask(values.password, _password),
      fetchFn: _fetch || fetch,
    });
    if (!api.base) {
      return { options: [], notice: "Set the Dynacat URL first." };
    }
    try {
      const pages = await api.listPages(signal);
      const options = pages.map((page) => ({
        value: page.slug,
        label: `${page.name || page.slug} (${(page.widgets || []).length} widgets)`,
      }));
      return {
        options,
        notice: options.length ? undefined : "Dynacat returned no readable pages.",
      };
    } catch (err) {
      return { options: [], notice: err.message };
    }
  },

  async init(ctx) {
    if (ctx.signProxyUrl) _signProxyUrl = ctx.signProxyUrl;
    if (ctx.fetch) _fetch = ctx.fetch;
  },

  configure(settings) {
    _baseUrl = String(settings.baseUrl || "").trim();
    _token = String(settings.apiToken || "");
    _username = String(settings.username || "").trim();
    _password = String(settings.password || "");
    _page = String(settings.page || "").trim();
    _showOnHome = enabled(settings.showOnHome);
    _showOnMobile = enabled(settings.showOnMobile);
    const refresh = parseInt(String(settings.refreshSeconds ?? "60"), 10);
    _refreshSeconds = Number.isFinite(refresh) && refresh > 0 ? refresh : 60;
    _cache = null;
  },

  async execute(args) {
    const slug = await activePage();
    if (!_baseUrl || !slug) {
      return {
        title: "Dynacat",
        html: `<div class="command-result"><p>Dynacat is not configured. Set the instance URL and token in settings, then pick a page on the home page dashboard.</p></div>`,
      };
    }
    try {
      const { cards, pageName } = await buildCards(slug);
      const query = args.trim().toLowerCase();
      const shown = cards.filter(
        (card) =>
          card.visible &&
          (!query ||
            card.title.toLowerCase().includes(query) ||
            card.type.toLowerCase().includes(query)),
      );
      if (shown.length === 0) {
        return {
          title: `Dynacat - ${pageName}`,
          html: `<div class="command-result"><p>No widgets match${query ? ` "${esc(query)}"` : ""}.</p></div>`,
        };
      }
      return {
        title: `Dynacat - ${pageName}`,
        html: `<div class="command-result dyn-root dyn-root--results">${grid(shown)}</div>`,
      };
    } catch (err) {
      return {
        title: "Dynacat",
        html: `<div class="command-result"><p>Could not reach Dynacat: ${esc(err.message)}</p></div>`,
      };
    }
  },

  routes: [
    {
      method: "get",
      path: "/cards",
      handler: async (req) => {
        const slug = await activePage();
        const base = {
          configured: Boolean(_baseUrl),
          showOnHome: _showOnHome,
          showOnMobile: _showOnMobile,
          refreshSeconds: _refreshSeconds,
          page: slug,
          pageName: "",
          pages: [],
          cards: [],
          error: "",
        };
        if (!_baseUrl) return json(base);
        try {
          base.pages = await listPages();
        } catch (err) {
          return json({ ...base, error: err.message });
        }
        if (!slug) return json(base);
        try {
          const force = new URL(req.url).searchParams.get("force") === "1";
          const built = await buildCards(slug, force);
          return json({ ...base, ...built });
        } catch (err) {
          return json({ ...base, error: err.message });
        }
      },
    },
    {
      method: "post",
      path: "/page",
      handler: async (req) => {
        try {
          const body = await req.json();
          const slug = String(body?.page || "").trim();
          if (!slug) return json({ ok: false, error: "No page given" }, 400);
          await writeSelectedPage(slug);
          _cache = null;
          return json({ ok: true, page: slug });
        } catch (err) {
          return json({ ok: false, error: err.message }, 400);
        }
      },
    },
    {
      method: "post",
      path: "/layout",
      handler: async (req) => {
        try {
          const body = await req.json();
          const slug = String(body?.page || "") || (await activePage());
          if (!slug) return json({ ok: false, error: "No page selected" }, 400);
          const entries = Array.isArray(body?.cards) ? body.cards : [];
          const order = [];
          const hidden = [];
          const spans = {};
          for (const entry of entries) {
            const key = String(entry?.key || "");
            if (!key) continue;
            order.push(key);
            if (entry.visible === false) hidden.push(key);
            if (Number(entry.span) === 2) spans[key] = 2;
          }
          await writePageLayout(slug, { order, hidden, spans });
          _cache = null;
          return json({ ok: true, page: slug });
        } catch (err) {
          return json({ ok: false, error: err.message }, 400);
        }
      },
    },
  ],
};
