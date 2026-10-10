import { tokenLimitField } from "./fields.js";
import { basicOpenAIBody, createOpenAIChatAdapter } from "./openai-chat.js";
import { ProviderId } from "./types.js";

export const openAICompatAdapter = createOpenAIChatAdapter({
  id: ProviderId.OpenAICompat,
  logNs: "ai-summary:openai-compat",
  buildBody: basicOpenAIBody,
  settings: {
    label: "OpenAI-compatible",
    requires: { baseUrl: true, apiKey: false },
    notes:
      "Any server that speaks Chat Completions. Set the base URL to the part before `/chat/completions`, like `https://api.example.com/v1`. degoog sends no thinking flags, so the server decides whether the model reasons.",
    fields: [tokenLimitField],
  },
});
