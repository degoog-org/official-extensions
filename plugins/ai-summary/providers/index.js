import { anthropicAdapter } from "./anthropic.js";
import { geminiAdapter } from "./gemini.js";
import { llamaCppAdapter } from "./llama-cpp.js";
import { lmStudioAdapter } from "./lm-studio.js";
import { ollamaAdapter } from "./ollama.js";
import { openAICompatAdapter } from "./openai-compat.js";
import { openAIAdapter } from "./openai.js";
import { openRouterAdapter } from "./openrouter.js";
import { vllmAdapter } from "./vllm.js";
import { ProviderId } from "./types.js";

export * from "./types.js";
export * from "./detect.js";
export * from "./session.js";
export { listModels } from "./models.js";

export const ADAPTERS = {
  [ProviderId.OpenAICompat]: openAICompatAdapter,
  [ProviderId.OpenAI]: openAIAdapter,
  [ProviderId.OpenRouter]: openRouterAdapter,
  [ProviderId.Ollama]: ollamaAdapter,
  [ProviderId.LlamaCpp]: llamaCppAdapter,
  [ProviderId.Vllm]: vllmAdapter,
  [ProviderId.LmStudio]: lmStudioAdapter,
  [ProviderId.Gemini]: geminiAdapter,
  [ProviderId.Anthropic]: anthropicAdapter,
};

export const ADAPTER_REQUIREMENTS = {
  [ProviderId.OpenAICompat]: { baseUrl: true, apiKey: false },
  [ProviderId.OpenAI]: { baseUrl: false, apiKey: true },
  [ProviderId.OpenRouter]: { baseUrl: false, apiKey: true },
  [ProviderId.Ollama]: { baseUrl: false, apiKey: false },
  [ProviderId.LlamaCpp]: { baseUrl: false, apiKey: false },
  [ProviderId.Vllm]: { baseUrl: false, apiKey: false },
  [ProviderId.LmStudio]: { baseUrl: false, apiKey: false },
  [ProviderId.Gemini]: { baseUrl: false, apiKey: true },
  [ProviderId.Anthropic]: { baseUrl: false, apiKey: true },
};

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

export const adapterRequirements = (id, compatProvider = "") => (
  ADAPTER_REQUIREMENTS[effectiveProviderId(id, compatProvider)] ?? ADAPTER_REQUIREMENTS[ProviderId.OpenAICompat]
);
