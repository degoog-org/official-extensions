import { basicOpenAIBody, createOpenAIChatAdapter } from "./openai-chat.js";
import { ProviderId } from "./types.js";

export const openAICompatAdapter = createOpenAIChatAdapter({
  id: ProviderId.OpenAICompat,
  logNs: "ai-summary:openai-compat",
  buildBody: basicOpenAIBody,
});
