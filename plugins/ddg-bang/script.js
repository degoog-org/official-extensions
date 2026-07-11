const GO_PATH = `/api/plugin/${__PLUGIN_ID__}/go`;
const POST_QUERY_KEY = "degoog-post-query";

const redirectIfDoubleBang = (raw) => {
  const q = typeof raw === "string" ? raw.trim() : "";
  if (!q.startsWith("!!")) return false;
  window.location.replace(`${GO_PATH}?q=${encodeURIComponent(q)}`);
  return true;
};

try {
  let q = new URLSearchParams(window.location.search).get("q");
  if (!q) q = sessionStorage.getItem(POST_QUERY_KEY);
  if (q && q.trim().startsWith("!!")) {
    sessionStorage.removeItem(POST_QUERY_KEY);
    window.location.replace(`${GO_PATH}?q=${encodeURIComponent(q.trim())}`);
  }
} catch (e) { console.error(e); }

document.addEventListener(
  "keydown",
  (e) => {
    if (e.key !== "Enter") return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.id !== "search-input" && el.id !== "results-search-input") return;
    if (redirectIfDoubleBang(el.value)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true,
);

document.addEventListener(
  "click",
  (e) => {
    const btn = e.target?.closest?.("#results-search-btn");
    if (!btn) return;
    const input = document.getElementById("results-search-input");
    if (!(input instanceof HTMLInputElement)) return;
    if (redirectIfDoubleBang(input.value)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
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
    if (!(input instanceof HTMLInputElement)) return;
    if (redirectIfDoubleBang(input.value)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true,
);
