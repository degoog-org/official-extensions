import { createOpenAIChatAdapter, tokenCap } from "./openai-chat.js";
import { OPENAI_DEFAULT_BASE, ProviderId } from "./types.js";

const buildBody = (config, messages, opts) => {
  const body = {
    model: config.model,
    messages,
    stream: true,
    ...tokenCap(opts),
  };
  if (opts.enableThinking) body.reasoning_effort = "medium";
  return body;
};

export const openAIAdapter = createOpenAIChatAdapter({
  id: ProviderId.OpenAI,
  logNs: "ai-summary:openai",
  defaultBaseUrl: OPENAI_DEFAULT_BASE,
  buildBody,
});
