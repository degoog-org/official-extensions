import { createOpenAIChatAdapter, tokenCap } from "./openai-chat.js";
import { LLAMACPP_DEFAULT_BASE, ProviderId } from "./types.js";

const buildBody = (config, messages, opts) => ({
  model: config.model,
  messages,
  stream: true,
  ...tokenCap(opts),
  chat_template_kwargs: { enable_thinking: !!opts.enableThinking },
});

export const llamaCppAdapter = createOpenAIChatAdapter({
  id: ProviderId.LlamaCpp,
  logNs: "ai-summary:llama-cpp",
  defaultBaseUrl: LLAMACPP_DEFAULT_BASE,
  buildBody,
});
