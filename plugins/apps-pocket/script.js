const APPS_API = `/api/plugin/${__PLUGIN_ID__}/apps`;
const LAUNCHER_ID = "apps-pocket-launcher";
const PANEL_ID = "apps-pocket-panel";

const LAUNCHER_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>`;

const _escapeHtml = (str) => {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
};

let cachedApps = null;
let inflight = null;
let locked = false;

const _isAuthenticated = () => window.__DEGOOG_AUTH__?.authenticated === true;

const _fetchApps = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(APPS_API, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 401) {
      locked = true;
      return [];
    }
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.apps) ? data.apps : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
};

const _refreshApps = () => {
  if (inflight) return inflight;
  inflight = _fetchApps()
    .then((apps) => {
      cachedApps = apps;
      return apps;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

const _tileHtml = (app) => {
  const fallback = (app.label || "?").trim().slice(0, 1).toUpperCase();
  const iconUrl = typeof app.icon === "string" ? app.icon : "";
  const iconHtml = iconUrl
    ? `<img class="apps-pocket-tile-img" src="${_escapeHtml(iconUrl)}" alt="" loading="lazy" data-fb="${_escapeHtml(fallback)}"/>`
    : `<span class="apps-pocket-tile-fallback">${_escapeHtml(fallback)}</span>`;
  return `<a class="apps-pocket-tile" href="${_escapeHtml(app.url)}" target="_blank" rel="noopener noreferrer"><span class="apps-pocket-tile-icon">${iconHtml}</span><span class="apps-pocket-tile-label">${_escapeHtml(app.label)}</span></a>`;
};

const _viewHtml = (apps) => {
  let body;
  if (apps === null) {
    body = "";
  } else if (apps.length === 0) {
    body = `<div class="apps-pocket-empty">No apps yet. Add some in Settings → Plugins → Apps pocket.</div>`;
  } else {
    body = apps.map(_tileHtml).join("");
  }
  return `
    <div class="apps-pocket-header">
      <span class="apps-pocket-title">Apps</span>
    </div>
    <div class="apps-pocket-grid">${body}</div>
  `;
};

function _bindImageFallbacks(panel) {
  panel.querySelectorAll(".apps-pocket-tile-img").forEach((img) => {
    img.addEventListener("error", () => {
      const span = document.createElement("span");
      span.className = "apps-pocket-tile-fallback";
      span.textContent = img.dataset.fb || "?";
      img.replaceWith(span);
    });
  });
}

function _renderView(panel, apps) {
  panel.innerHTML = _viewHtml(apps);
  _bindImageFallbacks(panel);
}

async function _openPanel(btn, panel) {
  panel.style.display = "block";
  _renderView(panel, cachedApps);
  const apps = await _refreshApps();
  if (locked) {
    _closePanel(panel);
    btn.hidden = true;
    return;
  }
  if (panel.style.display === "none") return;
  const rendered = panel.dataset.rendered || "";
  const next = JSON.stringify(apps);
  if (rendered !== next) {
    _renderView(panel, apps);
    panel.dataset.rendered = next;
  }
}

function _closePanel(panel) {
  panel.style.display = "none";
}

let launcherBtn = null;
let panelEl = null;

function _ensurePanel() {
  if (panelEl) return panelEl;
  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.className = "apps-pocket-panel ext-card";
  panel.style.display = "none";
  panelEl = panel;

  document.addEventListener("click", (e) => {
    if (!panelEl || panelEl.style.display === "none") return;
    if (panelEl.contains(e.target)) return;
    if (launcherBtn && launcherBtn.contains(e.target)) return;
    if (e.target instanceof Element && e.target.closest(".apps-pocket-tile"))
      return;
    _closePanel(panelEl);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panelEl && panelEl.style.display !== "none")
      _closePanel(panelEl);
  });

  return panel;
}

function _mountButton(settingsEl) {
  if (document.getElementById(LAUNCHER_ID)) return;

  const wrapper = document.createElement("div");
  wrapper.className = "apps-pocket-wrapper";
  settingsEl.parentElement.insertBefore(wrapper, settingsEl);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = LAUNCHER_ID;
  btn.className = "header-link apps-pocket-launcher";
  btn.setAttribute("aria-label", "Apps");
  btn.title = "Apps";
  btn.innerHTML = LAUNCHER_ICON;
  wrapper.appendChild(btn);
  wrapper.appendChild(settingsEl);
  launcherBtn = btn;

  const panel = _ensurePanel();
  wrapper.appendChild(panel);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.style.display === "none") {
      _openPanel(btn, panel);
    } else {
      _closePanel(panel);
    }
  });
}

const _findTarget = () => {
  return (
    document.getElementById("nav-settings-top") ||
    document.getElementById("nav-settings-results")
  );
};

function _startMounting() {
  const tryMount = () => {
    if (locked || document.getElementById(LAUNCHER_ID)) return;
    const el = _findTarget();
    if (el) _mountButton(el);
  };
  tryMount();
  const observer = new MutationObserver(tryMount);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function _init() {
  const ready = _refreshApps();
  if (_isAuthenticated()) {
    _startMounting();
    return;
  }
  ready.then(() => {
    if (!locked) _startMounting();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _init);
} else {
  _init();
}
