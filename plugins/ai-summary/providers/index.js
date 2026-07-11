import { anthropicAdapter } from "./anthropic.js";
import { geminiAdapter } from "./gemini.js";
import { openAIAdapter } from "./openai.js";
import { ProviderId } from "./types.js";

export * from "./types.js";

export const ADAPTERS = {
  [ProviderId.OpenAICompat]: openAIAdapter,
  [ProviderId.Gemini]: geminiAdapter,
  [ProviderId.Anthropic]: anthropicAdapter,
};

export const pickAdapter = (id) => {
  const known = Object.values(ProviderId).includes(id) ? id : ProviderId.OpenAICompat;
  return ADAPTERS[known];
};
