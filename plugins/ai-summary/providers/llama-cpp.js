import { createOpenAIChatAdapter } from "./openai-chat.js";
import { LLAMACPP_DEFAULT_BASE, ProviderId } from "./types.js";

const buildBody = (config, messages, opts) => ({
  model: config.model,
  messages,
  stream: true,
  max_tokens: opts.maxTokens,
  chat_template_kwargs: { enable_thinking: !!opts.enableThinking },
});

export const llamaCppAdapter = createOpenAIChatAdapter({
  id: ProviderId.LlamaCpp,
  logNs: "ai-summary:llama-cpp",
  defaultBaseUrl: LLAMACPP_DEFAULT_BASE,
  buildBody,
});
