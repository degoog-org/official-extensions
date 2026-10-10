import { tokenLimitField } from "./fields.js";
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
  settings: {
    label: "llama.cpp",
    requires: { baseUrl: false, apiKey: false },
    notes:
      "A blank base URL uses `http://localhost:8080/v1`. degoog switches thinking with `chat_template_kwargs.enable_thinking`.",
    fields: [tokenLimitField],
  },
});
