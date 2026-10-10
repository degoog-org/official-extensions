import { reasoningEffortField, tokenLimitField } from "./fields.js";
import { createOpenAIChatAdapter, tokenCap } from "./openai-chat.js";
import { OPENAI_DEFAULT_BASE, ProviderId, ReasoningEffort } from "./types.js";

const buildBody = (config, messages, opts) => {
  const body = {
    model: config.model,
    messages,
    stream: true,
    ...tokenCap(opts),
  };
  if (opts.enableThinking) body.reasoning_effort = opts.reasoningEffort ?? ReasoningEffort.Medium;
  return body;
};

export const openAIAdapter = createOpenAIChatAdapter({
  id: ProviderId.OpenAI,
  logNs: "ai-summary:openai",
  defaultBaseUrl: OPENAI_DEFAULT_BASE,
  buildBody,
  settings: {
    label: "OpenAI",
    requires: { baseUrl: false, apiKey: true },
    notes:
      "Needs a key from [OpenAI](https://platform.openai.com/api-keys). A blank base URL uses `https://api.openai.com/v1`. Newer reasoning models want **Token limit parameter** set to `max_completion_tokens`.",
    fields: [tokenLimitField, reasoningEffortField],
  },
});
