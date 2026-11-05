import { tokenLimitField } from "./fields.js";
import { GENERIC_THINKING_OFF, basicOpenAIBody, createOpenAIChatAdapter } from "./openai-chat.js";
import { ProviderId } from "./types.js";

export const openAICompatAdapter = createOpenAIChatAdapter({
  id: ProviderId.OpenAICompat,
  logNs: "ai-summary:openai-compat",
  buildBody: basicOpenAIBody,
  thinkingOff: GENERIC_THINKING_OFF,
  settings: {
    label: "OpenAI-compatible",
    requires: { baseUrl: true, apiKey: false },
    notes:
      "Any server that speaks Chat Completions. Set the base URL to the part before `/chat/completions`, like `https://api.example.com/v1`. Thinking On sends no flags, so the server decides. Off sends `reasoning_effort: none` and `chat_template_kwargs.enable_thinking: false`.",
    fields: [tokenLimitField],
  },
});
