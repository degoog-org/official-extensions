const HF_RE = /^https:\/\/huggingface\.co\/[^/]+\/[^/]+\/resolve\/[^/]+\/(.+)$/;
const NOISE_RE = /\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪+/g;

let _asr = null;
let _route = "";
let _cfg = null;
const _queue = [];
let _running = false;

const _post = (msg) => self.postMessage(msg);

const _load = async () => {
  const T = await import(`${_route}/runtime?f=transformers.min.js`);
  T.env.allowLocalModels = false;
  T.env.useBrowserCache = true;
  T.env.backends.onnx.wasm.wasmPaths = `${_route}/ort/`;
  T.env.backends.onnx.wasm.numThreads = 1;
  const origin = new URL(_route).origin;
  T.env.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const match = HF_RE.exec(url);
    if (match) return fetch(`${_route}/model?f=${encodeURIComponent(match[1])}`, init);
    const resolved = new URL(url, self.location.href);
    if (resolved.origin === origin || resolved.protocol === "blob:" || resolved.protocol === "data:") {
      return fetch(input, init);
    }
    return Promise.reject(new Error(`voice-search blocked an external request to ${url}`));
  };
  const files = new Map();
  const progress = (p) => {
    if (p?.status !== "progress" || !p.file?.endsWith(".onnx")) return;
    files.set(p.file, [p.loaded ?? 0, p.total ?? 0]);
    let loaded = 0;
    let total = 0;
    for (const [l, t] of files.values()) {
      loaded += l;
      total += t;
    }
    if (total) _post({ type: "progress", pct: Math.round((loaded / total) * 100) });
  };
  const load = async (device, dtype) => ({
    device,
    pipe: await T.pipeline("automatic-speech-recognition", _cfg.model, {
      revision: _cfg.revision,
      device,
      dtype,
      progress_callback: progress,
    }),
  });
  const gpu = _cfg.device !== "wasm" && self.navigator?.gpu ? await self.navigator.gpu.requestAdapter().catch(() => null) : null;
  if (gpu) {
    try {
      return await load("webgpu", _cfg.gpuDtype);
    } catch (err) {
      if (_cfg.device === "webgpu") throw err;
      console.warn("[voice-search] WebGPU unavailable, using WebAssembly", err);
    }
  } else if (_cfg.device === "webgpu") {
    throw new Error("WebGPU is not available in this browser");
  }
  return load("wasm", _cfg.wasmDtype);
};

const _clean = (text) =>
  String(text ?? "")
    .replace(NOISE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

const _transcribe = async ({ id, audio, preview, language }) => {
  const { pipe } = await _asr;
  const english = /\.en$/i.test(_cfg.model);
  const out = await pipe(audio, english ? {} : { language: language || null, task: "transcribe" });
  _post({ type: "result", id, preview, text: _clean(out?.text) });
};

const _drain = async () => {
  if (_running) return;
  _running = true;
  while (_queue.length) {
    const job = _queue.shift();
    if (job.preview && _queue.length) continue;
    try {
      await _transcribe(job);
    } catch (err) {
      _post({ type: "error", id: job.id, preview: job.preview, message: err?.message ?? String(err) });
    }
  }
  _running = false;
};

self.onmessage = (e) => {
  const msg = e.data ?? {};
  if (msg.type === "load") {
    if (_asr) return;
    _route = msg.route;
    _cfg = msg.cfg;
    _asr = _load();
    _asr.then(
      ({ device }) => _post({ type: "ready", device }),
      (err) => {
        _asr = null;
        _post({ type: "error", fatal: true, message: err?.message ?? String(err) });
      },
    );
    return;
  }
  if (msg.type === "transcribe") {
    _queue.push(msg);
    void _drain();
  }
};
