import { anthropicAdapter } from "./anthropic.js";
import { geminiAdapter } from "./gemini.js";
import { llamaCppAdapter } from "./llama-cpp.js";
import { lmStudioAdapter } from "./lm-studio.js";
import { ollamaAdapter } from "./ollama.js";
import { openAICompatAdapter } from "./openai-compat.js";
import { openAIAdapter } from "./openai.js";
import { openRouterAdapter } from "./openrouter.js";
import { perplexityAdapter } from "./perplexity.js";
import { vllmAdapter } from "./vllm.js";
import { ProviderId } from "./types.js";

export * from "./types.js";
export * from "./fields.js";
export * from "./detect.js";
export * from "./session.js";
export { listModels } from "./models.js";

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
  ProviderId.Perplexity,
]);

export const ADAPTERS = Object.freeze({
  [ProviderId.OpenAICompat]: openAICompatAdapter,
  [ProviderId.OpenAI]: openAIAdapter,
  [ProviderId.OpenRouter]: openRouterAdapter,
  [ProviderId.Ollama]: ollamaAdapter,
  [ProviderId.LlamaCpp]: llamaCppAdapter,
  [ProviderId.Vllm]: vllmAdapter,
  [ProviderId.LmStudio]: lmStudioAdapter,
  [ProviderId.Gemini]: geminiAdapter,
  [ProviderId.Anthropic]: anthropicAdapter,
  [ProviderId.Perplexity]: perplexityAdapter,
});

export const PROVIDER_LABELS = Object.freeze(
  Object.fromEntries(PROVIDER_ORDER.map((id) => [id, ADAPTERS[id].settings.label])),
);

const COMPAT_PROVIDER_IDS = new Set([
  ProviderId.OpenAI,
  ProviderId.OpenRouter,
  ProviderId.Ollama,
  ProviderId.LlamaCpp,
  ProviderId.Vllm,
  ProviderId.LmStudio,
]);

export const effectiveProviderId = (provider, compatProvider = "") => {
  if (provider === ProviderId.OpenAICompat && COMPAT_PROVIDER_IDS.has(compatProvider)) return compatProvider;
  return Object.values(ProviderId).includes(provider) ? provider : ProviderId.OpenAICompat;
};

export const pickAdapter = (id, compatProvider = "") => ADAPTERS[effectiveProviderId(id, compatProvider)] ?? openAICompatAdapter;

export const adapterRequirements = (id, compatProvider = "") => pickAdapter(id, compatProvider).settings.requires;
