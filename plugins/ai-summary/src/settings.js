import { PROVIDER_LABELS, PROVIDER_ORDER, ProviderId } from "../providers/index.js";
import { DEFAULT_SYSTEM_PROMPT } from "./prompt.js";

export const DEFAULT_TIMEOUT_S = 180;
export const DEFAULT_MAX_TOKENS = 2048;
export const FOLLOWUP_MIN_TOKENS = 512;

const asStr = (v) => (typeof v === "string" ? v : String(v ?? ""));
const asBool = (v) => v === "true" || v === true;

const normaliseProvider = (raw) => {
  const all = Object.values(ProviderId);
  return all.includes(raw) ? raw : ProviderId.OpenAICompat;
};

const normaliseCompatProvider = (raw) => {
  const compat = [
    "",
    ProviderId.OpenAI,
    ProviderId.OpenRouter,
    ProviderId.Ollama,
    ProviderId.LlamaCpp,
    ProviderId.Vllm,
    ProviderId.LmStudio,
  ];
  return compat.includes(raw) ? raw : "";
};

export const parseSettings = (raw) => {
  const timeoutSeconds = parseFloat(asStr(raw["timeoutSeconds"]) || "") || DEFAULT_TIMEOUT_S;
  const maxTokens = parseInt(asStr(raw["maxTokens"]) || "", 10) || DEFAULT_MAX_TOKENS;
  return {
    provider: normaliseProvider(asStr(raw["provider"])),
    openAICompatProvider: normaliseCompatProvider(asStr(raw["openAICompatProvider"])),
    baseUrl: asStr(raw["baseUrl"]),
    model: asStr(raw["model"]),
    apiKey: asStr(raw["apiKey"]),
    timeoutMs: Math.max(5, timeoutSeconds) * 1000,
    systemPrompt: asStr(raw["systemPrompt"]),
    maxTokens: Math.max(16, maxTokens),
    questionMarkOnly: asBool(raw["questionMarkOnly"]),
    enableThinking: asBool(raw["enableThinking"]),
    hideOnError: asBool(raw["hideOnError"]),
  };
};

export const settingsSchema = [
  {
    key: "questionMarkOnly",
    label: "Only trigger on questions (?)",
    type: "toggle",
    description: "Only show summaries when the query ends with `?`.",
  },
  {
    key: "hideOnError",
    label: "Hide summary on error or timeout",
    type: "toggle",
    description: "Hide the summary box instead of showing an error message when the provider fails or times out.",
  },
  {
    key: "baseUrl",
    label: "API Base URL",
    type: "url",
    placeholder: "https://api.openai.com/v1",
    description:
      "Provider base URL. Examples: `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`, `http://localhost:11434` for Ollama, `http://localhost:8080/v1` for llama.cpp, `http://localhost:8000/v1` for vLLM, or `http://localhost:1234/v1` for LM Studio. Native providers fill the standard default when blank.",
  },
  {
    key: "apiKey",
    label: "API Key",
    type: "password",
    secret: true,
    placeholder: "Leave blank for local models (Ollama)",
    description:
      "Get one from [OpenAI](https://platform.openai.com/api-keys), [Google AI Studio](https://aistudio.google.com/apikey), or [Anthropic](https://console.anthropic.com/settings/keys). Not needed for local Ollama.",
  },
  {
    key: "provider",
    label: "Provider",
    type: "select",
    options: [...PROVIDER_ORDER],
    optionLabels: PROVIDER_ORDER.map((id) => PROVIDER_LABELS[id]),
    default: ProviderId.OpenAICompat,
    optionsFrom: {
      dependsOn: ["baseUrl"],
      refreshLabel: "Detect",
      emptyHint: "Hit Detect and degoog will ask your endpoint what it is.",
    },
    description:
      "Which API degoog talks. **Detect** sets this for you; pick one by hand if it cannot tell. **OpenAI compatible** sends no thinking flags, so your server decides whether the model reasons.",
  },
  {
    key: "model",
    label: "Model",
    type: "text",
    required: true,
    placeholder: "gpt-4o-mini / gemini-2.5-flash / claude-haiku-4-5",
    optionsFrom: {
      dependsOn: ["provider"],
      refreshLabel: "Fetch models",
      emptyHint: "Fetch models to list what this endpoint serves, or type any model id.",
    },
    description:
      "Model id. Lists: [OpenAI](https://platform.openai.com/docs/models), [Gemini](https://ai.google.dev/gemini-api/docs/models), [Anthropic](https://docs.anthropic.com/en/docs/about-claude/models). For Ollama/vLLM use whatever you have served. Reasoning models work; their thoughts stream live and clear when the answer starts.",
  },
  {
    key: "enableThinking",
    label: "Let reasoning models think",
    type: "toggle",
    description:
      "Off by default. Native provider adapters translate this to their own supported thinking controls; generic OpenAI-compatible sends no provider-specific thinking flags.",
  },
  {
    key: "timeoutSeconds",
    label: "Timeout (seconds)",
    type: "text",
    placeholder: "180",
    description: "Max seconds before giving up. Default `180`.",
  },
  {
    key: "maxTokens",
    label: "Max Tokens",
    type: "text",
    placeholder: "2048",
    description:
      "Max tokens for the response. Default `2048`. Reasoning models need budget for thinking *and* answer; bump to `4096`+ for deep models.",
  },
  {
    key: "systemPrompt",
    label: "Custom System Prompt",
    type: "textarea",
    placeholder: DEFAULT_SYSTEM_PROMPT,
    description: "Override the default system prompt. Blank uses the default.",
  },
];
