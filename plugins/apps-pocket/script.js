const APPS_API = `/api/plugin/${__PLUGIN_ID__}/apps`;
const SETTINGS_API = `/api/plugin/${__PLUGIN_ID__}/settings`;
const LAUNCHER_ID = "apps-pocket-launcher";
const PANEL_ID = "apps-pocket-panel";
const MODAL_ID = "apps-pocket-modal";

const LAUNCHER_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>`;

const INFO_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

const _escapeHtml = (str) => {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
};

let cachedApps = null;
let inflight = null;
let hideJsonBuilder = false;

const _fetchSettings = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(SETTINGS_API, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { hideJsonBuilder: false };
    const data = await res.json();
    return { hideJsonBuilder: data?.hideJsonBuilder === true };
  } catch {
    return { hideJsonBuilder: false };
  } finally {
    clearTimeout(timer);
  }
};

const _fetchApps = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(APPS_API, {
      signal: controller.signal,
      cache: "no-store",
    });
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

const _resolveIcon = (raw) => {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (/^(https?:)?\/\//i.test(s) || s.startsWith("/") || s.startsWith("data:"))
    return s;
  if (s.toLowerCase().startsWith("sh-")) {
    const name = encodeURIComponent(s.slice(3));
    return `https://cdn.jsdelivr.net/gh/selfhst/icons/png/${name}.png`;
  }
  return `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${encodeURIComponent(s)}.png`;
};

const _tileHtml = (app) => {
  const fallback = (app.label || "?").trim().slice(0, 1).toUpperCase();
  const iconUrl = _resolveIcon(app.icon);
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
    body = `<div class="apps-pocket-empty">No apps yet. Click the builder to create some.</div>`;
  } else {
    body = apps.map(_tileHtml).join("");
  }
  const infoBtn = hideJsonBuilder
    ? ""
    : `<button type="button" class="apps-pocket-info-btn" aria-label="Apps builder" title="Apps builder">${INFO_ICON}</button>`;
  return `
    <div class="apps-pocket-header">
      <span class="apps-pocket-title">Apps</span>
      ${infoBtn}
    </div>
    <div class="apps-pocket-grid">${body}</div>
  `;
};

const _rowHtml = (app) => {
  return `
    <div class="apps-pocket-row">
      <input type="text" class="ext-field-input" data-field="label" placeholder="Label" value="${_escapeHtml(app?.label || "")}">
      <input type="text" class="ext-field-input" data-field="icon" placeholder="Icon URL or name (e.g. jotty, sh-jotty)" value="${_escapeHtml(app?.icon || "")}">
      <input type="text" class="ext-field-input" data-field="url" placeholder="URL" value="${_escapeHtml(app?.url || "")}">
      <button type="button" class="ext-field-urllist-remove apps-pocket-row-remove" aria-label="Remove row" title="Remove">&times;</button>
    </div>
  `;
};

const _modalHtml = (apps) => {
  const seed = apps.length ? apps : [{ label: "", icon: "", url: "" }];
  const rows = seed.map(_rowHtml).join("");
  return `
    <div class="ext-modal apps-pocket-modal" role="dialog" aria-modal="true" aria-label="Apps JSON builder">
      <div class="ext-modal-header">
        <h2 class="ext-modal-title">Apps JSON builder</h2>
        <button type="button" class="ext-modal-close apps-pocket-modal-close" aria-label="Close">&times;</button>
      </div>
      <div class="ext-modal-body">
        <div class="apps-pocket-rows">${rows}</div>
        <button type="button" class="btn btn--secondary apps-pocket-row-add">+ Add app</button>
        <div class="ext-field">
          <div class="apps-pocket-output-head">
            <label class="ext-field-label">Generated JSON</label>
            <button type="button" class="btn btn--secondary apps-pocket-output-copy">Copy</button>
          </div>
          <textarea class="ext-field-input apps-pocket-output" readonly rows="8"></textarea>
          <p class="ext-field-desc">Paste this into Settings → Plugins → Apps pocket to save. Icons accept full URLs, a dashboard-icons name (e.g. <code>jotty</code>), or a selfh.st name prefixed with <code>sh-</code> (e.g. <code>sh-jotty</code>).</p>
        </div>
      </div>
    </div>
  `;
};

const _collectApps = (modal) => {
  const result = [];
  modal.querySelectorAll(".apps-pocket-row").forEach((row) => {
    const get = (field) =>
      row.querySelector(`[data-field="${field}"]`)?.value.trim() || "";
    const label = get("label");
    const icon = get("icon");
    const url = get("url");
    if (!label && !icon && !url) return;
    const app = { label, url };
    if (icon) app.icon = icon;
    result.push(app);
  });
  return result;
};

const _copyText = async (text) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {}
  ta.remove();
  return ok;
};

function _updateOutput(modal) {
  const apps = _collectApps(modal);
  const output = modal.querySelector(".apps-pocket-output");
  if (output) output.value = JSON.stringify(apps, null, 2);
}

function _bindRow(modal, row) {
  row.querySelectorAll(".ext-field-input").forEach((input) => {
    input.addEventListener("input", () => _updateOutput(modal));
  });
  const remove = row.querySelector(".apps-pocket-row-remove");
  if (remove) {
    remove.addEventListener("click", () => {
      row.remove();
      _updateOutput(modal);
    });
  }
}

function _closeModal() {
  const modal = document.getElementById(MODAL_ID);
  if (modal) modal.remove();
  document.removeEventListener("keydown", _modalEsc);
}

function _modalEsc(e) {
  if (e.key === "Escape") _closeModal();
}

function _bindModal(modal) {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) _closeModal();
  });
  const closeBtn = modal.querySelector(".apps-pocket-modal-close");
  if (closeBtn) closeBtn.addEventListener("click", _closeModal);
  const add = modal.querySelector(".apps-pocket-row-add");
  if (add) {
    add.addEventListener("click", () => {
      const rows = modal.querySelector(".apps-pocket-rows");
      const wrap = document.createElement("div");
      wrap.innerHTML = _rowHtml({ label: "", icon: "", url: "" });
      const row = wrap.firstElementChild;
      rows.appendChild(row);
      _bindRow(modal, row);
      _updateOutput(modal);
      row.querySelector(".ext-field-input")?.focus();
    });
  }
  const copy = modal.querySelector(".apps-pocket-output-copy");
  if (copy) {
    copy.addEventListener("click", async () => {
      const output = modal.querySelector(".apps-pocket-output");
      if (!output) return;
      const ok = await _copyText(output.value);
      const prev = copy.textContent;
      copy.textContent = ok ? "Copied!" : "Copy failed";
      setTimeout(() => {
        copy.textContent = prev;
      }, 1200);
    });
  }
  modal
    .querySelectorAll(".apps-pocket-row")
    .forEach((row) => _bindRow(modal, row));
  document.addEventListener("keydown", _modalEsc);
}

function _openModal(apps) {
  _closeModal();
  const modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.className = "ext-modal-overlay apps-pocket-modal-overlay";
  modal.innerHTML = _modalHtml(apps);
  document.body.appendChild(modal);
  _bindModal(modal);
  _updateOutput(modal);
}

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
  const info = panel.querySelector(".apps-pocket-info-btn");
  if (info) {
    info.addEventListener("click", (e) => {
      e.stopPropagation();
      _closePanel(panel);
      _openModal(cachedApps ?? []);
    });
  }
}

async function _openPanel(btn, panel) {
  panel.style.display = "block";
  _renderView(panel, cachedApps);
  const apps = await _refreshApps();
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

function _init() {
  _refreshApps();
  _fetchSettings().then((s) => {
    hideJsonBuilder = s.hideJsonBuilder;
  });
  const tryMount = () => {
    if (document.getElementById(LAUNCHER_ID)) return;
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _init);
} else {
  _init();
}
