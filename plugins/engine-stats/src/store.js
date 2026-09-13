import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

export const STATS_VERSION = 1;
export const BUCKET_MS = 60 * 60 * 1000;
export const FLUSH_DELAY_MS = 15_000;
export const LATENCY_EDGES_MS = [100, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const OVERFLOW_SLOT = LATENCY_EDGES_MS.length;

const DATA_DIR = join(process.cwd(), "data");
const STATS_PATH = join(DATA_DIR, "engine-stats.json");

let _state = { version: STATS_VERSION, engines: {} };
let _retentionHours = 48;
let _dirty = false;
let _timer = null;
let _loaded = false;

const log = (msg, err) => {
  if (err) console.warn(`[engine-stats] ${msg}`, err);
  else console.warn(`[engine-stats] ${msg}`);
};

export const setRetention = (hours) => {
  const n = Number(hours);
  _retentionHours = Number.isFinite(n) && n > 0 ? Math.min(n, 24 * 14) : 48;
};

const freshBucket = () => ({
  total: 0,
  cached: 0,
  fresh: 0,
  ok: 0,
  errors: 0,
  zero: 0,
  timeSum: 0,
  timeMax: 0,
  results: 0,
  status: {},
  hist: new Array(OVERFLOW_SLOT + 1).fill(0),
});

const bucketKey = (at) => String(Math.floor(at / BUCKET_MS) * BUCKET_MS);

const latencySlot = (ms) => {
  for (let i = 0; i < LATENCY_EDGES_MS.length; i += 1) {
    if (ms <= LATENCY_EDGES_MS[i]) return i;
  }
  return OVERFLOW_SLOT;
};

const trimOld = (entry, now) => {
  const oldest = now - _retentionHours * BUCKET_MS;
  for (const key of Object.keys(entry.buckets)) {
    if (Number(key) < oldest) delete entry.buckets[key];
  }
};

const entryFor = (name) => {
  if (!_state.engines[name]) {
    _state.engines[name] = { buckets: {}, lastError: null };
  }
  return _state.engines[name];
};

const saveStats = async () => {
  _dirty = false;
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STATS_PATH, JSON.stringify(_state), "utf-8");
  } catch (err) {
    log("failed to persist stats", err);
  }
};

const markDirty = () => {
  _dirty = true;
  if (_timer) return;
  _timer = setTimeout(() => {
    _timer = null;
    if (_dirty) void saveStats();
  }, FLUSH_DELAY_MS);
  if (typeof _timer.unref === "function") _timer.unref();
};

export const loadStats = async () => {
  if (_loaded) return;
  _loaded = true;
  try {
    const raw = await readFile(STATS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed?.version === STATS_VERSION && parsed.engines) _state = parsed;
  } catch {
    _state = { version: STATS_VERSION, engines: {} };
  }
};

export const recordRun = (report) => {
  if (!report?.engine) return;

  const entry = entryFor(report.engine);
  const key = bucketKey(report.at);
  if (!entry.buckets[key]) entry.buckets[key] = freshBucket();
  const bucket = entry.buckets[key];

  bucket.total += 1;

  if (report.cached) {
    bucket.cached += 1;
    markDirty();
    return;
  }

  bucket.fresh += 1;
  bucket.timeSum += report.time;
  bucket.timeMax = Math.max(bucket.timeMax, report.time);
  bucket.results += report.resultCount;
  bucket.hist[latencySlot(report.time)] += 1;
  bucket.status[report.status] = (bucket.status[report.status] ?? 0) + 1;

  if (report.status === "ok") {
    bucket.ok += 1;
    if (report.resultCount === 0) bucket.zero += 1;
  } else {
    bucket.errors += 1;
    entry.lastError = {
      status: report.status,
      reason: report.errorReason ?? "",
      httpStatus: report.httpStatus ?? null,
      at: report.at,
    };
  }

  trimOld(entry, report.at);
  markDirty();
};

const pctFromHist = (hist, total, p) => {
  if (total === 0) return null;
  const target = Math.ceil((total * p) / 100);
  let seen = 0;
  for (let i = 0; i < hist.length; i += 1) {
    seen += hist[i];
    if (seen >= target) return LATENCY_EDGES_MS[i] ?? null;
  }
  return null;
};

const foldBuckets = (entry, since) => {
  const merged = freshBucket();
  for (const [key, bucket] of Object.entries(entry.buckets)) {
    if (Number(key) < since) continue;
    merged.total += bucket.total;
    merged.cached += bucket.cached;
    merged.fresh += bucket.fresh;
    merged.ok += bucket.ok;
    merged.errors += bucket.errors;
    merged.zero += bucket.zero;
    merged.timeSum += bucket.timeSum;
    merged.timeMax = Math.max(merged.timeMax, bucket.timeMax);
    merged.results += bucket.results;
    for (const [status, count] of Object.entries(bucket.status)) {
      merged.status[status] = (merged.status[status] ?? 0) + count;
    }
    bucket.hist.forEach((count, i) => {
      merged.hist[i] += count;
    });
  }
  return merged;
};

const rate = (part, whole) => (whole === 0 ? 0 : (part / whole) * 100);

const capAtMax = (edge, max) => (edge == null ? null : Math.min(edge, max));

export const snapshot = (windowMs) => {
  const since = Date.now() - windowMs;
  const rows = [];

  for (const [name, entry] of Object.entries(_state.engines)) {
    const m = foldBuckets(entry, since);
    if (m.total === 0) continue;

    rows.push({
      name,
      total: m.total,
      fresh: m.fresh,
      cached: m.cached,
      errors: m.errors,
      failRate: rate(m.errors, m.fresh),
      cacheRate: rate(m.cached, m.total),
      avgTime: m.fresh === 0 ? null : Math.round(m.timeSum / m.fresh),
      maxTime: m.fresh === 0 ? null : m.timeMax,
      p50: capAtMax(pctFromHist(m.hist, m.fresh, 50), m.timeMax),
      p90: capAtMax(pctFromHist(m.hist, m.fresh, 90), m.timeMax),
      p95: capAtMax(pctFromHist(m.hist, m.fresh, 95), m.timeMax),
      avgResults: m.fresh === 0 ? null : m.results / m.fresh,
      zeroRate: rate(m.zero, m.ok),
      status: m.status,
      lastError: entry.lastError?.at >= since ? entry.lastError : null,
    });
  }

  rows.sort((a, b) => b.failRate - a.failRate || (b.avgTime ?? 0) - (a.avgTime ?? 0));
  return rows;
};


