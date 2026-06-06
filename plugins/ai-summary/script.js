(function () {
  const glanceEl = document.getElementById("at-a-glance");
  if (!glanceEl) return;

  const API_BASE = `/api/plugin/${__PLUGIN_ID__}`;
  const SUMMARY_URL = `${API_BASE}/stream`;
  const CHAT_URL = `${API_BASE}/chat`;
  const MAX_SOURCES = 6;
  const FAVICON_BASE = "https://www.google.com/s2/favicons";

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
    return host ? `${FAVICON_BASE}?domain=${encodeURIComponent(host)}&sz=32` : "";
  };

  const citeHtml = (n) => {
    const map = new Map(sources.map((s) => [s.i, s]));
    const src = map.get(parseInt(n, 10));
    if (!src) return escapeHtml(`[${n}]`);
    const fav = faviconFor(src.u);
    const host = src.h || hostOf(src.u);
    return (
      `<a class="degoog-badge glance-ai-cite" href="${escapeHtml(src.u)}" ` +
      `data-cite-n="${escapeHtml(n)}" target="_blank" rel="noopener">` +
      (fav ? `<img class="glance-ai-cite-favicon" src="${escapeHtml(fav)}" alt="" width="12" height="12">` : "") +
      `<span class="glance-ai-cite-n">[${escapeHtml(n)}]</span>` +
      (host ? `<span class="glance-ai-cite-host">${escapeHtml(host)}</span>` : "") +
      "</a>"
    );
  };

  const injectCites = (text) => {
    if (!sources.length) return text;
    const srcMap = new Map(sources.map((s) => [s.i, s]));
    const seenHosts = new Set();
    return text.replace(/\[N?\d+(?:[,\s]+N?\d+)*\]/g, (bracket) =>
      (bracket.match(/\d+/g) || [])
        .filter((n) => {
          const src = srcMap.get(parseInt(n, 10));
          const key = src ? (src.h || src.u) : n;
          if (seenHosts.has(key)) return false;
          seenHosts.add(key);
          return true;
        })
        .map(citeHtml)
        .join(""),
    );
  };

  const renderRich = (text) => {
    const withCites = injectCites(text);
    const md = window.__degoogMd;
    if (md) return md.block(withCites);
    return escapeHtml(withCites).replace(/\n/g, "<br>");
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
      } catch {}
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
    if (!target) return;

    let streamDone = false;
    let expandClicked = false;
    let expanded = false;

    const collapse = () => {
      expanded = false;
      if (bodyEl) bodyEl.classList.add("glance-ai-body--clamped");
      if (expandBtn) expandBtn.hidden = false;
      const chatWrap = box.querySelector(".glance-ai-chat");
      if (chatWrap) chatWrap.hidden = true;
    };

    const onDocClick = (e) => {
      if (expanded && !box.contains(e.target)) collapse();
    };

    document.addEventListener("click", onDocClick, { capture: true });

    if (expandBtn && bodyEl) {
      expandBtn.addEventListener("click", () => {
        expandClicked = true;
        expanded = true;
        bodyEl.classList.remove("glance-ai-body--clamped");
        expandBtn.hidden = true;
        if (streamDone) openChat(box);
      });
    }

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
          if (!bodyEl || !expandBtn || bodyEl.scrollHeight <= MAX_SUMMARY_HEIGHT) {
            if (bodyEl) bodyEl.classList.remove("glance-ai-body--clamped");
            if (expandBtn) expandBtn.hidden = true;
            openChat(box);
            return;
          }
          if (expandClicked) openChat(box);
        });
      },
      onFail: (msg) => {
        streamDone = true;
        target.dataset.state = "error";
        target.textContent = msg;
        if (bodyEl) bodyEl.classList.remove("glance-ai-body--clamped");
        if (expandBtn) expandBtn.hidden = true;
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
    reply.innerHTML = skeletonHtml();
    messagesEl.appendChild(reply);

    await runStream({
      url: CHAT_URL,
      payload: { messages: history },
      target: reply,
      thinkAnchor: reply,
      thinkPos: "before",
      onFirstText: () => {
        reply.innerHTML = writingHtml();
      },
      onComplete: (out) => {
        history.push({ role: "assistant", content: out });
        reply.innerHTML = renderRich(out);
      },
      onFail: (msg) => {
        reply.remove();
        const err = document.createElement("div");
        err.className = "glance-ai-typing";
        err.textContent = msg;
        messagesEl.appendChild(err);
      },
    });
    input.focus();
  };

  const tooltipEl = (() => {
    const el = document.createElement("div");
    el.className = "glance-ai-tooltip";
    document.body.appendChild(el);
    return el;
  })();

  const hideTooltip = () => tooltipEl.classList.remove("glance-ai-tooltip--visible");

  const showTooltip = (cite) => {
    const n = parseInt(cite.dataset.citeN || "0", 10);
    const src = new Map(sources.map((s) => [s.i, s])).get(n);
    if (!src) return;
    const fav = faviconFor(src.u);
    const host = src.h || hostOf(src.u);
    tooltipEl.innerHTML =
      '<div class="glance-ai-tooltip-head">' +
      (fav ? `<img src="${escapeHtml(fav)}" width="12" height="12" class="glance-ai-cite-favicon" alt="">` : "") +
      `<span class="glance-ai-tooltip-host">${escapeHtml(host)}</span>` +
      "</div>" +
      (src.t ? `<div class="glance-ai-tooltip-title">${escapeHtml(src.t)}</div>` : "") +
      (src.s ? `<div class="glance-ai-tooltip-snippet">${escapeHtml(src.s)}</div>` : "");
    tooltipEl.classList.add("glance-ai-tooltip--visible");
    requestAnimationFrame(() => {
      const anchor = cite.getBoundingClientRect();
      const tt = tooltipEl.getBoundingClientRect();
      const spaceAbove = anchor.top - 8;
      const top = spaceAbove >= tt.height
        ? anchor.top - tt.height - 6
        : anchor.bottom + 6;
      const left = Math.min(
        Math.max(anchor.left, 8),
        window.innerWidth - tt.width - 8,
      );
      tooltipEl.style.top = top + "px";
      tooltipEl.style.left = left + "px";
    });
  };

  let activeCite = null;
  glanceEl.addEventListener("mouseover", (e) => {
    const cite = e.target.closest(".glance-ai-cite");
    if (cite === activeCite) return;
    activeCite = cite;
    if (cite) showTooltip(cite);
    else hideTooltip();
  });
  glanceEl.addEventListener("mouseout", (e) => {
    const cite = e.target.closest(".glance-ai-cite");
    if (!cite || cite.contains(e.relatedTarget)) return;
    activeCite = null;
    hideTooltip();
  });

  const bootBox = (box) => {
    if (box.dataset.chatInit) return;
    box.dataset.chatInit = "1";
    sources = parseSrcs(box);
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
