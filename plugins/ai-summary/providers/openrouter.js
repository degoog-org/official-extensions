import { reasoningEffortField, tokenLimitField } from "./fields.js";
import { createOpenAIChatAdapter, tokenCap } from "./openai-chat.js";
import { OPENROUTER_DEFAULT_BASE, ProviderId, ReasoningEffort } from "./types.js";

const buildBody = (config, messages, opts) => {
  const body = {
    model: config.model,
    messages,
    stream: true,
    ...tokenCap(opts),
  };
  if (opts.enableThinking) {
    body.reasoning = { effort: opts.reasoningEffort ?? ReasoningEffort.Medium, exclude: false };
  } else if (opts.disableThinking) {
    body.reasoning = { effort: "none" };
  }
  return body;
};

export const openRouterAdapter = createOpenAIChatAdapter({
  id: ProviderId.OpenRouter,
  logNs: "ai-summary:openrouter",
  defaultBaseUrl: OPENROUTER_DEFAULT_BASE,
  buildBody,
  settings: {
    label: "OpenRouter",
    requires: { baseUrl: false, apiKey: true },
    notes:
      "Needs a key from [OpenRouter](https://openrouter.ai/keys). A blank base URL uses `https://openrouter.ai/api/v1`.",
    fields: [tokenLimitField, reasoningEffortField],
  },
});
