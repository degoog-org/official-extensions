(function () {
  const glanceEl = document.getElementById("at-a-glance");
  if (!glanceEl) return;

  const API_BASE = `/api/plugin/${__PLUGIN_ID__}`;
  const SUMMARY_URL = `${API_BASE}/stream`;
  const CHAT_URL = `${API_BASE}/chat`;
  const MAX_SOURCES = 6;
  const BASE_URL = window.__DEGOOG_BASE_URL__ ?? "";
  const FAVICON_ENDPOINT = `${BASE_URL}/api/proxy/favicon`;
  const CITE_GROUP = "\\[[ \\t]*N?\\d+(?:[,\\s]*N?\\d+)*[ \\t]*\\]";
  const CITE_RUN_RE = new RegExp(`${CITE_GROUP}(?:[ \\t]*,?[ \\t]*${CITE_GROUP})*`, "g");
  const HIGHLIGHT_MAX = 200;
  const HIGHLIGHT_RE = /==([^=]+)==/g;

  let history = [];
  let sources = [];

  const escapeHtml = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const getQuery = () => new URLSearchParams(window.location.search).get("q") || "";

  const collectResults = () => {
    const items = document.querySelectorAll("#results-list .result-item");
    const out = [];
    let i = 0;
    for (const el of items) {
      if (i >= MAX_SOURCES) break;
      const title = (el.querySelector(".result-title")?.textContent || "").trim();
      const snippet = (el.querySelector(".result-snippet")?.textContent || "").trim();
      const url = el.querySelector("a[href]")?.getAttribute("href") || "";
      if (!title && !snippet) continue;
      i++;
      out.push({ title, snippet, url });
    }
    return out;
  };

  const hostOf = (url) => {
    try {
      return new URL(url, window.location.origin).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };

  const faviconFor = (url) => {
    const host = hostOf(url);
    return host ? `${FAVICON_ENDPOINT}?domain=${encodeURIComponent(host)}` : "";
  };

  const hostLabel = (src) => src.h || hostOf(src.u) || src.u;

  const hydrateIcons = (root) => {
    root.querySelectorAll("img[data-favicon-host]").forEach((img) => {
      const host = img.dataset.faviconHost;
      if (!host) return;
      img.onerror = () => img.remove();
      img.src = `${FAVICON_ENDPOINT}?domain=${encodeURIComponent(host)}`;
    });
  };

  const pickSrcs = (nums) => {
    const map = new Map(sources.map((s) => [s.i, s]));
    const seen = new Set();
    const out = [];
    for (const n of nums) {
      const src = map.get(parseInt(n, 10));
      if (!src) continue;
      const key = src.h || src.u;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(src);
    }
    return out;
  };

  const citeChip = (picked) => {
    const head = picked[0];
    const extra = picked.length - 1;
    const fav = faviconFor(head.u);
    return (
      '<button type="button" class="glance-ai-cite" ' +
      `data-cite-ns="${picked.map((s) => s.i).join(",")}">` +
      (fav ? `<img class="glance-ai-cite-favicon" src="${escapeHtml(fav)}" alt="" width="14" height="14">` : "") +
      `<span class="glance-ai-cite-host">${escapeHtml(hostLabel(head))}</span>` +
      (extra > 0 ? `<span class="glance-ai-cite-more">+${extra}</span>` : "") +
      "</button>"
    );
  };

  const injectCites = (text) => {
    if (!sources.length) return text;
    return text.replace(CITE_RUN_RE, (run) => {
      const picked = pickSrcs(run.match(/\d+/g) || []);
      return picked.length ? citeChip(picked) : run;
    });
  };

  const injectMarks = (text) =>
    text.replace(HIGHLIGHT_RE, (_, inner) =>
      inner.length <= HIGHLIGHT_MAX && !inner.includes("\n")
        ? `<mark class="glance-ai-key">${inner}</mark>`
        : inner
    );

  const renderRich = (text) => {
    const enriched = injectCites(injectMarks(text));
    const md = window.__degoogMd;
    if (md) return md.block(enriched);
    return escapeHtml(enriched).replace(/\n/g, "<br>");
  };

  const autoResize = (el) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  const parseSrcs = (box) => {
    try {
      return JSON.parse(box.dataset.sources || "[]");
    } catch {
      return [];
    }
  };

  const skeletonHtml = () =>
    '<div class="glance-ai-skeleton" aria-hidden="true">' +
    '<div class="skeleton-line skeleton-line--snippet"></div>' +
    '<div class="skeleton-line skeleton-line--snippet"></div>' +
    '<div class="skeleton-line skeleton-line--snippet-short"></div>' +
    "</div>";

  const writingHtml = () =>
    '<div class="glance-ai-writing" aria-label="' + escapeHtml(t("ai-summary.writing") || "writing") + '">' +
    "<span></span><span></span><span></span></div>";

  const mountThinking = (anchor, position) => {
    const label = document.createElement("div");
    label.className = "glance-ai-thinking-label";
    label.textContent = t("ai-summary.thinking");
    const stream = document.createElement("div");
    stream.className = "glance-ai-thinking-stream";
    if (position === "before") {
      anchor.parentNode.insertBefore(label, anchor);
      anchor.parentNode.insertBefore(stream, anchor);
    } else {
      anchor.appendChild(label);
      anchor.appendChild(stream);
    }
    return { label, stream };
  };

  const clearPending = (root) => {
    root.querySelectorAll(".glance-ai-skeleton, .glance-ai-writing")
      .forEach((el) => el.remove());
  };

  const clearTransient = (root) => {
    root.querySelectorAll(".glance-ai-thinking-stream, .glance-ai-thinking-label, .glance-ai-skeleton, .glance-ai-writing")
      .forEach((el) => el.remove());
  };

  const consumeSse = async (res, handlers) => {
    if (!res.ok || !res.body) {
      handlers.onError("Stream failed");
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let evt;
    let data = "";
    const flush = () => {
      if (!data.length) {
        evt = undefined;
        return;
      }
      const payload = data.replace(/\n$/, "");
      let parsed = {};
      try {
        parsed = JSON.parse(payload);
      } catch { }
      if (evt === "delta") handlers.onDelta(parsed.text || "");
      else if (evt === "thinking") handlers.onThinking(parsed.text || "");
      else if (evt === "done") handlers.onDone(parsed.finishReason);
      else if (evt === "error") handlers.onError(parsed.message || "Stream error");
      evt = undefined;
      data = "";
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        if (line === "") {
          flush();
          continue;
        }
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) evt = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).replace(/^ /, "") + "\n";
      }
    }
    flush();
  };

  const runStream = ({ url, payload, onFirstText, onComplete, onFail, target, thinkAnchor, thinkPos }) => {
    let textBuf = "";
    let thinkBuf = "";
    let started = false;
    let thinking = null;

    const handlers = {
      onDelta: (chunk) => {
        if (!started) {
          started = true;
          clearTransient(target);
          thinking = null;
          onFirstText();
        }
        textBuf += chunk;
        target.innerHTML = renderRich(textBuf);
      },
      onThinking: (text) => {
        if (started || !text) return;
        if (!thinking) {
          clearPending(target);
          thinking = mountThinking(thinkAnchor || target, thinkPos || "append");
        }
        thinkBuf += text;
        thinking.stream.textContent = thinkBuf;
        thinking.stream.scrollTop = thinking.stream.scrollHeight;
      },
      onDone: () => {
        clearTransient(target);
        if (!textBuf.trim()) {
          onFail(t("ai-summary.no-response"));
          return;
        }
        onComplete(textBuf);
      },
      onError: (msg) => {
        clearTransient(target);
        onFail(msg || t("ai-summary.request-failed"));
      },
    };

    return (async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await consumeSse(res, handlers);
      } catch {
        handlers.onError(t("ai-summary.request-failed"));
      }
    })();
  };

  const MAX_SUMMARY_HEIGHT = 160;

  const openChat = (box) => {
    const chatWrap = box.querySelector(".glance-ai-chat");
    const input = box.querySelector(".glance-ai-input");
    if (chatWrap) chatWrap.hidden = false;
    if (input) input.focus({ preventScroll: true });
  };

  const streamSummary = async (box) => {
    const target = box.querySelector(".glance-snippet");
    const bodyEl = box.querySelector(".glance-ai-body");
    const expandBtn = box.querySelector(".glance-ai-expand");
    const collapseBtn = box.querySelector(".glance-ai-collapse");
    if (!target) return;

    let streamDone = false;
    let expanded = false;
    let needsClamp = true;

    const applyExpand = (open) => {
      expanded = open;
      if (!bodyEl) return;
      if (expandBtn) expandBtn.hidden = open;
      if (collapseBtn) collapseBtn.hidden = !open;
      if (open) {
        bodyEl.classList.remove("glance-ai-body--clamped");
        if (streamDone) openChat(box);
        return;
      }
      const chatWrap = box.querySelector(".glance-ai-chat");
      if (chatWrap) chatWrap.hidden = true;
      if (needsClamp) bodyEl.classList.add("glance-ai-body--clamped");
    };

    expandBtn?.addEventListener("click", () => applyExpand(true));
    collapseBtn?.addEventListener("click", () => applyExpand(false));

    const query = getQuery();
    const results = collectResults();
    if (!query || results.length === 0) return;

    await runStream({
      url: SUMMARY_URL,
      payload: { query, results },
      target,
      onFirstText: () => {
        target.dataset.state = "streaming";
        target.innerHTML = writingHtml();
      },
      onComplete: (text) => {
        streamDone = true;
        target.dataset.state = "done";
        target.innerHTML = renderRich(text);
        initFollowUp(box, text);
        requestAnimationFrame(() => {
          needsClamp = !!(bodyEl && bodyEl.scrollHeight > MAX_SUMMARY_HEIGHT);
          if (!needsClamp || expanded) applyExpand(true);
        });
      },
      onFail: (msg) => {
        streamDone = true;
        if (box.dataset.hideOnError === "1") {
          box.remove();
          return;
        }
        target.dataset.state = "error";
        target.textContent = msg;
        if (bodyEl) bodyEl.classList.remove("glance-ai-body--clamped");
        if (expandBtn) expandBtn.hidden = true;
        if (collapseBtn) collapseBtn.hidden = true;
      },
    });
  };

  const initFollowUp = (box, initialSummary) => {
    const query = getQuery();
    const ctxBlock = sources.map((s) => `[${s.i}] ${s.t}\n${s.u}`).join("\n\n");
    history = [
      {
        role: "system",
        content:
          "You are a helpful assistant. The user searched for: " +
          JSON.stringify(query) +
          ". Sources available (cite with [N]):\n\n" +
          ctxBlock +
          "\n\nYou already gave a summary. Now the user wants to dive deeper. Answer follow-ups conversationally and concisely. Cite with [N] when you use a source.",
      },
      { role: "assistant", content: initialSummary },
    ];

    const input = box.querySelector(".glance-ai-input");
    const messagesEl = box.querySelector(".glance-ai-messages");
    if (!input || !messagesEl) return;

    input.addEventListener("input", () => autoResize(input));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendFollowUp(input, messagesEl);
      }
    });
  };

  const sendFollowUp = async (input, messagesEl) => {
    const text = input.value.trim();
    if (!text) return;
    const userDiv = document.createElement("div");
    userDiv.className = "glance-ai-reply glance-ai-user";
    userDiv.textContent = text;
    messagesEl.appendChild(userDiv);
    history.push({ role: "user", content: text });
    input.value = "";
    autoResize(input);

    const reply = document.createElement("div");
    reply.className = "glance-ai-reply";
    reply.dataset.state = "pending";
    reply.innerHTML = skeletonHtml();
    messagesEl.appendChild(reply);

    await runStream({
      url: CHAT_URL,
      payload: { messages: history },
      target: reply,
      thinkAnchor: reply,
      thinkPos: "before",
      onFirstText: () => {
        reply.dataset.state = "streaming";
        reply.innerHTML = writingHtml();
      },
      onComplete: (out) => {
        history.push({ role: "assistant", content: out });
        reply.dataset.state = "done";
        reply.innerHTML = renderRich(out);
      },
      onFail: (msg) => {
        reply.dataset.state = "error";
        reply.remove();
        const err = document.createElement("div");
        err.className = "glance-ai-typing";
        err.textContent = msg;
        messagesEl.appendChild(err);
      },
    });
    input.focus();
  };

  const popEl = (() => {
    const el = document.createElement("div");
    el.className = "glance-ai-pop";
    document.body.appendChild(el);
    return el;
  })();

  let pinnedCite = null;

  const closePop = () => {
    pinnedCite?.classList.remove("glance-ai-cite--open");
    pinnedCite = null;
    popEl.classList.remove("glance-ai-pop--visible", "glance-ai-pop--pinned");
  };

  const srcRow = (src) => {
    const fav = faviconFor(src.u);
    return (
      `<a class="glance-ai-pop-row" href="${escapeHtml(src.u)}" target="_blank" rel="noopener">` +
      '<span class="glance-ai-pop-head">' +
      (fav ? `<img class="glance-ai-cite-favicon" src="${escapeHtml(fav)}" alt="" width="14" height="14">` : "") +
      `<span class="glance-ai-pop-host">${escapeHtml(hostLabel(src))}</span>` +
      "</span>" +
      (src.t ? `<span class="glance-ai-pop-title">${escapeHtml(src.t)}</span>` : "") +
      (src.s ? `<span class="glance-ai-pop-snippet">${escapeHtml(src.s)}</span>` : "") +
      "</a>"
    );
  };

  const placePop = (cite) => {
    const anchor = cite.getBoundingClientRect();
    const pop = popEl.getBoundingClientRect();
    const top = anchor.top - 8 >= pop.height
      ? anchor.top - pop.height - 6
      : anchor.bottom + 6;
    const left = Math.min(
      Math.max(anchor.left, 8),
      Math.max(8, window.innerWidth - pop.width - 8),
    );
    popEl.style.top = top + "px";
    popEl.style.left = left + "px";
  };

  const openPop = (cite, pinned) => {
    const nums = (cite.dataset.citeNs || "").split(",");
    const picked = pickSrcs(nums);
    if (!picked.length) return;
    popEl.innerHTML =
      (picked.length > 1
        ? `<div class="glance-ai-pop-label">${escapeHtml(t("ai-summary.sources"))}</div>`
        : "") + picked.map(srcRow).join("");
    popEl.classList.add("glance-ai-pop--visible");
    popEl.classList.toggle("glance-ai-pop--pinned", !!pinned);
    requestAnimationFrame(() => placePop(cite));
  };

  glanceEl.addEventListener("mouseover", (e) => {
    if (pinnedCite) return;
    const cite = e.target.closest(".glance-ai-cite");
    if (cite) openPop(cite, false);
    else if (!popEl.contains(e.target)) closePop();
  });

  glanceEl.addEventListener("mouseout", (e) => {
    if (pinnedCite) return;
    const cite = e.target.closest(".glance-ai-cite");
    if (!cite || cite.contains(e.relatedTarget)) return;
    closePop();
  });

  glanceEl.addEventListener("click", (e) => {
    const cite = e.target.closest(".glance-ai-cite");
    if (!cite) return;
    e.preventDefault();
    e.stopPropagation();
    if (pinnedCite === cite) {
      closePop();
      return;
    }
    pinnedCite?.classList.remove("glance-ai-cite--open");
    pinnedCite = cite;
    cite.classList.add("glance-ai-cite--open");
    openPop(cite, true);
  });

  document.addEventListener("click", (e) => {
    if (!pinnedCite || popEl.contains(e.target)) return;
    closePop();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pinnedCite) closePop();
  });

  window.addEventListener("scroll", () => {
    if (pinnedCite) placePop(pinnedCite);
  }, { passive: true });

  const initRail = (box) => {
    const toggle = box.querySelector(".glance-ai-sources-toggle");
    const rail = box.querySelector(".glance-ai-rail");
    if (!toggle || !rail) return;
    toggle.addEventListener("click", () => {
      const open = rail.hidden;
      rail.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    });
  };

  const bootBox = (box) => {
    if (box.dataset.chatInit) return;
    box.dataset.chatInit = "1";
    sources = parseSrcs(box);
    hydrateIcons(box);
    initRail(box);
    if (box.dataset.stream === "1") streamSummary(box);
  };

  const observer = new MutationObserver(() => {
    const box = glanceEl.querySelector(".glance-ai");
    if (box) bootBox(box);
  });
  observer.observe(glanceEl, { childList: true, subtree: true });

  const existing = glanceEl.querySelector(".glance-ai");
  if (existing) bootBox(existing);
})();

