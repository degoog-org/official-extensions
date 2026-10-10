const BASE = window.__DEGOOG_BASE_URL__ ?? "";
const ROUTE = `${BASE}/api/plugin/${__PLUGIN_ID__}`;
const ACTION_ID = `${__PLUGIN_ID__}-mic`;
const _t = (key, vars) => t(`voice-search-command.script.${key}`, vars);
const FALLBACK = {
  triggerWord: "search",
  language: "",
  silenceSeconds: 8,
  searchOnSilence: false,
  livePreview: true,
  previewMs: 1200,
  pauseMs: 700,
  maxPhraseSeconds: 15,
  vadThreshold: 3,
  colors: ["var(--brand-blue)", "var(--danger)", "var(--brand-yellow)", "var(--success)"],
};
const IDLE_LEVEL = 0.07;
const CHUNK_MS = 50;
const PREROLL_CHUNKS = 6;
const WARMUP_CHUNKS = 5;
const MIN_RMS = 0.006;
const MIN_SPEECH_MS = 250;
const MIN_PREVIEW_SPEECH_MS = 400;

let _session = null;
let _configPromise = null;
let _worker = null;
const _model = { ready: false, pct: null, device: "" };

const _el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const _barFor = (node) => node?.closest?.(".degoog-search-bar") ?? null;

const _inputFor = (bar) => bar?.querySelector("#search-input, #results-search-input") ?? null;

const _pageBar = () =>
  document.getElementById("results-search-bar") ?? _barFor(document.getElementById("search-input"));

const _toast = (message) => {
  const node = _el("div", "voice-search-toast", message);
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3500);
};

const _config = () => {
  _configPromise ??= fetch(`${ROUTE}/config`).then((res) => {
    if (!res.ok) throw new Error(`config HTTP ${res.status}`);
    return res.json();
  });
  _configPromise.catch(() => {
    _configPromise = null;
  });
  return _configPromise;
};

const _normWord = (word) => word.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "");

const _stripTrigger = (text, trigger) => {
  const words = text.trim().split(/\s+/).filter((w) => _normWord(w));
  const wanted = trigger.split(" ");
  if (words.length <= wanted.length) return null;
  const tail = words.slice(-wanted.length).map(_normWord);
  if (!tail.every((w, i) => w === wanted[i])) return null;
  return words
    .slice(0, -wanted.length)
    .join(" ")
    .replace(/[\s.,!?;:]+$/, "");
};

const _leadingBangs = (value) => {
  const tokens = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  const out = [];
  while (tokens.length && /^!\S+$/.test(tokens[0])) out.push(tokens.shift());
  return out.join(" ");
};

const _join = (...parts) => parts.map((p) => p.trim()).filter(Boolean).join(" ");

const _resolveColors = (bar, colors) => {
  const probe = _el("span");
  probe.style.display = "none";
  bar.appendChild(probe);
  const out = colors.map((c) => {
    probe.style.color = "";
    probe.style.color = c;
    return getComputedStyle(probe).color;
  });
  probe.remove();
  return out;
};

const _language = (cfg) => {
  const tag = cfg.language || document.documentElement.lang || navigator.language || "";
  return tag.split("-")[0].toLowerCase();
};

const _concat = (chunks) => {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
};

const _ensureWorker = (cfg) => {
  if (_worker) return;
  _worker = new Worker(`${ROUTE}/worker.js`, { type: "module" });
  _worker.onmessage = (e) => {
    const msg = e.data ?? {};
    if (msg.type === "progress") _model.pct = msg.pct;
    if (msg.type === "ready") {
      _model.ready = true;
      _model.device = msg.device;
    }
    if (msg.type === "error" && msg.fatal) {
      console.error("[voice-search]", msg.message);
      _worker?.terminate();
      _worker = null;
      _model.ready = false;
      _model.pct = null;
    }
    _session?.onWorker(msg);
  };
  _worker.onerror = (e) => {
    console.error("[voice-search]", e.message ?? e);
    _worker?.terminate();
    _worker = null;
    _session?.onWorker({ type: "error", fatal: true });
  };
  _worker.postMessage({
    type: "load",
    route: new URL(ROUTE, window.location.href).href,
    cfg: {
      model: cfg.model,
      revision: cfg.revision,
      device: cfg.device,
      gpuDtype: cfg.gpuDtype,
      wasmDtype: cfg.wasmDtype,
    },
  });
};

const _openMic = async (ctx, onChunk) => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  try {
    await ctx.audioWorklet.addModule(`${ROUTE}/capture.js`);
    const node = new AudioWorkletNode(ctx, "voice-search-capture");
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(node);
    node.connect(mute).connect(ctx.destination);
    node.port.onmessage = (e) => onChunk(e.data.samples, e.data.rms);
    void ctx.resume();
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  }
  return () => {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
};

const _wave = (canvas, colors, levelOf) => {
  const ctx = canvas.getContext("2d");
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let level = IDLE_LEVEL;
  let frame = 0;
  const draw = (t) => {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    level += (Math.max(IDLE_LEVEL, levelOf()) - level) * 0.18;
    const mid = h / 2;
    const time = still ? 0 : t / 1000;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, mid - dpr / 2, w, dpr);
    colors.forEach((color, i) => {
      const amp = mid * 0.9 * level * (0.65 + 0.35 * Math.sin(time * (1.1 + i * 0.37) + i * 2.1));
      const freq = 1.6 + i * 0.45;
      const phase = time * (3.2 + i * 0.7) + i * 1.7;
      const step = Math.max(2, Math.round(w / 160));
      const ys = [];
      for (let x = 0; x <= w; x += step) {
        const nx = (x / w) * 2 - 1;
        const env = (1 - nx * nx) ** 2;
        ys.push([x, amp * env * Math.sin(nx * freq * Math.PI + phase)]);
      }
      ctx.beginPath();
      ys.forEach(([x, y], k) => (k ? ctx.lineTo(x, mid + y) : ctx.moveTo(x, mid + y)));
      for (let k = ys.length - 1; k >= 0; k--) ctx.lineTo(ys[k][0], mid - ys[k][1] * 0.6);
      ctx.closePath();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ys.forEach(([x, y], k) => (k ? ctx.lineTo(x, mid + y) : ctx.moveTo(x, mid + y)));
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = color;
      ctx.stroke();
    });
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(frame);
};

const _panel = (cfg, onStop) => {
  const panel = _el("div", "voice-search-panel");
  const canvas = _el("canvas", "voice-search-wave");
  const transcript = _el("div", "voice-search-transcript");
  const heard = _el("span", "voice-search-heard");
  const interim = _el("span", "voice-search-interim");
  transcript.append(heard, interim);
  const footer = _el("div", "voice-search-footer");
  const hint = _el("span", "voice-search-hint");
  const [before, after = ""] = _t("hint").split("{word}");
  hint.append(before, _el("strong", "", `"${cfg.triggerWord}"`), after);
  const stop = _el("button", "voice-search-stop", _t("stop"));
  stop.type = "button";
  stop.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onStop();
  });
  footer.append(hint, stop);
  panel.append(canvas, transcript, footer);
  return { panel, canvas, heard, interim };
};

const _micButtons = (bar) =>
  bar ? bar.querySelectorAll(`.search-bar-action-btn[data-action-id="${CSS.escape(ACTION_ID)}"]`) : [];

const _stop = ({ restore = true } = {}) => {
  const s = _session;
  if (!s) return;
  _session = null;
  clearTimeout(s.silenceTimer);
  s.stopWave?.();
  s.closeMic?.();
  s.bar.classList.remove("voice-search-listening");
  _micButtons(s.bar).forEach((b) => b.classList.remove("voice-search-active"));
  s.ui.panel.classList.add("voice-search-panel--closing");
  setTimeout(() => s.ui.panel.remove(), 220);
  document.removeEventListener("keydown", s.onKey, true);
  if (restore && !s.committed) s.input.value = s.original;
};

const _submit = (s, query) => {
  const { input } = s;
  _stop({ restore: false });
  input.value = _join(s.prefix, query);
  if (input.id === "search-input") input.closest("form")?.requestSubmit();
  else document.getElementById("results-search-btn")?.click();
};

const _start = async (bar) => {
  const input = _inputFor(bar);
  if (!bar || !input) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
    _toast(_t("insecure"));
    return;
  }
  const audio = new (window.AudioContext ?? window.webkitAudioContext)();
  void audio.resume();
  let cfg;
  try {
    cfg = { ...FALLBACK, ...(await _config()) };
  } catch {
    void audio.close();
    _toast(_t("unavailable"));
    return;
  }

  const s = {
    bar,
    input,
    original: input.value,
    prefix: _leadingBangs(input.value),
    committed: "",
    interim: "",
    level: 0,
    seq: 0,
    pendingFinals: 0,
    previewBusy: false,
    lastPreview: 0,
    silenceTimer: 0,
    closeMic: null,
    stopWave: null,
    onKey: null,
    onWorker: null,
    ui: _panel(cfg, () => _stop()),
  };
  const vad = { floor: 0, chunks: 0, active: false, phrase: [], preroll: [], speechMs: 0, silentMs: 0 };
  _session = s;

  const render = () => {
    s.ui.heard.textContent = s.committed;
    let interim = s.interim || (s.pendingFinals ? "…" : "");
    let idle = false;
    if (!interim && !s.committed) {
      idle = true;
      interim = _model.ready
        ? _t("listening")
        : _model.pct != null
          ? _t("loadingPct", { pct: _model.pct })
          : _t("loading");
    }
    s.ui.interim.textContent = interim;
    s.ui.interim.classList.toggle("voice-search-interim--idle", idle);
    input.value = _join(s.prefix, s.committed, s.interim);
    input.scrollLeft = input.scrollWidth;
  };

  const armSilence = () => {
    clearTimeout(s.silenceTimer);
    if (!cfg.silenceSeconds) return;
    s.silenceTimer = setTimeout(() => {
      if (_session !== s) return;
      if (vad.active || s.pendingFinals) {
        armSilence();
        return;
      }
      if (cfg.searchOnSilence && s.committed) _submit(s, _stripTrigger(s.committed, cfg.triggerWord) ?? s.committed);
      else _stop();
    }, cfg.silenceSeconds * 1000);
  };

  const send = (audio, preview) => {
    if (!_worker) return;
    const id = ++s.seq;
    if (preview) s.previewBusy = true;
    else s.pendingFinals++;
    _worker?.postMessage({ type: "transcribe", id, audio, preview, language: _language(cfg) }, [audio.buffer]);
  };

  const endPhrase = () => {
    const { phrase, speechMs } = vad;
    vad.active = false;
    vad.phrase = [];
    vad.preroll = [];
    if (speechMs < MIN_SPEECH_MS) {
      s.interim = "";
      render();
      return;
    }
    send(_concat(phrase), false);
    render();
  };

  const onChunk = (samples, rms) => {
    if (_session !== s) return;
    s.level = Math.min(1, rms * 8);
    vad.chunks++;
    if (vad.chunks === 1) vad.floor = rms;
    const threshold = Math.max(MIN_RMS, vad.floor * cfg.vadThreshold);
    const loud = vad.chunks > WARMUP_CHUNKS && rms > threshold;
    if (!vad.active) {
      vad.preroll.push(samples);
      if (vad.preroll.length > PREROLL_CHUNKS) vad.preroll.shift();
      if (!loud) {
        vad.floor = rms < vad.floor ? vad.floor * 0.7 + rms * 0.3 : vad.floor * 0.99 + rms * 0.01;
        return;
      }
      vad.active = true;
      vad.phrase = vad.preroll;
      vad.preroll = [];
      vad.speechMs = CHUNK_MS;
      vad.silentMs = 0;
      armSilence();
      return;
    }
    vad.phrase.push(samples);
    if (loud) {
      vad.speechMs += CHUNK_MS;
      vad.silentMs = 0;
      armSilence();
    } else {
      vad.silentMs += CHUNK_MS;
    }
    if (vad.silentMs >= cfg.pauseMs || vad.phrase.length * CHUNK_MS >= cfg.maxPhraseSeconds * 1000) {
      endPhrase();
      return;
    }
    const now = performance.now();
    if (
      cfg.livePreview &&
      _model.ready &&
      !s.pendingFinals &&
      !s.previewBusy &&
      vad.speechMs >= MIN_PREVIEW_SPEECH_MS &&
      now - s.lastPreview >= cfg.previewMs
    ) {
      s.lastPreview = now;
      send(_concat(vad.phrase), true);
    }
  };

  s.onWorker = (msg) => {
    if (_session !== s) return;
    if (msg.type === "error" && msg.fatal) {
      _toast(_t("modelFailed"));
      _stop();
      return;
    }
    if (msg.type === "error") {
      console.error("[voice-search]", msg.message);
      if (msg.preview) s.previewBusy = false;
      else s.pendingFinals = Math.max(0, s.pendingFinals - 1);
      render();
      return;
    }
    if (msg.type !== "result") {
      render();
      return;
    }
    if (msg.preview) {
      s.previewBusy = false;
      if (!s.pendingFinals && vad.active) s.interim = msg.text;
      render();
      return;
    }
    s.pendingFinals = Math.max(0, s.pendingFinals - 1);
    s.interim = "";
    if (msg.text) s.committed = _join(s.committed, msg.text);
    render();
    armSilence();
    if (s.pendingFinals || !msg.text) return;
    const query = _stripTrigger(s.committed, cfg.triggerWord);
    if (query) _submit(s, query);
  };

  s.onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      _stop();
      return;
    }
    if (e.target === input && !["Shift", "Control", "Alt", "Meta"].includes(e.key)) {
      s.interim = "";
      render();
      _stop({ restore: false });
    }
  };
  document.addEventListener("keydown", s.onKey, true);

  bar.appendChild(s.ui.panel);
  bar.classList.add("voice-search-listening");
  _micButtons(bar).forEach((b) => b.classList.add("voice-search-active"));
  render();
  const colors = _resolveColors(bar, cfg.colors?.length ? cfg.colors : FALLBACK.colors);
  s.stopWave = _wave(s.ui.canvas, colors, () => s.level);

  try {
    _ensureWorker(cfg);
  } catch (err) {
    console.error("[voice-search]", err);
    _toast(_t("workerFailed"));
    void audio.close();
    _stop();
    return;
  }

  try {
    const close = await _openMic(audio, onChunk);
    if (_session === s) s.closeMic = close;
    else close();
  } catch (err) {
    console.error("[voice-search]", err);
    void audio.close();
    _toast(
      err?.name === "NotAllowedError"
        ? _t("micBlocked")
        : err?.name === "NotFoundError"
          ? _t("noMic")
          : _t("micFailed"),
    );
    if (_session === s) _stop();
    return;
  }
  armSilence();
};

const _toggle = (bar) => {
  if (_session) {
    const same = _session.bar === bar;
    _stop();
    if (same) return;
  }
  void _start(bar);
};

window.addEventListener("search-bar-action", (e) => {
  if (e.detail?.actionId !== ACTION_ID) return;
  _toggle(_barFor(e.detail.input) ?? _pageBar());
});

document.addEventListener("click", (e) => {
  if (!e.target?.closest?.(".voice-search-command-start")) return;
  _toggle(_pageBar());
});
