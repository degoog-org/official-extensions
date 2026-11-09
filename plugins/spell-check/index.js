const CORRECTION_TTL_MS = 15_000;
const YANDEX_SPELLER =
  "https://speller.yandex.net/services/spellservice.json/checkText";

const _corrections = new Map();
const _skipOnce = new Set();
const _pending = new Map();

const TRIGGER_WAIT_MS = 2_000;
const REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_WAIT_MS = 1_500;
const _delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let _cache = null;
let _kept = null;
let _lang = "en";
let _maxWaitMs = DEFAULT_MAX_WAIT_MS;
let _apiBase = "";
let _tpl = "";
let _suggestTpl = "";

const BANG = /^!/;
const MIN_WORDS = 2;
const LONG_WORD_LENGTH = 9;
const CACHE_NAMESPACE = "ext:spell-check:corrections";
const CACHE_TTL_MS = 120_000;
const KEPT_NAMESPACE = "ext:spell-check:kept";
const KEPT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

const _resolveCache = (ctx, namespace, ttlMs) => {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache(namespace, ttlMs);
  }
  if (typeof ctx?.createCache === "function") {
    const sync = ctx.createCache(ttlMs);
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

const _remember = (q, { query, suggested, words = [] }) => {
  const sure = query !== q;
  const corrected = sure ? query : suggested;
  if (corrected === q) return;
  _corrections.set(q, {
    corrected,
    sure,
    words,
    expiresAt: Date.now() + CORRECTION_TTL_MS,
  });
};

const _keptKey = (word) => `${_lang}:${word.toLowerCase()}`;

const _unkept = async (errors) => {
  if (!_kept) return errors;
  const kept = await Promise.all(
    errors.map((e) => _kept.get(_keptKey(e.word))),
  );
  return errors.filter((_, i) => !kept[i]);
};

const _keep = async (q) => {
  const words = _corrections.get(q)?.words ?? [];
  _corrections.delete(q);
  if (!_kept) return;
  await Promise.all(words.map((word) => _kept.set(_keptKey(word), true)));
};

const _toLang = (tag) => tag.split(/[-_]/)[0].toLowerCase();

const _toMaxWait = (value) => {
  const ms = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(ms)) return DEFAULT_MAX_WAIT_MS;
  return Math.min(REQUEST_TIMEOUT_MS, Math.max(0, ms));
};

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

  settingsSchema: [
    {
      key: "maxWaitMs",
      label: "Maximum wait (ms)",
      type: "number",
      min: "0",
      max: String(REQUEST_TIMEOUT_MS),
      default: String(DEFAULT_MAX_WAIT_MS),
      description:
        "How long a search waits for Yandex Speller before it runs as typed. A fix that arrives later is shown as Did you mean.",
    },
  ],

  configure(settings) {
    _lang = _toLang(settings.language || "en");
    _maxWaitMs = _toMaxWait(settings.maxWaitMs);
  },

  async init(ctx) {
    _cache = _resolveCache(ctx, CACHE_NAMESPACE, CACHE_TTL_MS);
    _kept = _resolveCache(ctx, KEPT_NAMESPACE, KEPT_TTL_MS);
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

    let promise = _pending.get(q);
    if (!promise) {
      promise = _runIntercept(q, context);
      _pending.set(q, promise);
      const clear = () => {
        if (_pending.get(q) === promise) _pending.delete(q);
      };
      promise.then(clear, clear);
    }

    const result = await Promise.race([promise, _delay(_maxWaitMs)]);
    if (result) {
      _remember(q, result);
      return { query: result.query };
    }

    promise.then(
      ({ suggested }) => _remember(q, { query: q, suggested }),
      () => {},
    );
    return { query };
  },
};

const _runIntercept = async (q, context) => {
  const errors = await _unkept(await _spellingErrors(q, context));
  return {
    query: _applyFixes(q, errors, _isSureFix),
    suggested: _applyFixes(q, errors, _changesWord),
    words: errors
      .filter((e) => e.s?.length && _isSureFix(e))
      .map((e) => e.word),
  };
};

const _spellingErrors = async (q, context) => {
  const cacheKey = `${_lang}:${q}`;
  const hit = _cache ? await _cache.get(cacheKey) : null;
  if (Array.isArray(hit?.errors)) return hit.errors;

  const fetchFn = context?.fetch ?? fetch;

  try {
    const url = `${YANDEX_SPELLER}?text=${encodeURIComponent(q)}&lang=${_lang}`;
    const res = await fetchFn(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) return [];

    const errors = await res.json();
    if (!Array.isArray(errors)) return [];

    if (_cache) await _cache.set(cacheKey, { errors });
    return errors;
  } catch (err) {
    console.warn("[spell-check] Yandex Speller request failed", err);
    return [];
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
          await _keep(body.q);
        }
      } catch (err) {
        console.warn("[spell-check] skip route parse failed", err);
      }
      return new Response(null, { status: 204 });
    },
  },
];
