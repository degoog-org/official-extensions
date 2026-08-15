import { resolveProviderBaseUrl } from "./base-url.js";
import {
  ANTHROPIC_DEFAULT_BASE,
  GEMINI_DEFAULT_BASE,
  OLLAMA_DEFAULT_BASE,
  OPENAI_DEFAULT_BASE,
  ProviderId,
} from "./types.js";

const LOG_NS = "ai-summary:detect";
const PROBE_TIMEOUT_MS = 2000;
const CACHE_TTL_MS = 5 * 60 * 1000;

export const DetectSource = Object.freeze({
  Host: "host",
  Probe: "probe",
  Fallback: "fallback",
});

export const PROVIDER_ORDER = Object.freeze([
  ProviderId.OpenAICompat,
  ProviderId.OpenAI,
  ProviderId.OpenRouter,
  ProviderId.Ollama,
  ProviderId.LlamaCpp,
  ProviderId.Vllm,
  ProviderId.LmStudio,
  ProviderId.Gemini,
  ProviderId.Anthropic,
]);

export const PROVIDER_LABELS = Object.freeze({
  [ProviderId.OpenAICompat]: "OpenAI-compatible",
  [ProviderId.OpenAI]: "OpenAI",
  [ProviderId.OpenRouter]: "OpenRouter",
  [ProviderId.Ollama]: "Ollama",
  [ProviderId.LlamaCpp]: "llama.cpp",
  [ProviderId.Vllm]: "vLLM",
  [ProviderId.LmStudio]: "LM Studio",
  [ProviderId.Gemini]: "Google Gemini",
  [ProviderId.Anthropic]: "Anthropic Claude",
});

const HOSTED = [
  { id: ProviderId.OpenAI, host: new URL(OPENAI_DEFAULT_BASE).host },
  { id: ProviderId.OpenRouter, host: "openrouter.ai" },
  { id: ProviderId.Gemini, host: new URL(GEMINI_DEFAULT_BASE).host },
  { id: ProviderId.Anthropic, host: new URL(ANTHROPIC_DEFAULT_BASE).host },
];

const PROBES = [
  {
    id: ProviderId.Ollama,
    path: "/api/version",
    ok: (data) => typeof data?.version === "string",
  },
  {
    id: ProviderId.LmStudio,
    path: "/api/v0/models",
    ok: (data) => Array.isArray(data?.data),
  },
  {
    id: ProviderId.LlamaCpp,
    path: "/props",
    ok: (data) =>
      !!data?.default_generation_settings || typeof data?.chat_template === "string",
  },
  {
    id: ProviderId.Vllm,
    path: "/version",
    ok: (data) => typeof data?.version === "string",
  },
];

const cache = new Map();

export const originOf = (baseUrl) => {
  const resolved = resolveProviderBaseUrl(baseUrl ?? "", OLLAMA_DEFAULT_BASE);
  try {
    return new URL(resolved).origin;
  } catch {
    return "";
  }
};

const hostedMatch = (origin) => {
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return null;
  }
  return HOSTED.find((entry) => entry.host === host)?.id ?? null;
};

const probeOnce = async (origin, probe, apiKey) => {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    const headers = { Accept: "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const res = await fetch(`${origin}${probe.path}`, {
      headers,
      signal: abort.signal,
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return probe.ok(data) ? probe.id : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const runProbes = async (origin, apiKey) => {
  const results = await Promise.all(
    PROBES.map((probe) => probeOnce(origin, probe, apiKey)),
  );
  return results.find(Boolean) ?? null;
};

export const cachedDetection = (baseUrl) => {
  const origin = originOf(baseUrl);
  const hit = cache.get(origin);
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return null;
  return hit.result;
};

export const forgetDetection = (baseUrl) => {
  if (baseUrl === undefined) {
    cache.clear();
    return;
  }
  cache.delete(originOf(baseUrl));
};

export const sniffProvider = async (baseUrl, apiKey = "", force = false) => {
  const origin = originOf(baseUrl);
  if (!origin) {
    return { id: ProviderId.OpenAICompat, source: DetectSource.Fallback, origin };
  }
  if (!force) {
    const hit = cachedDetection(baseUrl);
    if (hit) return hit;
  }

  const hosted = hostedMatch(origin);
  const result = hosted
    ? { id: hosted, source: DetectSource.Host, origin }
    : await runProbes(origin, apiKey).then((id) =>
        id
          ? { id, source: DetectSource.Probe, origin }
          : { id: ProviderId.OpenAICompat, source: DetectSource.Fallback, origin },
      );

  if (result.source === DetectSource.Fallback) {
    console.warn(LOG_NS, `no provider fingerprint at ${origin}`);
  }
  cache.set(origin, { result, at: Date.now() });
  return result;
};
