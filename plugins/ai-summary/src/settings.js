import { ProviderId } from "../providers/index.js";
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

export const parseSettings = (raw) => {
  const timeoutSeconds = parseFloat(asStr(raw["timeoutSeconds"]) || "") || DEFAULT_TIMEOUT_S;
  const maxTokens = parseInt(asStr(raw["maxTokens"]) || "", 10) || DEFAULT_MAX_TOKENS;
  return {
    provider: normaliseProvider(asStr(raw["provider"])),
    baseUrl: asStr(raw["baseUrl"]),
    model: asStr(raw["model"]),
    apiKey: asStr(raw["apiKey"]),
    timeoutMs: Math.max(5, timeoutSeconds) * 1000,
    systemPrompt: asStr(raw["systemPrompt"]),
    maxTokens: Math.max(16, maxTokens),
    questionMarkOnly: asBool(raw["questionMarkOnly"]),
    enableThinking: asBool(raw["enableThinking"]),
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
    key: "provider",
    label: "Provider",
    type: "select",
    options: [ProviderId.OpenAICompat, ProviderId.Gemini, ProviderId.Anthropic],
    optionLabels: [
      "OpenAI compatible (OpenAI, Ollama, vLLM, ...)",
      "Google Gemini (native)",
      "Anthropic Claude (native)",
    ],
    default: ProviderId.OpenAICompat,
    description:
      "**OpenAI-compatible** covers OpenAI, [Ollama](https://ollama.com), vLLM. **Gemini** and **Anthropic** use their native streaming APIs.",
  },
  {
    key: "baseUrl",
    label: "API Base URL",
    type: "url",
    placeholder: "https://api.openai.com/v1",
    description:
      "Include the version path for OpenAI-compatible providers (`https://api.openai.com/v1`, or `http://localhost:11434/v1` for [Ollama](https://ollama.com)). Leave blank for Gemini and Anthropic; if you set a host-only override, the version path is filled in automatically.",
  },
  {
    key: "model",
    label: "Model",
    type: "text",
    required: true,
    placeholder: "gpt-4o-mini / gemini-2.5-flash / claude-haiku-4-5",
    description:
      "Model id. Lists: [OpenAI](https://platform.openai.com/docs/models), [Gemini](https://ai.google.dev/gemini-api/docs/models), [Anthropic](https://docs.anthropic.com/en/docs/about-claude/models). For Ollama/vLLM use whatever you have served. Reasoning models work; their thoughts stream live and clear when the answer starts.",
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
    key: "enableThinking",
    label: "Let reasoning models think",
    type: "toggle",
    description:
      "Off by default. When off: Gemini budget `0`, Anthropic thinking disabled, Qwen models get `/no_think` appended. On is slower and costlier.",
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
