(function () {
  const API_BASE = `/api/plugin/${__PLUGIN_ID__}`;
  const TOKEN_KEY = "degoog-settings-token";
  const REFRESH_MS = 10000;
  const CLEAR_SETTLE_MS = 3500;

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const fmtDur = (ms) => {
    if (ms === null || ms === undefined || ms < 0) return "n/a";
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  };

  const authHeaders = () => {
    const token = sessionStorage.getItem(TOKEN_KEY) || "";
    return token ? { "x-settings-token": token } : {};
  };

  const initCard = (root) => {
    const body = root.querySelector("[data-body]");
    const connBadge = root.querySelector("[data-conn]");
    const connLabel = root.querySelector("[data-conn-label]");
    const subtitle = root.querySelector("[data-subtitle]");
    const clearAllBtn = root.querySelector("[data-clear-all]");

    let refreshTimer = null;

    const setConn = (label, tone) => {
      connLabel.textContent = label;
      connBadge.dataset.tone = tone;
    };

    const setSubtitle = (text) => {
      subtitle.textContent = text;
    };

    const hero = (icon, text, extra = "") => `
      <div class="fourplay-hero degoog-panel">
        <i class="fa-solid ${icon} fourplay-hero-icon"></i>
        <div class="fourplay-hero-text">${esc(text)}</div>
        ${extra}
      </div>`;

    const renderLocked = () => {
      clearAllBtn.hidden = true;
      setConn("locked", "muted");
      setSubtitle("admin only");
      body.innerHTML = hero(
        "fa-lock",
        "Log into the admin panel to unlock the 4play status view.",
      );
    };

    const renderEmpty = (data) => {
      clearAllBtn.hidden = true;
      setConn(data.transport ? "asleep" : "not found", "muted");
      setSubtitle(data.transport || "no 4play transport found");
      const wake = data.transport
        ? '<button type="button" class="fourplay-btn" data-wake><i class="fa-solid fa-bolt"></i>Wake transport</button>'
        : "";
      body.innerHTML = hero(
        data.transport ? "fa-moon" : "fa-satellite-dish",
        data.hint || "No status available.",
        wake,
      );
    };

    const tile = (label, value, sub, tone = "") => `
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="fourplay-tile degoog-panel">
          <span class="fourplay-tile-label">${esc(label)}</span>
          <span class="fourplay-tile-value" data-tone="${tone}">${value}</span>
          <span class="fourplay-tile-sub">${esc(sub)}</span>
        </div>
      </div>`;

    const sessionRow = (session) => {
      const state = session.blocked
        ? `blocked, ${fmtDur(session.cooldownLeftMs)} left`
        : session.alive
          ? `warm, expires in ${fmtDur(session.expiresInMs)}`
          : "cold";
      const tone = session.blocked ? "danger" : session.alive ? "success" : "muted";
      const metaBits = [`container ${session.container || "default"}`];
      if (session.ageMs !== null && session.ageMs !== undefined) {
        metaBits.push(`warmed ${fmtDur(session.ageMs)} ago`);
      }
      if (session.blocked && session.reason) {
        metaBits.push(session.reason);
      }
      return `
        <div class="fourplay-session degoog-panel" data-key="${esc(session.key)}">
          <span class="fourplay-dot" data-tone="${tone}"></span>
          <div class="fourplay-session-info">
            <span class="fourplay-session-origin">${esc(session.origin)}</span>
            <span class="fourplay-session-meta">${esc(metaBits.join(" | "))}</span>
          </div>
          <span class="degoog-badge fourplay-session-state" data-tone="${tone}">${esc(state)}</span>
          <button type="button" class="degoog-icon-btn fourplay-session-clear" data-clear-key="${esc(session.key)}" aria-label="Clear session" title="Clear this session">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>`;
    };

    const render = (data) => {
      const status = data.status;
      if (!status) {
        renderEmpty(data);
        return;
      }

      setConn(
        status.connected ? "connected" : "disconnected",
        status.connected ? "success" : "danger",
      );
      setSubtitle(data.transport || "");
      clearAllBtn.hidden = false;

      const autoWarm = status.autoWarm || {};
      const containers = status.containers || {};
      const sessions = Array.isArray(status.sessions) ? status.sessions : [];
      const warmCount = sessions.filter((s) => s.alive).length;
      const blockedCount = sessions.filter((s) => s.blocked).length;
      const captchaCount = Number(status.captchaTabs) || 0;
      const tracked = (autoWarm.tracked || []).length;

      const tiles = `
        <div class="fourplay-tiles degoog-grid">
          ${tile(
            "Sessions",
            String(sessions.length),
            `${warmCount} warm, ${blockedCount} blocked`,
            blockedCount ? "danger" : warmCount ? "success" : "",
          )}
          ${tile(
            "Containers",
            `${Number(containers.leased) || 0} / ${Number(containers.max) || 0}`,
            `${Number(containers.idle) || 0} idle in the warm pool`,
          )}
          ${tile(
            "Captcha tabs",
            String(captchaCount),
            captchaCount ? "solve them in the browser" : "no open challenges",
            captchaCount ? "danger" : "",
          )}
          ${tile(
            "Background warmup",
            autoWarm.intervalMs ? `every ${fmtDur(autoWarm.intervalMs)}` : "off",
            tracked ? `${tracked} origin(s) tracked` : "no origins tracked yet",
          )}
        </div>`;

      const list = sessions.length
        ? sessions.map(sessionRow).join("")
        : hero("fa-mug-hot", "No warmed sessions yet. Run a search through the transport and they will show up here.");

      const sectionHead = `
        <div class="fourplay-section-head">
          <span class="fourplay-section-title">Warmed sessions</span>
          <span class="degoog-badge">${sessions.length}</span>
        </div>`;

      const footerBits = [];
      if (status.updatedAt) {
        footerBits.push(`Updated ${fmtDur(Date.now() - status.updatedAt)} ago`);
      }
      footerBits.push("auto-refreshes every 10s");
      const footer = `<div class="fourplay-footer">${esc(footerBits.join(" | "))}</div>`;

      body.innerHTML = `${tiles}${sectionHead}<div class="fourplay-sessions">${list}</div>${footer}`;
    };

    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/status`, { headers: authHeaders() });
        if (res.status === 401) {
          renderLocked();
          return false;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        render(data);
        return true;
      } catch (error) {
        console.warn(`[4play-status] failed to fetch status: ${error?.message || error}`);
        setConn("error", "danger");
        return true;
      }
    };

    const yeetSessions = async (scope, key) => {
      try {
        const res = await fetch(`${API_BASE}/clear`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(key ? { scope, key } : { scope }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        body.classList.add("fourplay-busy");
        setTimeout(async () => {
          body.classList.remove("fourplay-busy");
          await fetchStatus();
        }, CLEAR_SETTLE_MS);
      } catch (error) {
        console.warn(`[4play-status] failed to request clear: ${error?.message || error}`);
      }
    };

    const wakeTransport = async () => {
      setConn("waking", "muted");
      try {
        const res = await fetch(`${API_BASE}/ping`, {
          method: "POST",
          headers: authHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `status ${res.status}`);
        console.warn(
          `[4play-status] wake request for ${data?.transport || "unknown"}: ${data?.ok ? "ok" : data?.message || "failed"}`,
        );
      } catch (error) {
        console.warn(`[4play-status] wake request failed: ${error?.message || error}`);
      }
      await fetchStatus();
    };

    root.addEventListener("click", (event) => {
      const clearBtn = event.target.closest("[data-clear-key]");
      if (clearBtn) {
        yeetSessions("session", clearBtn.dataset.clearKey);
        return;
      }
      if (event.target.closest("[data-clear-all]")) {
        yeetSessions("all");
        return;
      }
      if (event.target.closest("[data-wake]")) {
        wakeTransport();
        return;
      }
      if (event.target.closest("[data-refresh]")) {
        fetchStatus();
      }
    });

    const startPolling = () => {
      refreshTimer = setInterval(async () => {
        if (!document.body.contains(root)) {
          clearInterval(refreshTimer);
          return;
        }
        await fetchStatus();
      }, REFRESH_MS);
    };

    fetchStatus().then((unlocked) => {
      if (unlocked) startPolling();
    });
  };

  const scan = () => {
    const root = document.getElementById("fourplay-status");
    if (!root || root.dataset.fourplayInit === "1") return;
    root.dataset.fourplayInit = "1";
    initCard(root);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
