const HISTORY_API = `/api/plugin/${__PLUGIN_ID__}`;
const HISTORY_LIST_URL = `${HISTORY_API}/list?limit=10`;

const CLOCK_ICON =
  "<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' aria-hidden='true'><circle cx='12' cy='12' r='10'/><path d='M12 6v6l4 2'/></svg>";
const TRASH_ICON =
  "<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' aria-hidden='true'><path d='M3 6h18v2l-2 14H5L3 8V6z'/><path d='M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2'/><path d='M10 11v6'/><path d='M14 11v6'/></svg>";

const escapeHtml = (str) => {
  if (str == null) return "";
  const s = String(str);
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderHistoryDropdown(entries, input, dropdown, performSearch) {
  if (!dropdown || !input) return;
  dropdown.innerHTML = entries
    .map(
      (item) =>
        `<div class="ac-item ac-item--history" data-entry="${escapeHtml(item.entry)}" data-id="${escapeHtml(String(item.id))}" role="button" tabindex="0">
          <span class="ac-item-icon ac-item-icon--clock" aria-hidden="true">${CLOCK_ICON}</span>
          <span class="ac-item-text">${escapeHtml(item.entry)}</span>
          <button type="button" class="ac-item-delete" data-id="${escapeHtml(String(item.id))}" aria-label="Delete">${TRASH_ICON}</button>
        </div>`
    )
    .join("");
  dropdown.style.display = entries.length ? "block" : "none";
  if (entries.length) dropdown.parentElement.classList.add("ac-open");

  dropdown.querySelectorAll(".ac-item--history").forEach((el) => {
    const textEl = el.querySelector(".ac-item-text");
    const deleteBtn = el.querySelector(".ac-item-delete");
    const entry = el.dataset.entry;
    const id = el.dataset.id;

    if (textEl) {
      textEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = entry;
        dropdown.style.display = "none";
        dropdown.parentElement.classList.remove("ac-open");
        const form = input.closest("form");
        if (form) {
          form.requestSubmit();
        } else {
          const resultsBtn = document.getElementById("results-search-btn");
          if (resultsBtn) resultsBtn.click();
        }
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fetch(`${HISTORY_API}/delete?id=${encodeURIComponent(id)}`, { method: "GET" })
          .then(() => fetch(HISTORY_LIST_URL))
          .then((r) => r.json())
          .then((list) => renderHistoryDropdown(list, input, dropdown, performSearch))
          .catch(() => {});
      });
    }
  });
}

function fetchAndShowHistory(input, dropdown, performSearch) {
  if (!input || input.value.trim() !== "") return;
  fetch(HISTORY_LIST_URL)
    .then((r) => r.json())
    .then((list) => {
      if (input.value.trim() === "") renderHistoryDropdown(Array.isArray(list) ? list : [], input, dropdown, performSearch);
    })
    .catch(() => {});
}

const appendHistory = (entry) => {
  const q = (entry || "").trim();
  if (!q || q === "!history" || q.startsWith("!history ")) return;
  fetch(`${HISTORY_API}/append`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry: q }),
    keepalive: true,
  }).catch(() => {});
}

function initSearchHistory() {
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;

    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const input = target.closest('#search-input, #results-search-input');
    if (!(input instanceof HTMLInputElement)) return;

    const performSearch = window.performSearch;

    if (input.id === 'search-input') {
      const dropdown = document.getElementById('ac-dropdown-home');
      if (dropdown) fetchAndShowHistory(input, dropdown, performSearch);
    } else if (input.id === 'results-search-input') {
      const dropdown = document.getElementById('ac-dropdown-results');
      if (dropdown) fetchAndShowHistory(input, dropdown, performSearch);
    }
  });

  document.addEventListener("submit", (e) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.id === "search-form-home") {
      const input = document.getElementById("search-input");
      if (input) appendHistory(input.value);
    }
  }, true);

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.closest("#results-search-btn")) {
      const input = document.getElementById("results-search-input");
      if (input) appendHistory(input.value);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const target = e.target;
    if (target instanceof HTMLElement && target.id === "results-search-input") {
      appendHistory(target.value);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSearchHistory);
} else {
  initSearchHistory();
}
