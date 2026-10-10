import { createHash } from "node:crypto";
import { mkdir, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const LOG_NS = "voice-search";
const AUTO = "auto";
const TRANSFORMERS_PKG = "@huggingface/transformers";
const ORT_PKG = "onnxruntime-web";
const TRANSFORMERS_FILE = "transformers.min.js";
const ORT_FILES = [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jspi.mjs",
  "ort-wasm-simd-threaded.jspi.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
];
const RUNTIME_NAMES = [TRANSFORMERS_FILE, ...ORT_FILES];

const DEFAULT_CHECKSUMS = [
  "transformers.min.js 1475fd440e9932ab206682ee42cb18f6097403e9ee77ea62084c592d0f83597d",
  "ort-wasm-simd-threaded.mjs c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f",
  "ort-wasm-simd-threaded.wasm 06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3",
  "ort-wasm-simd-threaded.jsep.mjs c2f80e915e9df63289788a99d434d8c4e00e64e9c1f030f4b80b022458dd2c99",
  "ort-wasm-simd-threaded.jsep.wasm 62ff86b2f2fa3a79eb87a7e4720e8ea9051942bf975f314181bf7dcef2feac06",
  "ort-wasm-simd-threaded.jspi.mjs 6b37a3974dbd96a752fdc1805e1bdc2dca3ead7e380703c092240c2352c71dbf",
  "ort-wasm-simd-threaded.jspi.wasm 173146c55eb8c7e01f8be3f7b7376fbde14118d91607583ab7caf4feac98e59c",
  "ort-wasm-simd-threaded.asyncify.mjs 0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611",
  "ort-wasm-simd-threaded.asyncify.wasm 49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082",
].join("\n");

const DTYPE_SUFFIX = {
  fp32: "",
  fp16: "_fp16",
  q8: "_quantized",
  int8: "_int8",
  uint8: "_uint8",
  q4: "_q4",
  q4f16: "_q4f16",
  bnb4: "_bnb4",
};
const DTYPES = Object.keys(DTYPE_SUFFIX);
const DEVICES = [AUTO, "webgpu", "wasm"];
const SESSIONS = ["encoder_model", "decoder_model_merged"];
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const REV_RE = /^[\w.-]{1,64}$/;
const VERSION_RE = /^[\w.+-]{1,64}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const LANG_RE = /^[a-z]{2,3}$/i;
const MODEL_FILE_RE = /^(onnx\/)?[\w.-]+\.(json|txt|onnx|onnx_data)$/;
const MODEL_CONFIG_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
];
const BRAND_COLORS = [
  "var(--brand-blue)",
  "var(--danger)",
  "var(--brand-yellow)",
  "var(--success)",
];
const COLOR_RE =
  /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|rgba|hsl|hsla|oklch|var)\([\w\s,.%#/-]+\))$/i;
const MAX_COLORS = 6;
const MAX_TRIGGER_CHARS = 40;

const DEFAULTS = {
  triggerWord: "search",
  language: "",
  silenceSeconds: 8,
  searchOnSilence: false,
  livePreview: true,
  previewMs: 1200,
  pauseMs: 700,
  maxPhraseSeconds: 15,
  vadThreshold: 3,
  model: "onnx-community/whisper-base",
  revision: "1846881b6b3a3024392c1eea3ad983695bc23925",
  device: AUTO,
  gpuEncoderDtype: "fp32",
  gpuDecoderDtype: "q4",
  wasmEncoderDtype: "q8",
  wasmDecoderDtype: "q8",
  modelHost: "https://huggingface.co",
  runtimeHost: "https://cdn.jsdelivr.net/npm",
  transformersVersion: "4.3.0",
  ortVersion: "",
  checksums: DEFAULT_CHECKSUMS,
  waveColors: "",
};

let _settings = { ...DEFAULTS };
let _ortVersion = "";
let _checksums = new Map();
let _ready = Promise.resolve();
let _workerSource = "";
let _captureSource = "";
const _cacheDir = join(
  process.env.DEGOOG_DATA_DIR || join(process.cwd(), "data"),
  "cache",
  "voice-search",
);
const _downloads = new Map();
const _model = { repo: DEFAULTS.model, revision: DEFAULTS.revision };

const _json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const _escHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const _str = (v, fallback) =>
  typeof v === "string" && v.trim() ? v.trim() : fallback;

const _num = (v, fallback, min, max) => {
  const n = Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const _bool = (v, fallback) =>
  v === true || v === "true"
    ? true
    : v === false || v === "false"
      ? false
      : fallback;

const _pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

const _host = (v, fallback) => _str(v, fallback).replace(/\/+$/, "");

const _colors = (raw) => {
  const list = String(raw ?? "")
    .split(/[\n;]|,(?![^(]*\))/)
    .map((c) => c.trim())
    .filter((c) => COLOR_RE.test(c))
    .slice(0, MAX_COLORS);
  return list.length ? list : BRAND_COLORS;
};

const _trigger = (raw) =>
  _str(raw, DEFAULTS.triggerWord)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TRIGGER_CHARS) || DEFAULTS.triggerWord;

const _parseChecksums = (text) => {
  const map = new Map();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const [name, sha] = line.trim().split(/\s+/);
    if (RUNTIME_NAMES.includes(name) && SHA_RE.test(sha?.toLowerCase() ?? ""))
      map.set(name, sha.toLowerCase());
  }
  return map;
};

const _resolveRevision = async (repo, revision) => {
  const lookup = async (rev) => {
    const res = await fetch(
      `${_settings.modelHost}/api/models/${repo}/revision/${encodeURIComponent(rev)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const sha = (await res.json())?.sha;
    return typeof sha === "string" && REV_RE.test(sha) ? sha : rev;
  };
  try {
    const sha = await lookup(revision);
    if (sha) return sha;
    if (revision !== "main") {
      console.warn(
        LOG_NS,
        `${repo} has no revision ${revision}, using the latest commit on main`,
      );
      return (await lookup("main")) ?? "main";
    }
  } catch (err) {
    console.warn(
      LOG_NS,
      `could not resolve ${repo}@${revision}`,
      err?.message ?? err,
    );
  }
  return revision;
};

const _resolveOrt = async () => {
  if (_settings.ortVersion) return _settings.ortVersion;
  try {
    const res = await fetch(
      `${_settings.runtimeHost}/${TRANSFORMERS_PKG}@${_settings.transformersVersion}/package.json`,
      { signal: AbortSignal.timeout(10000) },
    );
    const version = res.ok
      ? (await res.json())?.dependencies?.[ORT_PKG]
      : undefined;
    if (typeof version === "string" && VERSION_RE.test(version)) return version;
  } catch (err) {
    console.warn(
      LOG_NS,
      "could not read the onnxruntime-web version",
      err?.message ?? err,
    );
  }
  return "";
};

const _exists = async (path) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

const _download = (url, dest, sha256) => {
  if (_downloads.has(dest)) return _downloads.get(dest);
  const job = (async () => {
    if (await _exists(dest)) return true;
    await mkdir(dirname(dest), { recursive: true });
    const res = await fetch(url, { redirect: "follow" });
    if (res.status === 404) return false;
    if (!res.ok)
      throw new Error(`download ${url} failed with HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (sha256 && createHash("sha256").update(buf).digest("hex") !== sha256) {
      throw new Error(
        `checksum mismatch for ${url}, update or remove it in Runtime checksums`,
      );
    }
    const tmp = `${dest}.part`;
    await Bun.write(tmp, buf);
    await rename(tmp, dest);
    console.log(LOG_NS, `cached ${url}`);
    return true;
  })().finally(() => _downloads.delete(dest));
  _downloads.set(dest, job);
  return job;
};

const _serveFile = (path, type) =>
  new Response(Bun.file(path), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });

const _serveSource = (source) =>
  source
    ? new Response(source, {
        headers: {
          "Content-Type": "text/javascript",
          "Cache-Control": "no-cache",
        },
      })
    : _json({ error: "Not ready" }, 503);

const _runtimeSource = (name) => {
  if (name === TRANSFORMERS_FILE) {
    const pkg = `${TRANSFORMERS_PKG}@${_settings.transformersVersion}`;
    return { pkg, url: `${_settings.runtimeHost}/${pkg}/dist/${name}` };
  }
  if (!_ortVersion) return null;
  const pkg = `${ORT_PKG}@${_ortVersion}`;
  return { pkg, url: `${_settings.runtimeHost}/${pkg}/dist/${name}` };
};

const _fetchRuntime = async (name) => {
  await _ready;
  const source = _runtimeSource(name);
  if (!source) throw new Error(`no ${ORT_PKG} version to download ${name}`);
  const dest = join(_cacheDir, "runtime", source.pkg, name);
  await _download(source.url, dest, _checksums.get(name));
  return dest;
};

const _runtimeFile = async (name) => {
  if (!RUNTIME_NAMES.includes(name))
    return _json({ error: "Unknown file" }, 404);
  let dest = "";
  try {
    dest = await _fetchRuntime(name);
  } catch (err) {
    console.error(LOG_NS, err?.message ?? err);
    return _json({ error: "Runtime unavailable" }, 502);
  }
  return _serveFile(
    dest,
    name.endsWith(".wasm") ? "application/wasm" : "text/javascript",
  );
};

const _modelPath = (repo, revision, name) =>
  join(_cacheDir, "models", repo, revision, name);

const _modelUrl = (repo, revision, name) =>
  `${_settings.modelHost}/${repo}/resolve/${revision}/${name}`;

const _modelFile = async (req) => {
  const name = new URL(req.url).searchParams.get("f") ?? "";
  if (!MODEL_FILE_RE.test(name)) return _json({ error: "Unknown file" }, 404);
  await _ready;
  const { repo, revision } = _model;
  const dest = _modelPath(repo, revision, name);
  try {
    if (!(await _download(_modelUrl(repo, revision, name), dest)))
      return _json({ error: "Not found" }, 404);
  } catch (err) {
    console.warn(LOG_NS, err?.message ?? err);
    return _json({ error: "Model file unavailable" }, 502);
  }
  return _serveFile(
    dest,
    name.endsWith(".json") ? "application/json" : "application/octet-stream",
  );
};

const _dtypes = (device) =>
  device === "webgpu"
    ? [_settings.gpuEncoderDtype, _settings.gpuDecoderDtype]
    : [_settings.wasmEncoderDtype, _settings.wasmDecoderDtype];

const _warmModelFiles = () => {
  const devices = {
    [AUTO]: ["webgpu", "wasm"],
    webgpu: ["webgpu"],
    wasm: ["wasm"],
  }[_settings.device];
  const onnx = devices.flatMap((device) =>
    _dtypes(device).map(
      (dtype, i) => `onnx/${SESSIONS[i]}${DTYPE_SUFFIX[dtype]}.onnx`,
    ),
  );
  return [...MODEL_CONFIG_FILES, ...new Set(onnx)];
};

const _warm = () => {
  const { repo, revision } = _model;
  void (async () => {
    for (const name of RUNTIME_NAMES) {
      try {
        await _fetchRuntime(name);
      } catch (err) {
        console.warn(LOG_NS, `prefetch of ${name} failed`, err?.message ?? err);
      }
    }
    for (const name of _warmModelFiles()) {
      try {
        await _download(
          _modelUrl(repo, revision, name),
          _modelPath(repo, revision, name),
        );
      } catch (err) {
        console.warn(LOG_NS, `prefetch of ${name} failed`, err?.message ?? err);
      }
    }
  })();
};

const _dtypeMap = (device) => {
  const [encoder, decoder] = _dtypes(device);
  return { [SESSIONS[0]]: encoder, [SESSIONS[1]]: decoder };
};

const _config = async () => {
  await _ready;
  return _json({
    triggerWord: _settings.triggerWord,
    language: _settings.language,
    silenceSeconds: _settings.silenceSeconds,
    searchOnSilence: _settings.searchOnSilence,
    livePreview: _settings.livePreview,
    previewMs: _settings.previewMs,
    pauseMs: _settings.pauseMs,
    maxPhraseSeconds: _settings.maxPhraseSeconds,
    vadThreshold: _settings.vadThreshold,
    model: _model.repo,
    revision: _model.revision,
    device: _settings.device,
    gpuDtype: _dtypeMap("webgpu"),
    wasmDtype: _dtypeMap("wasm"),
    colors: _colors(_settings.waveColors),
  });
};

const _findModels = async (modelHost) => {
  try {
    const res = await fetch(
      `${modelHost}/api/models?search=whisper&filter=transformers.js&sort=downloads&limit=40`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return [];
    const list = await res.json();
    return Array.isArray(list)
      ? list
          .map((m) => m?.id)
          .filter((id) => typeof id === "string" && REPO_RE.test(id))
      : [];
  } catch {
    return [];
  }
};

const MIC_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>',
  );

const ID = "voice-search-command";
const FIELDSETS = {
  "listening": "Listening",
  "model": "Speech model, runs in the browser",
  "runtime": "Speech runtime",
  "look": "Appearance"
};
const OPTION_LABELS = {
  "device": {
    "auto": "WebGPU if available, otherwise WebAssembly",
    "webgpu": "WebGPU only",
    "wasm": "WebAssembly only"
  },
  "dtype": {
    "fp32": "fp32, largest and exact",
    "fp16": "fp16, half the size",
    "q8": "q8, a quarter of the size",
    "int8": "int8",
    "uint8": "uint8",
    "q4": "q4",
    "q4f16": "q4f16",
    "bnb4": "bnb4"
  }
};

const _tr = (t, key, fallback, vars = {}) => {
  const value = t?.(`${ID}.${key}`, vars);
  if (typeof value === "string" && value !== `${ID}.${key}`) return value;
  return fallback.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
};

const _labels = (t, group, options) =>
  options.map((o) => _tr(t, `options.${group}.${o}`, OPTION_LABELS[group][o]));

const _schema = (t) => [
  {
    key: "transparency",
    label: "Where your voice goes",
    type: "info",
    description: "The browser records the microphone and Whisper turns the audio into text on the visitor's device. This server never receives audio, only the finished search. It downloads the model and runtime once from the hosts below, and browsers load them from this instance.",
  },
  {
    key: "triggerWord",
    label: "Trigger word",
    type: "text",
    default: DEFAULTS.triggerWord,
    placeholder: "search",
    fieldset: _tr(t, "fieldsets.listening", FIELDSETS.listening),
    description: "Say it last to run the search, as in \"adam sandler search\". Voice search drops it from the query. It can be more than one word.",
  },
  {
    key: "language",
    label: "Language",
    type: "text",
    placeholder: "en",
    fieldset: _tr(t, "fieldsets.listening", FIELDSETS.listening),
    description: "Two-letter code such as en, it or de. Leave blank to use the page language. English-only models such as whisper-base.en ignore it.",
  },
  {
    key: "silenceSeconds",
    label: "Seconds of silence before it stops",
    type: "number",
    min: "0",
    max: "120",
    default: String(DEFAULTS.silenceSeconds),
    fieldset: _tr(t, "fieldsets.listening", FIELDSETS.listening),
    description: "With 0 it keeps listening until someone presses the microphone again.",
  },
  {
    key: "searchOnSilence",
    label: "Search when listening stops",
    type: "toggle",
    fieldset: _tr(t, "fieldsets.listening", FIELDSETS.listening),
    description: "When listening stops after silence, search what it heard, even without the trigger word.",
  },
  {
    key: "livePreview",
    label: "Show words while speaking",
    type: "toggle",
    default: "true",
    fieldset: _tr(t, "fieldsets.listening", FIELDSETS.listening),
    description: "Transcribes the phrase while the visitor is still talking. Slow devices feel the extra work.",
  },
  {
    key: "previewMs",
    label: "Milliseconds between live word updates",
    type: "number",
    min: "300",
    max: "5000",
    default: String(DEFAULTS.previewMs),
    advanced: true,
    fieldset: _tr(t, "fieldsets.listening", FIELDSETS.listening),
    visibleWhen: { key: "livePreview", equals: "true" },
  },
  {
    key: "pauseMs",
    label: "Milliseconds of quiet that end a phrase",
    type: "number",
    min: "200",
    max: "3000",
    default: String(DEFAULTS.pauseMs),
    advanced: true,
    fieldset: _tr(t, "fieldsets.listening", FIELDSETS.listening),
    description: "After this pause Whisper transcribes the phrase and voice search checks it for the trigger word.",
  },
  {
    key: "maxPhraseSeconds",
    label: "Longest phrase in seconds",
    type: "number",
    min: "3",
    max: "30",
    default: String(DEFAULTS.maxPhraseSeconds),
    advanced: true,
    fieldset: _tr(t, "fieldsets.listening", FIELDSETS.listening),
    description: "Voice search cuts longer speech here. Whisper takes at most 30 seconds at a time.",
  },
  {
    key: "vadThreshold",
    label: "Speech threshold",
    type: "number",
    min: "1.2",
    max: "20",
    step: "0.1",
    default: String(DEFAULTS.vadThreshold),
    advanced: true,
    fieldset: _tr(t, "fieldsets.listening", FIELDSETS.listening),
    description: "How many times louder than the background noise counts as speech. Raise it in noisy rooms.",
  },
  {
    key: "model",
    label: "Speech model",
    type: "text",
    default: DEFAULTS.model,
    placeholder: "owner/repo",
    fieldset: _tr(t, "fieldsets.model", FIELDSETS.model),
    description: "A Whisper model in transformers.js ONNX format. whisper-tiny is the fastest, whisper-base is the default, whisper-small is the most accurate and the largest. Models ending in .en only understand English. Find models lists them.",
    optionsFrom: {
      dependsOn: ["modelHost"],
      refreshLabel: _tr(t, "options.findModels", "Find models"),
    },
  },
  {
    key: "revision",
    label: "Model revision",
    type: "text",
    default: DEFAULTS.revision,
    placeholder: "main",
    fieldset: _tr(t, "fieldsets.model", FIELDSETS.model),
    description: "Branch, tag or commit. The default is a pinned commit of the default model. Leave it blank or pick another model to use the latest commit on main.",
  },
  {
    key: "device",
    label: "Run on",
    type: "select",
    default: DEFAULTS.device,
    options: DEVICES,
    optionLabels: _labels(t, "device", DEVICES),
    advanced: true,
    fieldset: _tr(t, "fieldsets.model", FIELDSETS.model),
  },
  {
    key: "gpuEncoderDtype",
    label: "WebGPU encoder precision",
    type: "select",
    default: DEFAULTS.gpuEncoderDtype,
    options: DTYPES,
    optionLabels: _labels(t, "dtype", DTYPES),
    advanced: true,
    fieldset: _tr(t, "fieldsets.model", FIELDSETS.model),
    description: "The model needs this file, for example onnx/encoder_model.onnx for fp32. On WebGPU, Whisper's encoder loses accuracy below fp32.",
    visibleWhen: { key: "device", equals: [AUTO, "webgpu"] },
  },
  {
    key: "gpuDecoderDtype",
    label: "WebGPU decoder precision",
    type: "select",
    default: DEFAULTS.gpuDecoderDtype,
    options: DTYPES,
    optionLabels: _labels(t, "dtype", DTYPES),
    advanced: true,
    fieldset: _tr(t, "fieldsets.model", FIELDSETS.model),
    description: "For example onnx/decoder_model_merged_q4.onnx for q4.",
    visibleWhen: { key: "device", equals: [AUTO, "webgpu"] },
  },
  {
    key: "wasmEncoderDtype",
    label: "WebAssembly encoder precision",
    type: "select",
    default: DEFAULTS.wasmEncoderDtype,
    options: DTYPES,
    optionLabels: _labels(t, "dtype", DTYPES),
    advanced: true,
    fieldset: _tr(t, "fieldsets.model", FIELDSETS.model),
    description: "For example onnx/encoder_model_quantized.onnx for q8.",
    visibleWhen: { key: "device", equals: [AUTO, "wasm"] },
  },
  {
    key: "wasmDecoderDtype",
    label: "WebAssembly decoder precision",
    type: "select",
    default: DEFAULTS.wasmDecoderDtype,
    options: DTYPES,
    optionLabels: _labels(t, "dtype", DTYPES),
    advanced: true,
    fieldset: _tr(t, "fieldsets.model", FIELDSETS.model),
    description: "For example onnx/decoder_model_merged_quantized.onnx for q8.",
    visibleWhen: { key: "device", equals: [AUTO, "wasm"] },
  },
  {
    key: "modelHost",
    label: "Model download host",
    type: "url",
    default: DEFAULTS.modelHost,
    advanced: true,
    fieldset: _tr(t, "fieldsets.model", FIELDSETS.model),
    description: "This server downloads the model from here once. Any host with the Hugging Face layout works, a mirror too.",
  },
  {
    key: "runtimeHost",
    label: "Runtime download host",
    type: "url",
    default: DEFAULTS.runtimeHost,
    advanced: true,
    fieldset: _tr(t, "fieldsets.runtime", FIELDSETS.runtime),
    description: "An npm CDN that serves package@version/path, such as cdn.jsdelivr.net/npm or unpkg.com.",
  },
  {
    key: "transformersVersion",
    label: "transformers.js version",
    type: "text",
    default: DEFAULTS.transformersVersion,
    advanced: true,
    fieldset: _tr(t, "fieldsets.runtime", FIELDSETS.runtime),
  },
  {
    key: "ortVersion",
    label: "onnxruntime-web version",
    type: "text",
    default: DEFAULTS.ortVersion,
    placeholder: "Same as transformers.js",
    advanced: true,
    fieldset: _tr(t, "fieldsets.runtime", FIELDSETS.runtime),
    description: "Leave blank to use the version transformers.js depends on.",
  },
  {
    key: "checksums",
    label: "Runtime checksums",
    type: "textarea",
    default: DEFAULTS.checksums,
    advanced: true,
    fieldset: _tr(t, "fieldsets.runtime", FIELDSETS.runtime),
    description: "One file name and SHA-256 per line. The server refuses a download that doesn't match. The defaults match the default versions, so update or clear them when you change a version. The server doesn't check files missing from the list.",
  },
  {
    key: "waveColors",
    label: "Wave colours",
    type: "text",
    placeholder: BRAND_COLORS.join(", "),
    fieldset: _tr(t, "fieldsets.look", FIELDSETS.look),
    description: "Up to 6 CSS colours or variables, separated by commas. Leave blank to use the theme's brand colours.",
  },
];

export default {
  name: "Voice search",
  description:
    "Search by speaking. Press the microphone, say your search and end with the trigger word. Whisper runs in the browser, so the audio stays on the device.",
  trigger: "voice",
  aliases: ["voicesearch"],
  isClientExposed: false,

  get settingsSchema() {
    return _schema(this.t);
  },

  async init(ctx) {
    _workerSource = await ctx.readFile("worker.js");
    _captureSource = await ctx.readFile("capture.js");
  },

  configure(settings) {
    const s = settings ?? {};
    const int = (key, min, max) =>
      Math.round(_num(s[key], DEFAULTS[key], min, max));
    const language = _str(s.language, "").toLowerCase();
    _settings = {
      triggerWord: _trigger(s.triggerWord),
      language: LANG_RE.test(language) ? language : "",
      silenceSeconds: _num(s.silenceSeconds, DEFAULTS.silenceSeconds, 0, 120),
      searchOnSilence: _bool(s.searchOnSilence, DEFAULTS.searchOnSilence),
      livePreview: _bool(s.livePreview, DEFAULTS.livePreview),
      previewMs: int("previewMs", 300, 5000),
      pauseMs: int("pauseMs", 200, 3000),
      maxPhraseSeconds: _num(
        s.maxPhraseSeconds,
        DEFAULTS.maxPhraseSeconds,
        3,
        30,
      ),
      vadThreshold: _num(s.vadThreshold, DEFAULTS.vadThreshold, 1.2, 20),
      model: REPO_RE.test(_str(s.model, "")) ? s.model.trim() : DEFAULTS.model,
      revision:
        typeof s.revision === "string" ? s.revision.trim() : DEFAULTS.revision,
      device: _pick(s.device, DEVICES, DEFAULTS.device),
      gpuEncoderDtype: _pick(
        s.gpuEncoderDtype,
        DTYPES,
        DEFAULTS.gpuEncoderDtype,
      ),
      gpuDecoderDtype: _pick(
        s.gpuDecoderDtype,
        DTYPES,
        DEFAULTS.gpuDecoderDtype,
      ),
      wasmEncoderDtype: _pick(
        s.wasmEncoderDtype,
        DTYPES,
        DEFAULTS.wasmEncoderDtype,
      ),
      wasmDecoderDtype: _pick(
        s.wasmDecoderDtype,
        DTYPES,
        DEFAULTS.wasmDecoderDtype,
      ),
      modelHost: _host(s.modelHost, DEFAULTS.modelHost),
      runtimeHost: _host(s.runtimeHost, DEFAULTS.runtimeHost),
      transformersVersion: VERSION_RE.test(_str(s.transformersVersion, ""))
        ? s.transformersVersion.trim()
        : DEFAULTS.transformersVersion,
      ortVersion: VERSION_RE.test(_str(s.ortVersion, ""))
        ? s.ortVersion.trim()
        : "",
      checksums:
        typeof s.checksums === "string" ? s.checksums : DEFAULTS.checksums,
      waveColors: typeof s.waveColors === "string" ? s.waveColors : "",
    };
    _checksums = _parseChecksums(_settings.checksums);
    const repo = _settings.model;
    const wanted =
      _settings.revision &&
      REV_RE.test(_settings.revision) &&
      !(repo !== DEFAULTS.model && _settings.revision === DEFAULTS.revision)
        ? _settings.revision
        : "main";
    _model.repo = repo;
    _model.revision = wanted;
    _ready = (async () => {
      const [revision, ort] = await Promise.all([
        _resolveRevision(repo, wanted),
        _resolveOrt(),
      ]);
      if (_model.repo === repo) _model.revision = revision;
      _ortVersion = ort;
      console.log(
        LOG_NS,
        `transcribing with ${repo}@${_model.revision}, ${TRANSFORMERS_PKG}@${_settings.transformersVersion}, ${ORT_PKG}@${ort || "unknown"}`,
      );
    })();
    void _ready.then(_warm);
  },

  async getFieldOptions(key, values) {
    if (key === "model") {
      const host = _host(values?.modelHost, DEFAULTS.modelHost);
      const models = await _findModels(host);
      return {
        options: models,
        notice: models.length
          ? _tr(this.t, "notices.foundModels", "Found {count} Whisper models", {
              count: models.length,
            })
          : _tr(
              this.t,
              "notices.noModels",
              "No models found. Type owner/repo instead.",
            ),
      };
    }
    return { options: [] };
  },

  async execute() {
    const word = _escHtml(_settings.triggerWord);
    return {
      title: _tr(this.t, "command.title", "Voice search"),
      html: `<div class="voice-search-command"><button type="button" class="voice-search-command-start">{{ t:${ID}.command.start }}</button><p>{{ t:${ID}.command.hint }} <strong>"${word}"</strong>.</p></div>`,
    };
  },

  searchBarActions: [
    {
      id: "mic",
      label: "",
      icon: MIC_ICON,
      type: "custom",
    },
  ],

  routes: [
    { method: "get", path: "/config", handler: _config },
    {
      method: "get",
      path: "/worker.js",
      handler: () => _serveSource(_workerSource),
    },
    {
      method: "get",
      path: "/capture.js",
      handler: () => _serveSource(_captureSource),
    },
    {
      method: "get",
      path: "/runtime",
      handler: (req) =>
        _runtimeFile(new URL(req.url).searchParams.get("f") ?? ""),
    },
    { method: "get", path: "/model", handler: _modelFile },
    ...ORT_FILES.map((name) => ({
      method: "get",
      path: `/ort/${name}`,
      handler: () => _runtimeFile(name),
    })),
  ],
};
