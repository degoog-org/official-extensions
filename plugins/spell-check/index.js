const CORRECTION_TTL_MS = 15_000;
const YANDEX_SPELLER =
  "https://speller.yandex.net/services/spellservice.json/checkText";

const _corrections = new Map();
const _skipOnce = new Set();
const _pending = new Map();

const TRIGGER_WAIT_MS = 2_000;
const REQUEST_TIMEOUT_MS = 5_000;
const _delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let _cache = null;
let _lang = "en";
let _apiBase = "";
let _tpl = "";
let _suggestTpl = "";

const BANG = /^!/;
const MIN_WORDS = 2;
const LONG_WORD_LENGTH = 9;
const CACHE_NAMESPACE = "ext:spell-check:corrections";
const CACHE_TTL_MS = 120_000;

const _resolveCache = (ctx) => {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache(CACHE_NAMESPACE, CACHE_TTL_MS);
  }
  if (typeof ctx?.createCache === "function") {
    const sync = ctx.createCache(CACHE_TTL_MS);
    return {
      get: async (k) => sync.get(k),
      set: async (k, v) => sync.set(k, v),
      delete: async (k) => {
        if (typeof sync.delete === "function") sync.delete(k);
      },
      clear: async () => sync.clear(),
    };
  }
  return null;
};

const _esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const _editDistance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
};

const _changesWord = (e) => e.s[0].toLowerCase() !== e.word.toLowerCase();

const _isSureFix = (e) => {
  const word = e.word.toLowerCase();
  const rep = e.s[0].toLowerCase();
  if (/\s/.test(rep)) return false;
  const edits = _editDistance(word, rep);
  return edits > 0 && edits <= (word.length >= LONG_WORD_LENGTH ? 2 : 1);
};

const _applyFixes = (query, errors, accept) => {
  let out = query;
  let offset = 0;
  for (const e of errors) {
    if (!e.s?.length || !accept(e)) continue;
    const start = e.pos + offset;
    const end = start + e.len;
    const rep = e.s[0];
    out = out.slice(0, start) + rep + out.slice(end);
    offset += rep.length - e.len;
  }
  return out;
};

const _remember = (q, { query, suggested = query }) => {
  const sure = query !== q;
  const corrected = sure ? query : suggested;
  if (corrected === q) return;
  _corrections.set(q, {
    corrected,
    sure,
    expiresAt: Date.now() + CORRECTION_TTL_MS,
  });
};

const _toLang = (tag) => tag.split(/[-_]/)[0].toLowerCase();

export const plugin = {
  id: "spell-check",
  name: "Spell Check",
  description:
    "Intercepts search queries and corrects spelling using Yandex Speller.",
  settingsSchema: [
    {
      key: "language",
      label: "Language",
      type: "text",
      default: "en",
      placeholder: "en",
      description: "Language code passed to Yandex Speller (en, ru, uk).",
    },
  ],
};

export const interceptor = {
  isClientExposed: false,
  name: "Spell Check",

  configure(settings) {
    _lang = _toLang(settings.language || "en");
  },

  async init(ctx) {
    _cache = _resolveCache(ctx);
    _apiBase = ctx.apiBase;
  },

  async intercept(query, context) {
    const q = query.trim();
    if (!q || BANG.test(q) || q.split(/\s+/).length < MIN_WORDS)
      return { query };

    if (_skipOnce.has(q)) {
      _skipOnce.delete(q);
      return { query };
    }

    const existing = _pending.get(q);
    if (existing) return await existing;

    const promise = _runIntercept(q, context);
    _pending.set(q, promise);
    try {
      return await promise;
    } finally {
      if (_pending.get(q) === promise) _pending.delete(q);
    }
  },
};

const _runIntercept = async (q, context) => {
  const cacheKey = `${_lang}:${q}`;
  const hit = _cache ? await _cache.get(cacheKey) : null;
  if (hit) {
    _remember(q, hit);
    return { query: hit.query };
  }

  const fetchFn = context?.fetch ?? fetch;

  try {
    const url = `${YANDEX_SPELLER}?text=${encodeURIComponent(q)}&lang=${_lang}`;
    const res = await fetchFn(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) return { query: q };

    const errors = await res.json();
    if (!Array.isArray(errors)) return { query: q };

    const result = {
      query: _applyFixes(q, errors, _isSureFix),
      suggested: _applyFixes(q, errors, _changesWord),
    };
    if (_cache) await _cache.set(cacheKey, result);
    _remember(q, result);
    return { query: result.query };
  } catch (err) {
    console.warn("[spell-check] Yandex Speller request failed", err);
    return { query: q };
  }
};

export const slot = {
  isClientExposed: false,
  name: "Spell Check",
  description: "Shows a correction banner when a query was spell-checked.",
  position: "at-a-glance",

  async init(ctx) {
    _tpl = ctx.template;
    _suggestTpl = await ctx.readFile("did-you-mean.html");
    _apiBase = ctx.apiBase;
  },

  async trigger(query) {
    const pending = _pending.get(query);
    if (pending) {
      await Promise.race([pending.catch(() => {}), _delay(TRIGGER_WAIT_MS)]);
    }
    const entry = _corrections.get(query);
    return !!(entry && Date.now() < entry.expiresAt);
  },

  async execute(query) {
    const entry = _corrections.get(query);
    if (!entry || Date.now() > entry.expiresAt) return { html: "" };

    const { corrected, sure } = entry;
    const html = (sure ? _tpl : _suggestTpl)
      .replace(/\{\{corrected\}\}/g, _esc(corrected))
      .replace(/\{\{original\}\}/g, _esc(query))
      .replace(/\{\{search_url\}\}/g, `/search?q=${encodeURIComponent(query)}`)
      .replace(/\{\{corrected_url\}\}/g, `/search?q=${encodeURIComponent(corrected)}`)
      .replace(/\{\{skip_endpoint\}\}/g, `${_apiBase}/skip`);

    return { html };
  },
};

export const routes = [
  {
    method: "post",
    path: "/skip",
    async handler(req) {
      try {
        const body = await req.json();
        if (typeof body?.q === "string" && body.q) {
          _skipOnce.add(body.q);
          setTimeout(() => _skipOnce.delete(body.q), 30_000);
        }
      } catch (err) {
        console.warn("[spell-check] skip route parse failed", err);
      }
      return new Response(null, { status: 204 });
    },
  },
];
