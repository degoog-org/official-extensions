const BASE = window.__DEGOOG_BASE_URL__ ?? "";
const ROUTE = `${BASE}/api/plugin/${__PLUGIN_ID__}`;
const _t = (key, vars) => t(`image-search-command.script.${key}`, vars);
const HF_RE =
  /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/([^/]+)\/(.+)$/;
const MB = 1024 * 1024;
const MAX_THREADS = 4;

const Device = Object.freeze({
  WebGpu: "webgpu",
  Wasm: "wasm",
});

const DEVICE_LABELS = Object.freeze({
  [Device.WebGpu]: "WebGPU",
  [Device.Wasm]: "WebAssembly",
});

const Stage = Object.freeze({
  Runtime: "runtime",
  Model: "model",
  Download: "download",
  Device: "device",
  Source: "source",
  Ready: "ready",
});

const PCT_STAGES = new Set([Stage.Model, Stage.Download]);
const F16_DTYPES = new Set(["fp16", "q4f16"]);
const GPU_F16 = "shader-f16";
const FP32 = "fp32";
const HASH_SIDE = 32;
const HASH_LOW = 8;
const HASH_BITS = HASH_LOW * HASH_LOW;

const WeakMode = Object.freeze({
  Bottom: "bottom",
  Hide: "hide",
  Keep: "keep",
});


const _fetched = new Set();
const _watchers = new Set();
let _runtimePromise = null;
let _clipPromise = null;
let _primed = null;
let _device = Device.Wasm;
let _stage = { key: Stage.Runtime, pct: null, vars: {} };
let _ranker = null;

const _label = (device) => DEVICE_LABELS[device] ?? DEVICE_LABELS[Device.Wasm];

const _mb = (bytes) => Math.max(1, Math.round((bytes ?? 0) / MB));

const _setStage = (key, pct = null, vars = {}) => {
  _stage = { key, pct, vars };
  _watchers.forEach((fn) => fn(_stage));
};

const _watchStage = (fn) => {
  _watchers.add(fn);
  fn(_stage);
  return () => _watchers.delete(fn);
};

const _el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

let _configPromise = null;

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

document.addEventListener("click", (e) => {
  if (!e.target?.closest?.(".image-search-command-pick")) return;
  window.degoog?.pickImage?.();
});

const _waitFor = (selector, timeout = 15000) =>
  new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const obs = new MutationObserver(() => {
      const node = document.querySelector(selector);
      if (!node) return;
      obs.disconnect();
      resolve(node);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });

const _onProgress = (p) => {
  if (!p?.file?.endsWith(".onnx")) return;
  if (p.status === "progress") {
    const key = _fetched.has(p.file) ? Stage.Download : Stage.Model;
    _setStage(key, Math.round(p.progress ?? 0), {
      loaded: _mb(p.loaded),
      total: _mb(p.total),
    });
  }
  if (p.status === "done")
    _setStage(Stage.Device, null, { device: _label(_device) });
};

const _modelFetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  const match = HF_RE.exec(url);
  if (match) {
    const [, repo, revision, file] = match;
    if (!new Headers(init?.headers).has("range")) _fetched.add(file);
    const params = new URLSearchParams({
      f: file,
      m: repo,
      r: decodeURIComponent(revision),
    });
    return fetch(`${ROUTE}/model?${params}`, init);
  }
  const resolved = new URL(url, window.location.href);
  if (
    resolved.origin === window.location.origin ||
    resolved.protocol === "blob:" ||
    resolved.protocol === "data:"
  ) {
    return fetch(input, init);
  }
  return Promise.reject(
    new Error(`image-search blocked an external request to ${url}`),
  );
};

const _runtime = () => {
  _runtimePromise ??= (async () => {
    const T = await import(`${ROUTE}/runtime?f=transformers.min.js`);
    T.env.allowLocalModels = false;
    T.env.useBrowserCache = typeof caches !== "undefined";
    T.env.backends.onnx.wasm.wasmPaths = `${window.location.origin}${ROUTE}/ort/`;
    T.env.backends.onnx.wasm.numThreads = self.crossOriginIsolated
      ? Math.min(MAX_THREADS, navigator.hardwareConcurrency || 1)
      : 1;
    T.env.fetch = _modelFetch;
    return T;
  })();
  _runtimePromise.catch(() => {
    _runtimePromise = null;
  });
  return _runtimePromise;
};

const _loadVision = async (T, cfg, device, dtype) => {
  _device = device;
  _setStage(Stage.Model);
  const vision = await T.CLIPVisionModelWithProjection.from_pretrained(
    cfg.model,
    { revision: cfg.revision, progress_callback: _onProgress, device, dtype },
  );
  return { device, dtype, vision };
};

const _gpuAdapter = (cfg) =>
  cfg.device !== Device.Wasm && navigator.gpu
    ? navigator.gpu.requestAdapter().catch(() => null)
    : null;

const _gpuDtype = (gpu, dtype) =>
  F16_DTYPES.has(dtype) && !gpu.features?.has(GPU_F16) ? FP32 : dtype;

const _pickEngine = async (T, cfg) => {
  const gpu = await _gpuAdapter(cfg);
  if (!gpu && cfg.device === Device.WebGpu)
    throw new Error("WebGPU is not available in this browser");
  if (gpu) {
    try {
      return await _loadVision(T, cfg, Device.WebGpu, _gpuDtype(gpu, cfg.gpuDtype));
    } catch (err) {
      if (cfg.device === Device.WebGpu) throw err;
      console.warn("[image-search] WebGPU unavailable, using WebAssembly", err);
    }
  }
  return _loadVision(T, cfg, Device.Wasm, cfg.wasmDtype);
};

const _textLoader = (T, cfg, engine) => {
  let textModel = null;
  return () => {
    textModel ??= (async () => {
      const loaded = {
        tokenizer: await T.AutoTokenizer.from_pretrained(cfg.model, {
          revision: cfg.revision,
        }),
        model: await T.CLIPTextModelWithProjection.from_pretrained(cfg.model, {
          revision: cfg.revision,
          progress_callback: _onProgress,
          device: engine.device,
          dtype: engine.dtype,
        }),
      };
      _setStage(Stage.Ready);
      return loaded;
    })();
    textModel.catch(() => {
      textModel = null;
    });
    return textModel;
  };
};

const _loadClip = (cfg) => {
  _clipPromise ??= (async () => {
    _setStage(Stage.Runtime);
    const T = await _runtime();
    _setStage(Stage.Model);
    const processor = await T.AutoProcessor.from_pretrained(cfg.model, {
      revision: cfg.revision,
    });
    const engine = await _pickEngine(T, cfg);
    return { T, processor, ...engine, text: _textLoader(T, cfg, engine) };
  })();
  _clipPromise.catch(() => {
    _clipPromise = null;
  });
  return _clipPromise;
};

const _unit = (data, dim, index) => {
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += data[index * dim + i] ** 2;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) out[i] = data[index * dim + i] / norm;
  return out;
};

const _dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

const _embedImages = async (clip, images) => {
  const { image_embeds } = await clip.vision(await clip.processor(images));
  return images.map((_, i) =>
    _unit(image_embeds.data, image_embeds.dims[1], i),
  );
};

const _cosTable = (() => {
  const table = new Float64Array(HASH_LOW * HASH_SIDE);
  for (let u = 0; u < HASH_LOW; u++)
    for (let x = 0; x < HASH_SIDE; x++)
      table[u * HASH_SIDE + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * HASH_SIDE));
  return table;
})();

const _luma = (raw) => {
  const { data, width, height, channels } = raw;
  const out = new Float64Array(HASH_SIDE * HASH_SIDE);
  const count = new Float64Array(HASH_SIDE * HASH_SIDE);
  for (let y = 0; y < height; y++) {
    const row = Math.min(HASH_SIDE - 1, Math.floor((y * HASH_SIDE) / height));
    for (let x = 0; x < width; x++) {
      const col = Math.min(HASH_SIDE - 1, Math.floor((x * HASH_SIDE) / width));
      const i = (y * width + x) * channels;
      const v =
        channels >= 3
          ? 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
          : data[i];
      out[row * HASH_SIDE + col] += v;
      count[row * HASH_SIDE + col]++;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= count[i] || 1;
  return out;
};

const _phash = (raw) => {
  const px = _luma(raw);
  const rows = new Float64Array(HASH_SIDE * HASH_LOW);
  for (let y = 0; y < HASH_SIDE; y++)
    for (let v = 0; v < HASH_LOW; v++) {
      let s = 0;
      for (let x = 0; x < HASH_SIDE; x++)
        s += px[y * HASH_SIDE + x] * _cosTable[v * HASH_SIDE + x];
      rows[y * HASH_LOW + v] = s;
    }
  const dct = new Float64Array(HASH_BITS);
  for (let u = 0; u < HASH_LOW; u++)
    for (let v = 0; v < HASH_LOW; v++) {
      let s = 0;
      for (let y = 0; y < HASH_SIDE; y++)
        s += rows[y * HASH_LOW + v] * _cosTable[u * HASH_SIDE + y];
      dct[u * HASH_LOW + v] = s;
    }
  const median = [...dct.slice(1)].sort((a, b) => a - b)[(HASH_BITS - 1) >> 1];
  return Uint8Array.from(dct, (c) => (c > median ? 1 : 0));
};

const _hashSimilarity = (a, b) => {
  let same = 0;
  for (let i = 0; i < HASH_BITS; i++) if (a[i] === b[i]) same++;
  return same / HASH_BITS;
};

const _embedText = async (clip, text) => {
  const { tokenizer, model } = await clip.text();
  const { text_embeds } = await model(
    tokenizer([text], { padding: true, truncation: true }),
  );
  return _unit(text_embeds.data, text_embeds.dims[1], 0);
};

const _prime = (image) => {
  if (_primed?.image === image) return _primed.promise;
  const promise = (async () => {
    const cfg = await _config();
    const clip = await _loadClip(cfg);
    _setStage(Stage.Source, null, { device: _label(clip.device) });
    const raw = await clip.T.RawImage.fromURL(image);
    const [source] = await _embedImages(clip, [raw]);
    _setStage(Stage.Ready);
    return { cfg, clip, source, hash: _phash(raw) };
  })();
  _primed = { image, promise };
  promise.catch((err) => {
    console.warn("[image-search] could not prepare the ranking model", err);
    if (_primed?.promise === promise) _primed = null;
  });
  return promise;
};

const _warmup = (active) =>
  _prime(active.image)
    .then(({ cfg, clip }) =>
      active.text && cfg.textWeight > 0 ? clip.text() : null,
    )
    .catch((err) => console.warn("[image-search] warm up failed", err));

const _textVec = async ({ cfg, clip }, active) => {
  if (!active.text || cfg.textWeight <= 0) return null;
  try {
    return await _embedText(clip, active.text);
  } catch (err) {
    console.warn("[image-search] could not embed the typed words", err);
    return null;
  }
};

const RANKING_ID = __PLUGIN_ID__;
const RESULTS_EVENT = "degoog-results-ready";
const WATCH_MS = 120;
const SETTLED_EVENT = "degoog-results-settled";
const IMAGE_QUERY_EVENT = "degoog-image-query";

const _resultsApi = (timeout = 10000) =>
  new Promise((resolve) => {
    if (window.degoog?.results) return resolve(window.degoog.results);
    const done = () => resolve(window.degoog?.results ?? null);
    window.addEventListener("degoog-results-api-ready", done, { once: true });
    setTimeout(done, timeout);
  });

const _stopRanker = () => {
  if (!_ranker) return;
  _ranker.stopped = true;
  _ranker.unwatch?.();
  _ranker.unwatchResults?.();
  _ranker.api.setRanking(RANKING_ID, null);
  _ranker.strip?.remove();
  _ranker = null;
};

const _stageText = ({ key, pct, vars }) =>
  pct != null && PCT_STAGES.has(key)
    ? _t(`stages.${key}Pct`, { pct, ...vars })
    : _t(`stages.${key}`, vars);

const _bar = () => {
  const bar = _el("div", "image-search-strip-bar");
  const fill = _el("span", "image-search-strip-fill");
  bar.appendChild(fill);
  const set = (pct) => {
    bar.hidden = pct === false;
    bar.classList.toggle("image-search-strip-bar-busy", pct == null);
    fill.style.width = typeof pct === "number" ? `${pct}%` : "";
  };
  return { bar, set };
};

const _strip = (active, onToggle) => {
  const strip = _el("div", "image-search-strip");
  const thumb = _el("img", "image-search-strip-thumb");
  thumb.src = active.image;
  thumb.alt = "";
  const body = _el("div", "image-search-strip-body");
  const line = _el("div", "image-search-strip-line");
  const setQuery = (query) => {
    line.replaceChildren();
    if (query) {
      const [before, after = ""] = _t("searchedFor").split("{query}");
      line.append(before, _el("code", "image-search-strip-query", query), after);
    } else {
      line.append(_t("searchedWithImage"));
    }
    if (active.text) line.append(` · ${_t("yourWords", { text: active.text })}`);
  };
  setQuery(active.query);
  const status = _el("div", "image-search-strip-status", _stageText(_stage));
  const progress = _bar();
  const toggle = _el("button", "image-search-strip-toggle");
  toggle.type = "button";
  toggle.hidden = true;
  toggle.addEventListener("click", onToggle);
  body.append(line, status, progress.bar);
  strip.append(thumb, body, toggle);
  return { strip, status, toggle, setBar: progress.set, setQuery };
};

const _pool = (items, limit, fn) => {
  const slots = items.map(() => {
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    return { promise, resolve };
  });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      slots[i].resolve(await fn(items[i]).catch(() => null));
    }
  };
  for (let w = 0; w < Math.min(limit, items.length); w++) void worker();
  return slots.map((slot) => slot.promise);
};

const _activeOf = (api) => {
  const { query, type, search, image } = api.current();
  if (!image || type !== "images") return null;
  return {
    key: `${image.id}|${query.trim()}|${search}`,
    id: image.id,
    image: image.dataUrl,
    query: image.query,
    text: query.trim(),
  };
};

const _isActiveSearch = (api, active) => _activeOf(api)?.key === active.key;

const _noResults = () => !!document.querySelector("#results-list .no-results");

const _watchResults = (fn) => {
  let timer = 0;
  const kick = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      fn();
    }, WATCH_MS);
  };
  const list = document.getElementById("results-list");
  const observer = list ? new MutationObserver(kick) : null;
  observer?.observe(list, { childList: true, subtree: true });
  window.addEventListener(RESULTS_EVENT, kick);
  return () => {
    clearTimeout(timer);
    observer?.disconnect();
    window.removeEventListener(RESULTS_EVENT, kick);
  };
};

const _waitForResults = (api, active, fresh, timeout = 20000) =>
  new Promise((resolve) => {
    const ready = () => _isActiveSearch(api, active) && api.list().length > 0;
    const empty = () => _isActiveSearch(api, active) && _noResults();
    if (!fresh && ready()) return resolve(true);
    let timer = 0;
    let unwatch = () => {};
    const finish = () => {
      clearTimeout(timer);
      unwatch();
      resolve(ready());
    };
    unwatch = _watchResults(() => {
      if (ready() || empty()) finish();
    });
    timer = setTimeout(finish, timeout);
  });

const _rankWith = (state, cfg) => {
  const { api, active, scores, ui } = state;

  const thumbs = () => [
    ...new Set(
      api
        .list()
        .map((r) => r.thumbnail)
        .filter(Boolean),
    ),
  ];
  const scoreOf = (r) => (r.thumbnail ? scores.get(r.thumbnail) : undefined);
  const isSame = (s) => s.same >= cfg.sameThreshold;
  const isWeak = (s) => !isSame(s) && s.sim < cfg.matchThreshold;
  const group = (r) => {
    const s = scoreOf(r);
    if (!s) return 2;
    if (isSame(s)) return 0;
    return isWeak(s) ? 3 : 1;
  };

  api.setRanking(RANKING_ID, {
    compare: (a, b) => {
      if (!state.settled || cfg.weakMatches === WeakMode.Keep) return 0;
      return (
        group(a) - group(b) ||
        (scoreOf(b)?.score ?? 0) - (scoreOf(a)?.score ?? 0)
      );
    },
    hidden: (r) => {
      const s = scoreOf(r);
      return (
        cfg.weakMatches === WeakMode.Hide &&
        !state.showHidden &&
        !!s &&
        isWeak(s)
      );
    },
    badge: (r) => {
      const s = scoreOf(r);
      if (!s) return null;
      if (isSame(s)) return { text: _t("same"), tone: "strong" };
      return {
        text: `${Math.round(s.sim * 100)}%`,
        tone: isWeak(s) ? "weak" : undefined,
      };
    },
  });

  const weakKind = () => {
    if (cfg.weakMatches === WeakMode.Hide)
      return state.showHidden ? "shown" : "hidden";
    return cfg.weakMatches === WeakMode.Bottom ? "moved" : "weak";
  };

  const summary = () => {
    const all = thumbs();
    const ranked = all.map((src) => scores.get(src)).filter(Boolean);
    const same = ranked.filter(isSame).length;
    const weak = ranked.filter(isWeak).length;
    const parts = [
      _t("ranked", {
        done: ranked.length,
        total: all.length,
        device: _label(state.device),
      }),
    ];
    if (same) parts.push(_t("copies", { count: same }));
    if (weak) parts.push(_t(weakKind(), { count: weak }));
    ui.status.textContent = parts.join(" · ");
    ui.setBar(false);
    ui.toggle.hidden = !(cfg.weakMatches === WeakMode.Hide && weak);
    ui.toggle.textContent = state.showHidden
      ? _t("hideWeak")
      : _t("showHidden", { count: weak });
  };

  const settle = () => {
    if (state.busy || state.stopped) return;
    if (api.current().settled !== false) {
      summary();
      return;
    }
    ui.status.textContent = _t("rankedSoFar", {
      done: scores.size,
      device: _label(state.device),
    });
    ui.setBar(null);
  };

  const progress = () => {
    const total = thumbs().length;
    ui.status.textContent = _t("ranking", {
      device: _label(state.device),
      done: scores.size,
      total,
    });
    ui.setBar(total ? Math.round((scores.size / total) * 100) : null);
  };

  let primed;
  let textVec = null;

  const score = (src, vec, raw) => {
    const sim = _dot(vec, primed.source);
    scores.set(src, {
      sim,
      same: _hashSimilarity(_phash(raw), primed.hash),
      score: sim + (textVec ? cfg.textWeight * _dot(vec, textVec) : 0),
    });
  };

  const batches = async (todo, pending) => {
    for (let i = 0; i < todo.length && !state.stopped; i += cfg.batchSize) {
      const slice = todo.slice(i, i + cfg.batchSize);
      const loaded = await Promise.all(pending.slice(i, i + cfg.batchSize));
      const ok = slice.filter((_, k) => loaded[k]);
      const raws = loaded.filter(Boolean);
      if (ok.length) {
        const vecs = await _embedImages(primed.clip, raws);
        ok.forEach((src, k) => score(src, vecs[k], raws[k]));
      }
      for (const src of slice.filter((_, k) => !loaded[k]))
        scores.set(src, { sim: 0, same: 0, score: -1 });
      api.refresh();
      progress();
    }
  };

  const rank = async () => {
    if (state.stopped) return;
    if (state.busy) {
      state.again = true;
      return;
    }
    if (!_isActiveSearch(api, active)) {
      _stopRanker();
      return;
    }
    state.busy = true;
    try {
      const T = await _runtime();
      const todo = thumbs().filter((src) => !scores.has(src));
      if (!todo.length) return;
      state.settled = false;
      const pending = _pool(todo, cfg.fetchConcurrency, (src) =>
        T.RawImage.fromURL(src),
      );
      if (!primed) {
        primed = await _prime(active.image);
        textVec = await _textVec(primed, active);
        state.device = primed.clip.device;
      }
      state.ranking = true;
      progress();
      await batches(todo, pending);
      if (!state.stopped) {
        state.settled = true;
        api.refresh();
      }
    } catch (err) {
      console.error("[image-search]", err);
      ui.status.textContent = _t("rankFailed");
      ui.setBar(false);
    } finally {
      state.busy = false;
      if (state.again && !state.stopped) {
        state.again = false;
        void rank();
      } else if (state.settled) {
        settle();
      }
    }
  };

  return { rank, thumbs, summary, settle };
};

const _startRanker = async (api, active, fresh) => {
  const state = {
    api,
    active,
    scores: new Map(),
    stopped: false,
    busy: false,
    again: false,
    ranking: false,
    settled: false,
    showHidden: false,
    device: "",
    ui: null,
    strip: null,
    unwatch: null,
    unwatchResults: null,
  };
  _ranker = state;

  const list = await _waitFor("#results-list");
  if (!list || state.stopped) return;

  let ranker = null;
  state.ui = _strip(active, () => {
    state.showHidden = !state.showHidden;
    api.refresh();
    ranker?.summary();
  });
  state.strip = state.ui.strip;
  list.before(state.strip);
  state.unwatch = _watchStage((stage) => {
    if (state.ranking) return;
    const waiting = stage.key === Stage.Ready && api.list().length > 0;
    state.ui.status.textContent = waiting
      ? _t("stages.readyResults", { count: api.list().length })
      : _stageText(stage);
    state.ui.setBar(stage.key === Stage.Ready ? null : stage.pct);
  });

  if (!(await _waitForResults(api, active, fresh))) {
    if (_ranker === state) _stopRanker();
    return;
  }
  if (state.stopped) return;

  let cfg;
  try {
    cfg = await _config();
  } catch (err) {
    console.error("[image-search] could not load the ranking settings", err);
    state.ui.status.textContent = _t("rankFailed");
    state.ui.setBar(false);
    return;
  }

  ranker = _rankWith(state, cfg);
  state.unwatchResults = _watchResults(() => {
    if (!_isActiveSearch(api, active)) {
      _stopRanker();
      return;
    }
    if (ranker.thumbs().some((src) => !state.scores.has(src)))
      void ranker.rank();
  });
  const onSettled = () => {
    if (_isActiveSearch(api, active) && state.settled) ranker.settle();
  };
  window.addEventListener(SETTLED_EVENT, onSettled);
  const unwatchResults = state.unwatchResults;
  state.unwatchResults = () => {
    unwatchResults();
    window.removeEventListener(SETTLED_EVENT, onSettled);
  };
  if (ranker.thumbs().length) void ranker.rank();
};

const _sync = async () => {
  const api = await _resultsApi();
  if (!api) return;
  const active = _activeOf(api);
  if (!active) {
    _stopRanker();
    return;
  }
  if (_ranker?.active.key === active.key) return;
  const cfg = await _config().catch(() => null);
  if (!cfg?.rank || _ranker?.active.key === active.key) return;
  _stopRanker();
  void _warmup(active);
  void _startRanker(api, active, false);
};

window.addEventListener(RESULTS_EVENT, () => void _sync());
window.addEventListener(IMAGE_QUERY_EVENT, (e) => {
  if (!_ranker) return;
  _ranker.active.query = e.detail?.query ?? null;
  _ranker.ui?.setQuery(_ranker.active.query);
});

void _sync();
