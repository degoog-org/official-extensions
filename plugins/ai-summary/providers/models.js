import { originOf } from "./detect.js";
import { resolveProviderBaseUrl } from "./base-url.js";
import {
  ANTHROPIC_DEFAULT_BASE,
  ANTHROPIC_VERSION,
  GEMINI_DEFAULT_BASE,
  LLAMACPP_DEFAULT_BASE,
  LMSTUDIO_DEFAULT_BASE,
  OPENAI_DEFAULT_BASE,
  OPENROUTER_DEFAULT_BASE,
  ProviderId,
  VLLM_DEFAULT_BASE,
} from "./types.js";

const LOG_NS = "ai-summary:models";
const LIST_TIMEOUT_MS = 8000;

const DEFAULT_BASES = {
  [ProviderId.OpenAI]: OPENAI_DEFAULT_BASE,
  [ProviderId.OpenRouter]: OPENROUTER_DEFAULT_BASE,
  [ProviderId.LlamaCpp]: LLAMACPP_DEFAULT_BASE,
  [ProviderId.Vllm]: VLLM_DEFAULT_BASE,
  [ProviderId.LmStudio]: LMSTUDIO_DEFAULT_BASE,
  [ProviderId.Gemini]: GEMINI_DEFAULT_BASE,
  [ProviderId.Anthropic]: ANTHROPIC_DEFAULT_BASE,
};

const openAIBase = (providerId, baseUrl) => {
  const fallback = DEFAULT_BASES[providerId];
  if (fallback) return resolveProviderBaseUrl(baseUrl ?? "", fallback);
  return (baseUrl ?? "").trim().replace(/\/+$/, "");
};

const askJson = async (url, headers) => {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), LIST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: abort.signal,
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

const bearer = (apiKey) => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {});

const fromOpenAI = async (providerId, config) => {
  const base = openAIBase(providerId, config.baseUrl);
  if (!base) return [];
  const data = await askJson(`${base}/models`, bearer(config.apiKey));
  return (data?.data ?? [])
    .filter((entry) => typeof entry?.id === "string")
    .map((entry) => ({ value: entry.id, label: entry.name || entry.id }));
};

const fromOllama = async (_providerId, config) => {
  const data = await askJson(
    `${originOf(config.baseUrl)}/api/tags`,
    bearer(config.apiKey),
  );
  return (data?.models ?? [])
    .filter((entry) => typeof entry?.name === "string")
    .map((entry) => ({ value: entry.name, label: entry.model || entry.name }));
};

const fromLmStudio = async (_providerId, config) => {
  const data = await askJson(
    `${originOf(config.baseUrl)}/api/v0/models`,
    bearer(config.apiKey),
  );
  return (data?.data ?? [])
    .filter((entry) => typeof entry?.id === "string")
    .map((entry) => ({ value: entry.id, label: entry.id }));
};

const fromGemini = async (providerId, config) => {
  const base = openAIBase(providerId, config.baseUrl);
  const key = encodeURIComponent(config.apiKey ?? "");
  const data = await askJson(`${base}/models?key=${key}`, {});
  return (data?.models ?? [])
    .filter((entry) => typeof entry?.name === "string")
    .map((entry) => {
      const id = entry.name.replace(/^models\//, "");
      return { value: id, label: entry.displayName || id };
    });
};

const fromAnthropic = async (providerId, config) => {
  const base = openAIBase(providerId, config.baseUrl);
  const data = await askJson(`${base}/models`, {
    "x-api-key": config.apiKey ?? "",
    "anthropic-version": ANTHROPIC_VERSION,
  });
  return (data?.data ?? [])
    .filter((entry) => typeof entry?.id === "string")
    .map((entry) => ({ value: entry.id, label: entry.display_name || entry.id }));
};

const LISTERS = {
  [ProviderId.Ollama]: fromOllama,
  [ProviderId.LmStudio]: fromLmStudio,
  [ProviderId.Gemini]: fromGemini,
  [ProviderId.Anthropic]: fromAnthropic,
};

export const listModels = async (providerId, config) => {
  const lister = LISTERS[providerId] ?? fromOpenAI;
  try {
    return await lister(providerId, config);
  } catch (err) {
    console.warn(LOG_NS, `listing failed for ${providerId}`, err?.message || err);
    return [];
  }
};
