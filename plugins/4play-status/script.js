(function () {
  const apiBaseFromRoot = (root) => String(root?.dataset?.apiBase || "").trim();
  const apiBaseFromScript = () => {
    const currentScript =
      document.currentScript instanceof HTMLScriptElement
        ? document.currentScript
        : null;
    const pluginId =
      typeof __PLUGIN_ID__ !== "undefined"
        ? __PLUGIN_ID__
        : currentScript?.src.match(/\/plugins\/([^/]+)\//)?.[1] || "";
    return pluginId ? `/api/plugin/${encodeURIComponent(pluginId)}` : "";
  };
  const TOKEN_KEY = "degoog-settings-token";
  const REFRESH_MS = 10000;
  const TICK_MS = 1000;
  const RECONNECT_MIN_MS = 2000;
  const RECONNECT_MAX_MS = 30000;

  const normalizeUrl = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
    if (/^(localhost|[\w.-]+)(:\d+)?(\/.*)?$/i.test(raw))
      return `http://${raw}`;
    return raw;
  };

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

  const authFetch = (url, init = {}) =>
    fetch(url, {
      credentials: "same-origin",
      ...init,
      headers: { ...authHeaders(), ...(init.headers || {}) },
    });

  const initCard = (root) => {
    const body = root.querySelector("[data-body]");
    const subtitle = root.querySelector("[data-subtitle]");
    const clearAllBtn = root.querySelector("[data-clear-all]");
    const firefoxLink = root.querySelector("[data-firefox]");
    const testBtn = root.querySelector("[data-test]");
    const testResult = root.querySelector("[data-test-result]");
    const apiBase = apiBaseFromRoot(root) || apiBaseFromScript();

    let refreshTimer = null;

    const setFirefox = (url) => {
      const normalized = normalizeUrl(url);
      if (normalized) {
        firefoxLink.href = normalized;
        firefoxLink.hidden = false;
      } else {
        firefoxLink.removeAttribute("href");
        firefoxLink.hidden = true;
      }
    };

    const setTestResult = (text, tone) => {
      testResult.textContent = text;
      testResult.dataset.tone = tone;
      testResult.hidden = false;
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

    const renderLocked = (
      message = "Log into the admin panel to unlock the 4play status view.",
    ) => {
      clearAllBtn.hidden = true;
      testBtn.hidden = true;
      setSubtitle("admin only");
      body.innerHTML = hero("fa-lock", message);
    };

    const renderEmpty = (data) => {
      clearAllBtn.hidden = true;
      testBtn.hidden = !data.transport;
      setSubtitle(data.transport || "no 4play transport selected");
      body.innerHTML = hero(
        data.transport ? "fa-moon" : "fa-satellite-dish",
        data.hint || "No status available.",
      );
    };

    const tile = (label, value, sub, tone = "") => `
      <div class="col-12 col-sm-6 col-lg-4">
        <div class="fourplay-tile degoog-panel">
          <span class="fourplay-tile-label">${esc(label)}</span>
          <span class="fourplay-tile-value" data-tone="${tone}">${value}</span>
          <span class="fourplay-tile-sub">${esc(sub)}</span>
        </div>
      </div>`;

    let statusAt = Date.now();

    const untilFrom = (ms) =>
      ms === null || ms === undefined ? null : statusAt + ms;

    const countdown = (until, prefix = "", suffix = "") =>
      until
        ? `<span data-until="${esc(until)}" data-prefix="${esc(prefix)}" data-suffix="${esc(suffix)}">${esc(`${prefix}${fmtDur(until - Date.now())}${suffix}`)}</span>`
        : "";

    const routeTag = (route) => {
      if (!route) return "";
      if (route.kind === "direct") {
        return `<span class="degoog-badge fourplay-route" title="No proxy, this session leaves from the server's own IP.">direct</span>`;
      }
      if (route.kind === "own") {
        return `<span class="degoog-badge fourplay-route" title="The proxy set in the 4play transport's own settings.">own proxy ${esc(route.label || "")}</span>`;
      }
      if (route.known === false) {
        return `<span class="degoog-badge fourplay-route" data-tone="muted" title="This proxy is no longer in the proxy list, or the server restarted since the session was warmed.">retired proxy</span>`;
      }
      const name = route.position ? `proxy #${route.position}` : "proxy";
      const bits = [
        `<span class="degoog-badge fourplay-route" title="${esc(route.label || "")}">${esc(name)} <span class="fourplay-route-host">${esc(route.label || "")}</span></span>`,
      ];
      if (route.benchedUntil) {
        bits.push(
          `<span class="degoog-badge fourplay-route" data-tone="danger" title="Degoog took this proxy off ${esc(route.site || "this site")} after a captcha, block or rate limit. Other proxies serve it until then.">benched ${countdown(route.benchedUntil, "", " left")}</span>`,
        );
      } else if (route.current === false) {
        bits.push(
          `<span class="degoog-badge fourplay-route" data-tone="muted" title="This proxy got flagged on ${esc(route.site || "this site")} after the session was warmed, so the next search starts a fresh one instead of reusing it.">stale, next search starts fresh</span>`,
        );
      }
      return bits.join("");
    };

    const sessionRow = (session) => {
      const expiresAt = untilFrom(session.expiresInMs);
      const cooldownAt = untilFrom(session.cooldownLeftMs);
      const state = session.blocked
        ? `blocked, ${countdown(cooldownAt, "", " left")}`
        : session.alive
          ? `primed, expires in ${countdown(expiresAt)}`
          : "cold";
      const tone = session.blocked
        ? "danger"
        : session.alive
          ? "success"
          : "muted";
      const containerName =
        session.containerLabel || session.container || "default";
      const metaBits = [`container ${containerName}`];
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
            <span class="fourplay-session-routes">${routeTag(session.route)}</span>
          </div>
          <span class="degoog-badge fourplay-session-state" data-tone="${tone}">${state}</span>
          <button type="button" class="degoog-icon-btn fourplay-session-clear" data-clear-key="${esc(session.key)}" aria-label="Clear session" title="Clear this session">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>`;
    };

    const proxyRows = (lineup) => {
      if (!Array.isArray(lineup) || lineup.length === 0) return "";
      const rows = lineup
        .map((spot) => {
          const benched = Array.isArray(spot.benched) ? spot.benched : [];
          const tone = benched.length ? "danger" : "success";
          const state = benched.length
            ? `benched on ${benched.length} site${benched.length === 1 ? "" : "s"}`
            : "in the lineup";
          const sites = benched
            .map(
              (b) =>
                `<span class="degoog-badge fourplay-route" data-tone="danger" title="${esc(b.trigger)}">${esc(b.site)} ${countdown(b.until, "", " left")}</span>`,
            )
            .join("");
          return `<div class="fourplay-session degoog-panel">
            <span class="fourplay-dot" data-tone="${tone}"></span>
            <div class="fourplay-session-info">
              <span class="fourplay-session-origin">proxy #${esc(spot.position)}</span>
              <span class="fourplay-session-meta">${esc(spot.label)}</span>
              ${sites ? `<span class="fourplay-session-routes">${sites}</span>` : ""}
            </div>
            <span class="degoog-badge fourplay-session-state" data-tone="${tone}">${esc(state)}</span>
          </div>`;
        })
        .join("");
      return `<div class="fourplay-section-head">
          <span class="fourplay-section-title">Proxies</span>
          <span class="degoog-badge">${lineup.length}</span>
        </div>
        <div class="fourplay-sessions">${rows}</div>`;
    };

    let taggedAlong = [];

    const closeTagAlong = () => {
      root.querySelector(".fourplay-modal-overlay")?.remove();
    };

    const openTagAlong = () => {
      closeTagAlong();
      const rows = taggedAlong.length
        ? taggedAlong.map(sessionRow).join("")
        : hero("fa-mug-hot", "Nothing tagged along yet.");
      const shell = document.createElement("div");
      shell.className = "ext-modal-overlay fourplay-modal-overlay";
      shell.innerHTML = `
        <div class="ext-modal" role="dialog" aria-modal="true" aria-label="Origins that tagged along">
          <div class="ext-modal-header">
            <h2 class="ext-modal-title">Origins that tagged along</h2>
            <button class="ext-modal-close degoog-icon-btn" type="button" data-close-tagalong aria-label="Close">&times;</button>
          </div>
          <div class="ext-modal-body">
            <p class="fourplay-modal-note">The browser picked these up loading the page: analytics, fonts, ad and consent hosts. 4play never fetches through them, so they are listed here instead of cluttering the session list.</p>
            <div class="fourplay-sessions">${rows}</div>
          </div>
        </div>`;
      root.appendChild(shell);
    };

    const replayTile = (replay) => {
      if (!replay) {
        return tile("Replays", "unknown", "shows up after the first search");
      }
      if (replay.mode === "library") {
        return tile(
          "Replays",
          "library",
          `${replay.profile}, reuses connections per proxy`,
          "success",
        );
      }
      if (replay.mode === "binary") {
        return tile(
          "Replays",
          "binary",
          `${replay.profile}, new connection per request`,
        );
      }
      return tile("Replays", "browser only", "no curl found, every page loads in a tab", "danger");
    };

    const render = (data) => {
      const firefoxUrl = normalizeUrl(data.firefoxUrl || "");
      const status = data.status;
      if (!status) {
        renderEmpty(data);
        return;
      }
      statusAt = status.updatedAt || Date.now();
      const lineup = Array.isArray(data.proxies) ? data.proxies : [];
      const benchedProxies = lineup.filter((spot) => spot.benched?.length).length;

      setSubtitle(data.transport || "");
      clearAllBtn.hidden = false;
      testBtn.hidden = false;

      const autoWarm = status.autoWarm || {};
      const containers = status.containers || {};
      const sessions = Array.isArray(status.sessions) ? status.sessions : [];
      taggedAlong = Array.isArray(status.taggedAlong) ? status.taggedAlong : [];
      const warmCount = sessions.filter((s) => s.alive).length;
      const blockedCount = sessions.filter((s) => s.blocked).length;
      const captchaTabs = Array.isArray(status.captchaTabs)
        ? status.captchaTabs
        : [];
      const captchaCount = Array.isArray(status.captchaTabs)
        ? captchaTabs.length
        : Number(status.captchaTabs) || 0;
      const tracked = (autoWarm.tracked || []).length;
      const leased = Number(containers.leased) || 0;
      const idle = Number(containers.idle) || 0;
      const max = Number(containers.max) || 0;
      const aliveContainers = leased + idle;

      const tiles = `
        <div class="fourplay-tiles degoog-grid">
          ${tile(
            "Sessions",
            String(sessions.length),
            `${warmCount} primed, ${blockedCount} blocked`,
            blockedCount ? "danger" : warmCount ? "success" : "",
          )}
          ${tile(
            "Containers",
            `${aliveContainers} / ${max}`,
            `${leased} in use, ${idle} idle`,
          )}
          ${tile(
            "Captcha tabs",
            String(captchaCount),
            captchaCount ? "solve them in the browser" : "no open challenges",
            captchaCount ? "danger" : "",
          )}
          ${replayTile(status.replay)}
          ${tile(
            "Proxies",
            lineup.length ? String(lineup.length) : "none",
            lineup.length
              ? `${benchedProxies} benched somewhere`
              : "4play uses its own proxy or none",
            benchedProxies ? "danger" : "",
          )}
          ${tile(
            "Background warmup",
            autoWarm.intervalMs
              ? `every ${fmtDur(autoWarm.intervalMs)}`
              : "off",
            tracked ? `${tracked} origin(s) tracked` : "no origins tracked yet",
          )}
        </div>`;

      const list = sessions.length
        ? sessions.map(sessionRow).join("")
        : hero(
            "fa-mug-hot",
            "No primed browser sessions yet. Run a search through the transport and they will show up here.",
          );

      const captchaList = captchaTabs.length
        ? `<div class="fourplay-section-head">
            <span class="fourplay-section-title">Captcha tabs</span>
            <span class="degoog-badge">${captchaTabs.length}</span>
            <button type="button" class="fourplay-btn" data-clear-captchas title="Drop every captcha flag. Use it once you've solved them, or if the tabs are stale.">Dismiss all</button>
          </div>
          <div class="fourplay-sessions">
            ${captchaTabs
              .map((tab) => {
                const name = tab.title || tab.url || `Tab ${tab.id}`;
                const container =
                  tab.containerLabel || tab.container || "default";
                const solveLink = firefoxUrl
                  ? `<a class="fourplay-btn fourplay-btn--firefox fourplay-session-solve" href="${esc(firefoxUrl)}" target="_blank" rel="noopener noreferrer" title="Open Firefox to solve tab ${esc(tab.id)}"><i class="fa-brands fa-firefox-browser"></i>Solve</a>`
                  : "";
                return `<div class="fourplay-session degoog-panel">
                <span class="fourplay-dot" data-tone="danger"></span>
                <div class="fourplay-session-info">
                  <span class="fourplay-session-origin">${esc(name)}</span>
                  <span class="fourplay-session-meta">${esc(`tab ${tab.id} | container ${container}`)}</span>
                </div>
                <span class="degoog-badge fourplay-session-state" data-tone="danger">needs attention</span>
                ${solveLink}
                <button type="button" class="fourplay-btn fourplay-session-clear" data-clear-captcha="${esc(tab.id)}" title="Drop this flag so ${esc(name)} stops being gated. Use it once you have solved the captcha, or if the tab is stale.">Dismiss</button>
              </div>`;
              })
              .join("")}
          </div>`
        : "";

      const tagAlongBtn = taggedAlong.length
        ? `<button type="button" class="fourplay-btn" data-show-tagalong title="Origins the page pulled in on its own. 4play never fetches through these.">${esc(String(taggedAlong.length))} tagged along</button>`
        : "";

      const sectionHead = `
        <div class="fourplay-section-head">
          <span class="fourplay-section-title">Primed browser sessions</span>
          <span class="degoog-badge">${sessions.length}</span>
          ${tagAlongBtn}
        </div>`;

      const footer = `<div class="fourplay-footer">${
        status.updatedAt
          ? `Updated <span data-since="${esc(status.updatedAt)}">${esc(fmtDur(Date.now() - status.updatedAt))}</span> ago | `
          : ""
      }<span data-live-mode>${esc(liveLabel())}</span></div>`;

      body.innerHTML = `${tiles}${captchaList}${sectionHead}<div class="fourplay-sessions">${list}</div>${proxyRows(lineup)}${footer}`;

      if (root.querySelector(".fourplay-modal-overlay")) openTagAlong();
    };

    const apply = (data) => {
      setFirefox(data.firefoxUrl || "");
      render(data);
    };

    let live = "connecting";
    const liveLabel = () =>
      live === "stream"
        ? "live"
        : live === "polling"
          ? "live updates unavailable, refreshing every 10s"
          : "connecting";

    const setLive = (mode) => {
      live = mode;
      const el = root.querySelector("[data-live-mode]");
      if (el) el.textContent = liveLabel();
    };

    const fetchStatus = async () => {
      try {
        if (!apiBase) throw new Error("plugin api base unavailable");
        const res = await authFetch(`${apiBase}/status`);
        if (res.status === 401) {
          renderLocked();
          return false;
        }
        if (res.status === 403) {
          renderLocked("The 4play status view is locked in plugin settings.");
          return false;
        }
        if (res.status === 503) {
          const detail = await res.json().catch(() => null);
          renderLocked(
            detail?.error ||
              "The admin check could not reach the settings API. Check the server logs.",
          );
          return false;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        apply(await res.json());
        return true;
      } catch (error) {
        console.warn(
          `[4play-status] failed to fetch status: ${error?.message || error}`,
        );
        return true;
      }
    };

    const bodyFor = (scope, key) => {
      if (scope === "captcha")
        return key === null ? { scope } : { scope, tabId: Number(key) };
      return key ? { scope, key } : { scope };
    };

    const yeetSessions = async (scope, key = null) => {
      body.classList.add("fourplay-busy");
      try {
        const res = await authFetch(`${apiBase}/clear`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyFor(scope, key)),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok && res.status !== 202) {
          throw new Error(data?.error || `status ${res.status}`);
        }
        setTestResult(
          data?.message || (data?.ok ? "Done." : "4play didn't confirm."),
          data?.ok ? "success" : "danger",
        );
      } catch (error) {
        const reason = error?.message || error;
        console.warn(`[4play-status] failed to request clear: ${reason}`);
        setTestResult(`Clear failed: ${reason}`, "danger");
      } finally {
        body.classList.remove("fourplay-busy");
        if (live !== "stream") await fetchStatus();
      }
    };

    const testTransport = async () => {
      testBtn.disabled = true;
      setTestResult("Fetching https://example.com through the transport...", "");
      try {
        const res = await authFetch(`${apiBase}/ping`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `status ${res.status}`);
        const via = data?.transport ? ` via ${data.transport}` : "";
        if (data?.ok) {
          setTestResult(`example.com reached${via}.`, "success");
        } else {
          setTestResult(
            `example.com failed${via}: ${data?.message || "no reason given"}`,
            "danger",
          );
        }
      } catch (error) {
        const reason = error?.message || error;
        console.warn(`[4play-status] test request failed: ${reason}`);
        setTestResult(`Test request failed: ${reason}`, "danger");
      } finally {
        testBtn.disabled = false;
      }
      await fetchStatus();
    };

    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-show-tagalong]")) {
        openTagAlong();
        return;
      }
      if (
        event.target.closest("[data-close-tagalong]") ||
        event.target.classList.contains("fourplay-modal-overlay")
      ) {
        closeTagAlong();
        return;
      }
      const clearBtn = event.target.closest("[data-clear-key]");
      if (clearBtn) {
        yeetSessions("session", clearBtn.dataset.clearKey);
        return;
      }
      if (event.target.closest("[data-clear-captchas]")) {
        yeetSessions("captcha");
        return;
      }
      const captchaBtn = event.target.closest("[data-clear-captcha]");
      if (captchaBtn) {
        yeetSessions("captcha", captchaBtn.dataset.clearCaptcha);
        return;
      }
      if (event.target.closest("[data-clear-all]")) {
        yeetSessions("all");
        return;
      }
      if (event.target.closest("[data-test]") || event.target.closest("[data-wake]")) {
        testTransport();
        return;
      }
      if (event.target.closest("[data-refresh]")) {
        fetchStatus();
      }
    });

    const gone = () => !document.body.contains(root);

    const startPolling = () => {
      if (refreshTimer) return;
      refreshTimer = setInterval(async () => {
        if (gone()) {
          clearInterval(refreshTimer);
          return;
        }
        if (document.hidden) return;
        await fetchStatus();
      }, REFRESH_MS);
    };

    const stopPolling = () => {
      if (!refreshTimer) return;
      clearInterval(refreshTimer);
      refreshTimer = null;
    };

    const tickClocks = setInterval(() => {
      if (gone()) {
        clearInterval(tickClocks);
        return;
      }
      const now = Date.now();
      for (const el of root.querySelectorAll("[data-until]")) {
        const left = Number(el.dataset.until) - now;
        el.textContent = left > 0
          ? `${el.dataset.prefix || ""}${fmtDur(left)}${el.dataset.suffix || ""}`
          : "now";
      }
      for (const el of root.querySelectorAll("[data-since]")) {
        el.textContent = fmtDur(now - Number(el.dataset.since));
      }
    }, TICK_MS);

    const readEvents = async (res, onEvent) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        if (gone()) {
          reader.cancel().catch(() => {});
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        let split;
        while ((split = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          let event = "message";
          const data = [];
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
          }
          if (data.length) onEvent(event, data.join("\n"));
        }
      }
    };

    let backoff = RECONNECT_MIN_MS;
    let live$ = null;
    let retryTimer = null;

    const asleep = () => document.hidden || gone();

    const stream = async () => {
      retryTimer = null;
      if (asleep() || live$) return;
      const controller = new AbortController();
      live$ = controller;
      let locked = false;
      try {
        const res = await authFetch(`${apiBase}/stream`, {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (res.status === 401 || res.status === 403) {
          locked = true;
          await fetchStatus();
        } else {
          if (!res.ok || !res.body) throw new Error(`status ${res.status}`);
          stopPolling();
          setLive("stream");
          backoff = RECONNECT_MIN_MS;
          await readEvents(res, (event, data) => {
            if (event === "locked") {
              locked = true;
              renderLocked();
              return;
            }
            try {
              apply(JSON.parse(data));
            } catch (error) {
              console.warn(`[4play-status] bad stream payload: ${error?.message || error}`);
            }
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn(`[4play-status] live updates dropped: ${error?.message || error}`);
        }
      } finally {
        if (live$ === controller) live$ = null;
      }
      if (asleep() || locked || controller.signal.aborted) return;
      setLive("polling");
      startPolling();
      retryTimer = setTimeout(stream, backoff);
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    };

    const nap = () => {
      live$?.abort();
      live$ = null;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      stopPolling();
    };

    const onVisibility = () => {
      if (gone()) {
        nap();
        document.removeEventListener("visibilitychange", onVisibility);
        return;
      }
      if (document.hidden) {
        nap();
        return;
      }
      fetchStatus().then((unlocked) => {
        if (unlocked) stream();
      });
    };

    document.addEventListener("visibilitychange", onVisibility);

    fetchStatus().then((unlocked) => {
      if (unlocked) stream();
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
  new MutationObserver(scan).observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
