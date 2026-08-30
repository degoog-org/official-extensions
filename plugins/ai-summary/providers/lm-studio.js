import { basicOpenAIBody, createOpenAIChatAdapter } from "./openai-chat.js";
import { LMSTUDIO_DEFAULT_BASE, ProviderId } from "./types.js";

export const lmStudioAdapter = createOpenAIChatAdapter({
  id: ProviderId.LmStudio,
  logNs: "ai-summary:lm-studio",
  defaultBaseUrl: LMSTUDIO_DEFAULT_BASE,
  buildBody: basicOpenAIBody,
});
