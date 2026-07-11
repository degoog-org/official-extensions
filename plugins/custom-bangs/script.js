const BANGS_API = `/api/plugin/${__PLUGIN_ID__}/bangs`;
const POST_QUERY_KEY = "degoog-post-query";
const PLACEHOLDER = /\{\{\{s\}\}\}|%s/g;

let bangMap = null;
let naturalPhraseList = [];
let inflight = null;

const isTruthy = (v) => v === true || v === "true";
const flagOrDefault = (v) => (v === undefined || v === null ? true : isTruthy(v));
const stripPlaceholder = (template) => template.replace(PLACEHOLDER, "");

const encodeTerms = (query, bang) => {
  if (!flagOrDefault(bang.encodeQuery)) return query;
  const encoded = encodeURIComponent(query);
  if (flagOrDefault(bang.spaceToPlus)) return encoded.replace(/%20/g, "+");
  return encoded;
};

const substitute = (template, query, bang) =>
  template.replace(PLACEHOLDER, encodeTerms(query, bang));

const basePath = (template) => {
  try {
    const u = new URL(stripPlaceholder(template));
    return u.origin + u.pathname;
  } catch {
    return "";
  }
};

const snapDomain = (bang, template) => {
  let host = (bang.snapDomain || "").trim();
  if (!host) {
    try {
      host = new URL(stripPlaceholder(template)).hostname;
    } catch {
      host = "";
    }
  }
  if (!host) return "";
  if (/^https?:\/\//i.test(host)) return host;
  return `https://${host.replace(/^\/+/, "")}`;
};

const applyRegex = (pattern, query) => {
  try {
    const match = new RegExp(pattern).exec(query);
    if (!match) return query;
    return match[1] != null ? match[1] : match[0];
  } catch {
    return query;
  }
};

const buildBangUrl = (bang, terms) => {
  const template = (bang.url || "").trim();
  if (!template) return "";
  const hasTerms = terms != null && String(terms).trim() !== "";
  if (!hasTerms) {
    if (isTruthy(bang.openBase)) {
      const base = basePath(template);
      if (base) return base;
    }
    if (isTruthy(bang.openSnap)) {
      const snap = snapDomain(bang, template);
      if (snap) return snap;
    }
    return substitute(template, "", bang);
  }
  let query = String(terms).trim();
  if (bang.regex) query = applyRegex(bang.regex, query);
  return substitute(template, query, bang);
};

const _fetchBangs = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(BANGS_API, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.bangs) ? data.bangs : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
};

const _naturalPhrases = (bang) => {
  if (!isTruthy(bang?.naturalLanguage)) return [];
  return String(bang.naturalLanguagePhrases || "")
    .split(",")
    .map((phrase) => phrase.trim().toLowerCase())
    .filter(Boolean);
};

const _refreshBangs = () => {
  if (inflight) return inflight;
  inflight = _fetchBangs()
    .then((list) => {
      bangMap = new Map();
      naturalPhraseList = [];
      for (const bang of list) {
        const key = String(bang?.shortcut || "").trim().toLowerCase();
        if (key) bangMap.set(key, bang);
        for (const phrase of _naturalPhrases(bang)) {
          naturalPhraseList.push({ phrase, bang });
        }
      }
      naturalPhraseList.sort((a, b) => b.phrase.length - a.phrase.length);
      return bangMap;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

const _matchNaturalBang = (q) => {
  const lower = q.toLowerCase();
  for (const { phrase, bang } of naturalPhraseList) {
    if (lower === phrase || lower.startsWith(`${phrase} `)) {
      return { bang, terms: q.slice(phrase.length).trim() };
    }
  }
  return null;
};

const _matchBang = (raw) => {
  if (!bangMap || bangMap.size === 0) return null;
  const q = typeof raw === "string" ? raw.trim() : "";
  if (!q) return null;

  const naturalMatch = _matchNaturalBang(q);
  if (naturalMatch) return naturalMatch;

  if (q.startsWith("!")) {
    const withoutBang = q.slice(1);
    const spaceIdx = withoutBang.indexOf(" ");
    const shortcut = (spaceIdx === -1 ? withoutBang : withoutBang.slice(0, spaceIdx))
      .toLowerCase();
    const bang = bangMap.get(shortcut);
    if (bang) {
      const terms = spaceIdx === -1 ? "" : withoutBang.slice(spaceIdx + 1);
      return { bang, terms };
    }
  }

  const trailing = q.match(/\s!(\S+)$/);
  if (trailing) {
    const bang = bangMap.get(trailing[1].toLowerCase());
    if (bang) {
      const terms = q.slice(0, trailing.index).trim();
      return { bang, terms };
    }
  }

  return null;
};

const _redirectIfBang = (raw) => {
  const match = _matchBang(raw);
  if (!match) return false;
  const dest = buildBangUrl(match.bang, match.terms);
  if (!dest) return false;
  window.location.replace(dest);
  return true;
};

const _handleFromInput = (el, e) => {
  if (!(el instanceof HTMLInputElement)) return;
  if (_redirectIfBang(el.value)) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
};

_refreshBangs().then(() => {
  try {
    let q = new URLSearchParams(window.location.search).get("q");
    if (!q) q = sessionStorage.getItem(POST_QUERY_KEY);
    if (q && _matchBang(q)) {
      sessionStorage.removeItem(POST_QUERY_KEY);
      _redirectIfBang(q);
    }
  } catch (e) {
    console.error(e);
  }
});

document.addEventListener(
  "keydown",
  (e) => {
    if (e.key !== "Enter") return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.id !== "search-input" && el.id !== "results-search-input") return;
    _handleFromInput(el, e);
  },
  true,
);

document.addEventListener(
  "click",
  (e) => {
    const btn = e.target?.closest?.("#results-search-btn");
    if (!btn) return;
    const input = document.getElementById("results-search-input");
    _handleFromInput(input, e);
  },
  true,
);

document.addEventListener(
  "submit",
  (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id !== "search-form-home") return;
    const input = document.getElementById("search-input");
    _handleFromInput(input, e);
  },
  true,
);
