import { tokenLimitField } from "./fields.js";
import { GENERIC_THINKING_OFF, basicOpenAIBody, createOpenAIChatAdapter } from "./openai-chat.js";
import { LMSTUDIO_DEFAULT_BASE, ProviderId } from "./types.js";

export const lmStudioAdapter = createOpenAIChatAdapter({
  id: ProviderId.LmStudio,
  logNs: "ai-summary:lm-studio",
  defaultBaseUrl: LMSTUDIO_DEFAULT_BASE,
  buildBody: basicOpenAIBody,
  thinkingOff: GENERIC_THINKING_OFF,
  settings: {
    label: "LM Studio",
    requires: { baseUrl: false, apiKey: false },
    notes: "A blank base URL uses `http://localhost:1234/v1`.",
    fields: [tokenLimitField],
  },
});
