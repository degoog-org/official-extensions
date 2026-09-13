import { createOpenAIChatAdapter, tokenCap } from "./openai-chat.js";
import { OPENROUTER_DEFAULT_BASE, ProviderId } from "./types.js";

const buildBody = (config, messages, opts) => {
  const body = {
    model: config.model,
    messages,
    stream: true,
    ...tokenCap(opts),
  };
  body.reasoning = opts.enableThinking
    ? { effort: "medium", exclude: false }
    : { effort: "none" };
  return body;
};

export const openRouterAdapter = createOpenAIChatAdapter({
  id: ProviderId.OpenRouter,
  logNs: "ai-summary:openrouter",
  defaultBaseUrl: OPENROUTER_DEFAULT_BASE,
  buildBody,
});
