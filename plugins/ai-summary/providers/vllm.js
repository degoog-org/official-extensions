import { createOpenAIChatAdapter } from "./openai-chat.js";
import { ProviderId, VLLM_DEFAULT_BASE } from "./types.js";

const buildBody = (config, messages, opts) => ({
  model: config.model,
  messages,
  stream: true,
  max_tokens: opts.maxTokens,
  chat_template_kwargs: { enable_thinking: !!opts.enableThinking },
});

export const vllmAdapter = createOpenAIChatAdapter({
  id: ProviderId.Vllm,
  logNs: "ai-summary:vllm",
  defaultBaseUrl: VLLM_DEFAULT_BASE,
  buildBody,
});
