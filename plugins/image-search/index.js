import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  describeImage,
  detectProvider,
  listModels,
  PROVIDER_LABELS,
  ProviderId,
} from "./providers.js";

const LOG_NS = "image-search";
const MAX_RAW_CHARS = 2000;
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

const DEFAULT_PROMPT =
  "Write one short image-search query (2 to 8 words) that would find this exact image or near copies of it online. If you recognise a specific named thing (artwork and artist, landmark, product model, species or breed, a famous photo), use its proper name. Answer as JSON with a single field named query.";
const DEFAULT_REFINE_PROMPT =
  'The user also wants: "{text}". Include that in the query.';

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
const WEAK_MODES = ["bottom", "hide", "keep"];
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const REV_RE = /^[\w.-]{1,64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const RANGE_RE = /^bytes=(\d*)-(\d*)$/;
const VERSION_RE = /^[\w.+-]{1,64}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const MODEL_FILE_RE = /^(onnx\/)?[\w.-]+\.(json|txt|onnx|onnx_data)$/;
const MODEL_CONFIG_FILES = [
  "config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
];

const DEFAULTS = {
  baseUrl: "http://localhost:11434",
  provider: AUTO,
  model: "qwen3.5:4b",
  apiKey: "",
  timeoutSeconds: 60,
  prompt: DEFAULT_PROMPT,
  refinePrompt: DEFAULT_REFINE_PROMPT,
  maxImageMb: 6,
  maxConcurrent: 2,
  describe: true,
  rank: true,
  rankModel: "Xenova/clip-vit-base-patch32",
  rankRevision: "d15189d7028b43f1d3e65039190477f6af591c2a",
  device: AUTO,
  gpuDtype: "fp16",
  wasmDtype: "q8",
  weakMatches: "bottom",
  matchThreshold: 75,
  sameThreshold: 90,
  textWeight: 2,
  batchSize: 8,
  fetchConcurrency: 12,
  modelHost: "https://huggingface.co",
  runtimeHost: "https://cdn.jsdelivr.net/npm",
  transformersVersion: "4.3.0",
  ortVersion: "",
  checksums: DEFAULT_CHECKSUMS,
};

let _settings = { ...DEFAULTS };
let _provider = ProviderId.Ollama;
let _inFlight = 0;
let _ortVersion = "";
let _checksums = new Map();
let _ready = Promise.resolve();
const _cacheDir = join(
  process.env.DEGOOG_DATA_DIR || join(process.cwd(), "data"),
  "cache",
  "image-search",
);
const _downloads = new Map();
const _missing = new Set();
const FILE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "Accept-Ranges": "bytes",
};

const _json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const _str = (v, fallback) =>
  typeof v === "string" && v.trim() ? v.trim() : fallback;

const _num = (v, fallback, min, max) => {
  const n = Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const _bool = (v, fallback) =>
  v === true || v === "true" ? true : v === false || v === "false" ? false : fallback;

const _pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

const _host = (v, fallback) => _str(v, fallback).replace(/\/+$/, "");

const _parseChecksums = (text) => {
  const map = new Map();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const [name, sha] = line.trim().split(/\s+/);
    if (RUNTIME_NAMES.includes(name) && SHA_RE.test(sha?.toLowerCase() ?? ""))
      map.set(name, sha.toLowerCase());
  }
  return map;
};

const _model = { repo: DEFAULTS.rankModel, revision: DEFAULTS.rankRevision };

const _resolveRevision = async (repo, revision) => {
  if (COMMIT_RE.test(revision)) return revision;
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

const _ortPin = () =>
  join(
    _cacheDir,
    "runtime",
    `${TRANSFORMERS_PKG}@${_settings.transformersVersion}`,
    "ort-version",
  );

const _readOrtPin = async () => {
  try {
    const version = (await readFile(_ortPin(), "utf8")).trim();
    return VERSION_RE.test(version) ? version : "";
  } catch {
    return "";
  }
};

const _fetchOrt = async () => {
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

const _resolveOrt = async () => {
  if (_settings.ortVersion) return _settings.ortVersion;
  const pinned = await _readOrtPin();
  if (pinned) return pinned;
  const version = await _fetchOrt();
  if (!version) return "";
  try {
    await mkdir(dirname(_ortPin()), { recursive: true });
    await writeFile(_ortPin(), version);
  } catch (err) {
    console.warn(
      LOG_NS,
      "could not save the onnxruntime-web version",
      err?.message ?? err,
    );
  }
  return version;
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
    if (_missing.has(url)) return false;
    await mkdir(dirname(dest), { recursive: true });
    const res = await fetch(url, { redirect: "follow" });
    if (res.status === 404) {
      _missing.add(url);
      return false;
    }
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

const _range = (header, size) => {
  const match = RANGE_RE.exec(header ?? "");
  if (!match || (!match[1] && !match[2])) return null;
  const [, from, to] = match;
  const start = from ? Number(from) : Math.max(0, size - Number(to));
  const end = from && to ? Math.min(Number(to), size - 1) : size - 1;
  return { start, end };
};

const _serveFile = (req, path, type) => {
  const file = Bun.file(path);
  const headers = { ...FILE_HEADERS, "Content-Type": type };
  const range = _range(req.headers.get("range"), file.size);
  if (!range) return new Response(file, { headers });
  if (range.start > range.end)
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${file.size}` },
    });
  return new Response(file.slice(range.start, range.end + 1), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
      "Content-Length": String(range.end - range.start + 1),
    },
  });
};

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

const _runtimeFile = async (req, name) => {
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
    req,
    dest,
    name.endsWith(".wasm") ? "application/wasm" : "text/javascript",
  );
};

const _modelPath = (repo, revision, name) =>
  join(_cacheDir, "models", repo, revision, name);

const _modelUrl = (repo, revision, name) =>
  `${_settings.modelHost}/${repo}/resolve/${revision}/${name}`;

const _isStale = (params) => {
  const repo = params.get("m");
  const revision = params.get("r");
  return (
    (repo != null && repo !== _model.repo) ||
    (revision != null && revision !== _model.revision)
  );
};

const _modelFile = async (req) => {
  const params = new URL(req.url).searchParams;
  const name = params.get("f") ?? "";
  if (!MODEL_FILE_RE.test(name)) return _json({ error: "Unknown file" }, 404);
  await _ready;
  if (_isStale(params))
    return _json({ error: "The ranking model changed, reload the page" }, 409);
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
    req,
    dest,
    name.endsWith(".json") ? "application/json" : "application/octet-stream",
  );
};

const _warmModelFiles = () => {
  const dtypes = {
    [AUTO]: [_settings.gpuDtype, _settings.wasmDtype],
    webgpu: [_settings.gpuDtype],
    wasm: [_settings.wasmDtype],
  }[_settings.device];
  const suffixes = [...new Set(dtypes.map((d) => DTYPE_SUFFIX[d]))];
  return [
    ...MODEL_CONFIG_FILES,
    ...suffixes.map((suffix) => `onnx/vision_model${suffix}.onnx`),
    ...suffixes.map((suffix) => `onnx/text_model${suffix}.onnx`),
  ];
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

const _config = async () => {
  await _ready;
  return _json({
    model: _model.repo,
    revision: _model.revision,
    device: _settings.device,
    gpuDtype: _settings.gpuDtype,
    wasmDtype: _settings.wasmDtype,
    weakMatches: _settings.weakMatches,
    matchThreshold: _settings.matchThreshold / 100,
    sameThreshold: _settings.sameThreshold / 100,
    textWeight: _settings.textWeight,
    batchSize: _settings.batchSize,
    fetchConcurrency: _settings.fetchConcurrency,
    rank: _settings.rank,
  });
};

const _prompt = (text) =>
  [
    _settings.prompt,
    text ? _settings.refinePrompt.replaceAll("{text}", text) : "",
  ]
    .filter(Boolean)
    .join(" ");

const _suspect = ({ query, raw, details }) => {
  const warning = {
    message: "The vision model's answer doesn't look like a search query",
    model: _settings.model,
    query,
    raw: raw.slice(0, MAX_RAW_CHARS),
    ...details,
  };
  console.warn(LOG_NS, "suspicious vision model answer", JSON.stringify(warning));
  return warning;
};

const _fail = (t, code, fallback) =>
  new Error(_tr(t, `script.errors.${code}`, fallback));

const _imageQuery = async (t, image, { text = "", signal } = {}) => {
  if (_inFlight >= _settings.maxConcurrent)
    throw _fail(t, "busy", "The vision model is busy. Try again in a moment.");
  if (image.bytes.length > _settings.maxImageMb * 1024 * 1024)
    throw _fail(t, "tooLarge", "That image is too large.");
  const timeout = AbortSignal.timeout(_settings.timeoutSeconds * 1000);
  let answer;
  _inFlight++;
  try {
    answer = await describeImage(
      {
        ..._settings,
        provider: _provider,
        mime: image.mime,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
      _prompt(text),
      image.base64,
    );
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn(LOG_NS, "describe failed", err?.message ?? err);
    throw _fail(t, "describeFailed", "The vision model couldn't describe this image.");
  } finally {
    _inFlight--;
  }
  if (answer.suspect) _suspect(answer);
  if (!answer.query)
    throw _fail(t, "noQuery", "The vision model didn't return a query.");
  return answer.query.slice(0, 160);
};

const _findRankModels = async (modelHost) => {
  try {
    const res = await fetch(
      `${modelHost}/api/models?search=clip&filter=transformers.js&sort=downloads&limit=40`,
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

const PROVIDER_OPTIONS = [AUTO, ...Object.values(ProviderId)];
const ID = "image-search-command";
const FIELDSETS = {
  "vision": "Vision model, turns the image into a query",
  "ranking": "Ranking, runs in the visitor's browser",
  "runtime": "Ranking runtime"
};
const OPTION_LABELS = {
  "provider": {
    "auto": "Detect automatically",
    "openai-compat": "OpenAI-compatible"
  },
  "weakMatches": {
    "bottom": "Move to the end",
    "hide": "Hide",
    "keep": "Leave in place"
  },
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

const _fill = (text, vars) =>
  text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

const _tr = (t, key, fallback, vars = {}) => {
  const value = t?.(`${ID}.${key}`, vars);
  return typeof value === "string" && value !== `${ID}.${key}`
    ? value
    : _fill(fallback, vars);
};

const _labels = (t, group, options) =>
  options.map((o) => _tr(t, `options.${group}.${o}`, OPTION_LABELS[group][o]));

const _providerLabels = (t) =>
  PROVIDER_OPTIONS.map((id) =>
    OPTION_LABELS.provider[id]
      ? _tr(t, `options.provider.${id}`, OPTION_LABELS.provider[id])
      : PROVIDER_LABELS[id],
  );

const DESCRIBE_ON = { key: "describe", equals: "true" };
const RANK_ON = { key: "rank", equals: "true" };

const _schema = (t) => [
  {
    key: "transparency",
    label: "Where the image goes",
    type: "info",
    description: "degoog sends the image from the visitor's browser to this server. With Turn images into a search query on, the server passes it straight to the vision model below and doesn't store it. Text engines only see the query the model writes. Engines that search by image get the picture itself, and each one says so in its own settings. Ranking runs in the visitor's browser. This server downloads the ranking model and runtime once from the hosts below, and browsers load them from this instance.",
  },
  {
    key: "describe",
    label: "Turn images into a search query",
    type: "toggle",
    default: "true",
    description: "Your vision model writes a query for each image, and degoog runs it through your normal image engines next to the engines that search by image.",
  },
  {
    key: "rank",
    label: "Re-rank results by how they look",
    type: "toggle",
    default: "true",
    description: "The visitor's browser compares every result with the image and reorders them.",
  },
  {
    key: "baseUrl",
    label: "Vision model URL",
    type: "url",
    default: DEFAULTS.baseUrl,
    placeholder: DEFAULTS.baseUrl,
    fieldset: _tr(t, "fieldsets.vision", FIELDSETS.vision),
    visibleWhen: DESCRIBE_ON,
    description: "Ollama, llama.cpp, LM Studio, vLLM or any OpenAI-compatible server.",
  },
  {
    key: "provider",
    label: "Provider",
    type: "select",
    default: AUTO,
    options: PROVIDER_OPTIONS,
    optionLabels: _providerLabels(t),
    fieldset: _tr(t, "fieldsets.vision", FIELDSETS.vision),
    visibleWhen: DESCRIBE_ON,
    optionsFrom: { dependsOn: ["baseUrl", "apiKey"], refreshLabel: _tr(t, "options.detect", "Detect") },
  },
  {
    key: "model",
    label: "Model",
    type: "text",
    required: true,
    default: DEFAULTS.model,
    fieldset: _tr(t, "fieldsets.vision", FIELDSETS.vision),
    visibleWhen: DESCRIBE_ON,
    description: "It has to accept images, for example qwen3.5:4b or gemma4:e4b.",
    optionsFrom: {
      dependsOn: ["baseUrl", "provider", "apiKey"],
      refreshLabel: _tr(t, "options.fetchModels", "Fetch models"),
    },
  },
  {
    key: "apiKey",
    label: "API key",
    type: "password",
    secret: true,
    placeholder: "Leave blank for local servers",
    fieldset: _tr(t, "fieldsets.vision", FIELDSETS.vision),
    visibleWhen: DESCRIBE_ON,
  },
  {
    key: "prompt",
    label: "Prompt",
    type: "textarea",
    default: DEFAULTS.prompt,
    advanced: true,
    fieldset: _tr(t, "fieldsets.vision", FIELDSETS.vision),
    visibleWhen: DESCRIBE_ON,
    description: "The server sends this with every image. Keep the last sentence. It makes the model answer with a query field.",
  },
  {
    key: "refinePrompt",
    label: "Prompt when the visitor adds words",
    type: "textarea",
    default: DEFAULTS.refinePrompt,
    advanced: true,
    fieldset: _tr(t, "fieldsets.vision", FIELDSETS.vision),
    visibleWhen: DESCRIBE_ON,
    description: "The server adds this when the visitor types words next to the image. {text} becomes those words.",
  },
  {
    key: "timeoutSeconds",
    label: "Timeout in seconds",
    type: "number",
    min: "5",
    max: "600",
    default: String(DEFAULTS.timeoutSeconds),
    advanced: true,
    fieldset: _tr(t, "fieldsets.vision", FIELDSETS.vision),
    visibleWhen: DESCRIBE_ON,
  },
  {
    key: "maxImageMb",
    label: "Largest image accepted, in MB",
    type: "number",
    min: "1",
    max: "50",
    default: String(DEFAULTS.maxImageMb),
    advanced: true,
    fieldset: _tr(t, "fieldsets.vision", FIELDSETS.vision),
    visibleWhen: DESCRIBE_ON,
  },
  {
    key: "maxConcurrent",
    label: "Images described at once",
    type: "number",
    min: "1",
    max: "32",
    default: String(DEFAULTS.maxConcurrent),
    advanced: true,
    fieldset: _tr(t, "fieldsets.vision", FIELDSETS.vision),
    visibleWhen: DESCRIBE_ON,
    description: "While this many are running, new image searches skip the query and say the model is busy.",
  },
  {
    key: "rankModel",
    label: "Ranking model",
    type: "text",
    default: DEFAULTS.rankModel,
    placeholder: "owner/repo",
    fieldset: _tr(t, "fieldsets.ranking", FIELDSETS.ranking),
    visibleWhen: RANK_ON,
    description: "A CLIP model in transformers.js ONNX format. Bigger models are more accurate, but slower to download and run. Find models lists them.",
    optionsFrom: { dependsOn: ["modelHost"], refreshLabel: _tr(t, "options.findModels", "Find models") },
  },
  {
    key: "rankRevision",
    label: "Ranking model revision",
    type: "text",
    default: DEFAULTS.rankRevision,
    placeholder: "main",
    fieldset: _tr(t, "fieldsets.ranking", FIELDSETS.ranking),
    visibleWhen: RANK_ON,
    description: "Branch, tag or commit. The default is a pinned commit of the default model. Leave it blank or pick another model to use the latest commit on main.",
  },
  {
    key: "weakMatches",
    label: "Results that don't look like the image",
    type: "select",
    default: DEFAULTS.weakMatches,
    options: WEAK_MODES,
    optionLabels: _labels(t, "weakMatches", WEAK_MODES),
    fieldset: _tr(t, "fieldsets.ranking", FIELDSETS.ranking),
    visibleWhen: RANK_ON,
  },
  {
    key: "matchThreshold",
    label: "Match threshold, in percent",
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    default: String(DEFAULTS.matchThreshold),
    fieldset: _tr(t, "fieldsets.ranking", FIELDSETS.ranking),
    visibleWhen: RANK_ON,
    description: "Results below this similarity count as not matching.",
  },
  {
    key: "sameThreshold",
    label: "Same image threshold, in percent",
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    default: String(DEFAULTS.sameThreshold),
    advanced: true,
    fieldset: _tr(t, "fieldsets.ranking", FIELDSETS.ranking),
    visibleWhen: RANK_ON,
    description: "How close a result's fingerprint has to be to your image to get the Same image badge. It catches resized and recompressed copies, not crops.",
  },
  {
    key: "textWeight",
    label: "Weight of typed words",
    type: "number",
    min: "0",
    max: "10",
    step: "0.1",
    default: String(DEFAULTS.textWeight),
    advanced: true,
    fieldset: _tr(t, "fieldsets.ranking", FIELDSETS.ranking),
    visibleWhen: RANK_ON,
    description: "How much the words typed next to the image count when ordering results. 0 ignores them.",
  },
  {
    key: "device",
    label: "Run on",
    type: "select",
    default: DEFAULTS.device,
    options: DEVICES,
    optionLabels: _labels(t, "device", DEVICES),
    advanced: true,
    fieldset: _tr(t, "fieldsets.ranking", FIELDSETS.ranking),
    visibleWhen: RANK_ON,
  },
  {
    key: "gpuDtype",
    label: "WebGPU precision",
    type: "select",
    default: DEFAULTS.gpuDtype,
    options: DTYPES,
    optionLabels: _labels(t, "dtype", DTYPES),
    advanced: true,
    fieldset: _tr(t, "fieldsets.ranking", FIELDSETS.ranking),
    visibleWhen: RANK_ON,
    description: "The model needs this file, for example onnx/vision_model_fp16.onnx.",
  },
  {
    key: "wasmDtype",
    label: "WebAssembly precision",
    type: "select",
    default: DEFAULTS.wasmDtype,
    options: DTYPES,
    optionLabels: _labels(t, "dtype", DTYPES),
    advanced: true,
    fieldset: _tr(t, "fieldsets.ranking", FIELDSETS.ranking),
    visibleWhen: RANK_ON,
    description: "The model needs this file, for example onnx/vision_model_quantized.onnx.",
  },
  {
    key: "batchSize",
    label: "Images ranked per batch",
    type: "number",
    min: "1",
    max: "64",
    default: String(DEFAULTS.batchSize),
    advanced: true,
    fieldset: _tr(t, "fieldsets.ranking", FIELDSETS.ranking),
    visibleWhen: RANK_ON,
  },
  {
    key: "fetchConcurrency",
    label: "Thumbnails fetched at once",
    type: "number",
    min: "1",
    max: "64",
    default: String(DEFAULTS.fetchConcurrency),
    advanced: true,
    fieldset: _tr(t, "fieldsets.ranking", FIELDSETS.ranking),
    visibleWhen: RANK_ON,
  },
  {
    key: "modelHost",
    label: "Ranking model download host",
    type: "url",
    default: DEFAULTS.modelHost,
    advanced: true,
    fieldset: _tr(t, "fieldsets.ranking", FIELDSETS.ranking),
    visibleWhen: RANK_ON,
    description: "This server downloads the ranking model from here once. Any host with the Hugging Face layout works, a mirror too.",
  },
  {
    key: "runtimeHost",
    label: "Runtime download host",
    type: "url",
    default: DEFAULTS.runtimeHost,
    advanced: true,
    fieldset: _tr(t, "fieldsets.runtime", FIELDSETS.runtime),
    visibleWhen: RANK_ON,
    description: "An npm CDN that serves package@version/path, such as cdn.jsdelivr.net/npm or unpkg.com.",
  },
  {
    key: "transformersVersion",
    label: "transformers.js version",
    type: "text",
    default: DEFAULTS.transformersVersion,
    advanced: true,
    fieldset: _tr(t, "fieldsets.runtime", FIELDSETS.runtime),
    visibleWhen: RANK_ON,
  },
  {
    key: "ortVersion",
    label: "onnxruntime-web version",
    type: "text",
    default: DEFAULTS.ortVersion,
    placeholder: "Same as transformers.js",
    advanced: true,
    fieldset: _tr(t, "fieldsets.runtime", FIELDSETS.runtime),
    visibleWhen: RANK_ON,
    description: "Leave blank to use the version transformers.js depends on.",
  },
  {
    key: "checksums",
    label: "Runtime checksums",
    type: "textarea",
    default: DEFAULTS.checksums,
    advanced: true,
    fieldset: _tr(t, "fieldsets.runtime", FIELDSETS.runtime),
    visibleWhen: RANK_ON,
    description: "One file name and SHA-256 per line. The server refuses a download that doesn't match. The defaults match the default versions, so update or clear them when you change a version. The server doesn't check files missing from the list.",
  },

];

export default {
  name: "Image search",
  description:
    "Better image search. Your vision model turns the picture into a search query for your normal image engines, and the visitor's browser reorders the results by how close they look to the picture. Each part can be turned off on its own.",
  trigger: "lens",
  aliases: ["imagesearch"],
  isClientExposed: false,
  get settingsSchema() {
    return _schema(this.t);
  },

  configure(settings) {
    const s = settings ?? {};
    const int = (key, min, max) =>
      Math.round(_num(s[key], DEFAULTS[key], min, max));
    _settings = {
      baseUrl: _str(s.baseUrl, DEFAULTS.baseUrl),
      provider: _pick(s.provider, PROVIDER_OPTIONS, AUTO),
      model: _str(s.model, DEFAULTS.model),
      apiKey: _str(s.apiKey, ""),
      timeoutSeconds: _num(s.timeoutSeconds, DEFAULTS.timeoutSeconds, 5, 600),
      prompt: _str(s.prompt, DEFAULTS.prompt),
      refinePrompt: _str(s.refinePrompt, DEFAULTS.refinePrompt),
      maxImageMb: _num(s.maxImageMb, DEFAULTS.maxImageMb, 1, 50),
      maxConcurrent: int("maxConcurrent", 1, 32),
      describe: _bool(s.describe, DEFAULTS.describe),
      rank: _bool(s.rank, DEFAULTS.rank),
      rankModel: REPO_RE.test(_str(s.rankModel, ""))
        ? s.rankModel.trim()
        : DEFAULTS.rankModel,
      rankRevision:
        typeof s.rankRevision === "string"
          ? s.rankRevision.trim()
          : DEFAULTS.rankRevision,
      device: _pick(s.device, DEVICES, DEFAULTS.device),
      gpuDtype: _pick(s.gpuDtype, DTYPES, DEFAULTS.gpuDtype),
      wasmDtype: _pick(s.wasmDtype, DTYPES, DEFAULTS.wasmDtype),
      weakMatches: _pick(s.weakMatches, WEAK_MODES, DEFAULTS.weakMatches),
      matchThreshold: _num(s.matchThreshold, DEFAULTS.matchThreshold, 0, 100),
      sameThreshold: _num(s.sameThreshold, DEFAULTS.sameThreshold, 0, 100),
      textWeight: _num(s.textWeight, DEFAULTS.textWeight, 0, 10),
      batchSize: int("batchSize", 1, 64),
      fetchConcurrency: int("fetchConcurrency", 1, 64),
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
    };
    _checksums = _parseChecksums(_settings.checksums);
    _missing.clear();
    if (_settings.provider === AUTO) {
      _provider = ProviderId.Ollama;
      void detectProvider(_settings.baseUrl, _settings.apiKey).then((id) => {
        _provider = id;
      });
    } else {
      _provider = _settings.provider;
    }
    const repo = _settings.rankModel;
    const wanted =
      _settings.rankRevision &&
      REV_RE.test(_settings.rankRevision) &&
      !(
        repo !== DEFAULTS.rankModel &&
        _settings.rankRevision === DEFAULTS.rankRevision
      )
        ? _settings.rankRevision
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
        `ranking with ${repo}@${_model.revision}, ${TRANSFORMERS_PKG}@${_settings.transformersVersion}, ${ORT_PKG}@${ort || "unknown"}`,
      );
    })();
    if (_settings.rank) void _ready.then(_warm);
  },

  async getFieldOptions(key, values) {
    const baseUrl = _str(values?.baseUrl, DEFAULTS.baseUrl);
    const apiKey = _str(values?.apiKey, "");
    if (key === "provider") {
      const id = await detectProvider(baseUrl, apiKey);
      return {
        options: [],
        notice: _tr(this.t, "notices.detected", "Detected {provider}", {
          provider: PROVIDER_LABELS[id],
        }),
      };
    }
    if (key === "model") {
      const provider =
        PROVIDER_OPTIONS.includes(values?.provider) && values.provider !== AUTO
          ? values.provider
          : await detectProvider(baseUrl, apiKey);
      const models = await listModels(provider, baseUrl, apiKey);
      return {
        options: models,
        notice: models.length
          ? _tr(this.t, "notices.foundModels", "Found {count} models on {provider}", {
              count: models.length,
              provider: PROVIDER_LABELS[provider],
            })
          : _tr(this.t, "notices.noModels", "No models found"),
      };
    }
    if (key === "rankModel") {
      const host = _host(values?.modelHost, DEFAULTS.modelHost);
      const models = await _findRankModels(host);
      return {
        options: models,
        notice: models.length
          ? _tr(this.t, "notices.foundClip", "Found {count} CLIP models", {
              count: models.length,
            })
          : _tr(
              this.t,
              "notices.noClip",
              "No models found. Type owner/repo instead.",
            ),
      };
    }
    return { options: [] };
  },

  describesImages() {
    return _settings.describe;
  },

  imageQuery(image, context) {
    return _imageQuery(this.t, image, context);
  },

  async execute() {
    return {
      title: _tr(this.t, "command.title", "Image search"),
      html: `<div class="image-search-command"><button type="button" class="image-search-command-pick">{{ t:${ID}.command.pick }}</button><p>{{ t:${ID}.command.hint }}</p></div>`,
    };
  },

  routes: [
    { method: "get", path: "/config", handler: _config },
    {
      method: "get",
      path: "/runtime",
      handler: (req) =>
        _runtimeFile(req, new URL(req.url).searchParams.get("f") ?? ""),
    },
    { method: "get", path: "/model", handler: _modelFile },
    ...ORT_FILES.map((name) => ({
      method: "get",
      path: `/ort/${name}`,
      handler: (req) => _runtimeFile(req, name),
    })),
  ],
};
