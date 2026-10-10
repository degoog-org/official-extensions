import {
  ADAPTERS,
  EFFORT_ORDER,
  PROVIDER_LABELS,
  PROVIDER_ORDER,
  ProviderId,
  ReasoningEffort,
  TOKEN_PARAM_ORDER,
  TokenParam,
} from "../providers/index.js";
import { DEFAULT_SYSTEM_PROMPT } from "./prompt.js";

export const DEFAULT_TIMEOUT_S = 180;
export const DEFAULT_MAX_TOKENS = 2048;
export const FOLLOWUP_MIN_TOKENS = 512;

const asStr = (v) => (typeof v === "string" ? v : String(v ?? ""));
const asBool = (v) => v === "true" || v === true;
const asBoolOr = (v, fallback) =>
  v === true || v === "true" ? true : v === false || v === "false" ? false : fallback;

const normaliseProvider = (raw) => {
  const all = Object.values(ProviderId);
  return all.includes(raw) ? raw : ProviderId.OpenAICompat;
};

const normaliseTokenParam = (raw) => (
  TOKEN_PARAM_ORDER.includes(raw) ? raw : TokenParam.MaxTokens
);

const normaliseEffort = (raw) => (
  EFFORT_ORDER.includes(raw) ? raw : ReasoningEffort.Medium
);

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
    extraHeaders: asStr(raw["extraHeaders"]),
    tokenParam: normaliseTokenParam(asStr(raw["tokenLimitParam"])),
    timeoutMs: Math.max(5, timeoutSeconds) * 1000,
    systemPrompt: asStr(raw["systemPrompt"]),
    maxTokens: Math.max(16, maxTokens),
    questionMarkOnly: asBool(raw["questionMarkOnly"]),
    enableThinking: asBool(raw["enableThinking"]),
    reasoningEffort: normaliseEffort(asStr(raw["reasoningEffort"])),
    hideOnError: asBool(raw["hideOnError"]),
    enableInputStyling: asBool(raw["enableInputStyling"]),
    openLinksInNewTab: asBool(raw["openLinksInNewTab"]),
    sendBrowserLanguage: asBoolOr(raw["sendBrowserLanguage"], true),
  };
};

const PROVIDER_KEY = "provider";

const asRules = (visibleWhen) => {
  if (!visibleWhen) return [];
  return Array.isArray(visibleWhen) ? visibleWhen : [visibleWhen];
};

const providerNotes = PROVIDER_ORDER.map((id) => ({
  key: `providerNotes-${id}`,
  label: `About ${PROVIDER_LABELS[id]}`,
  type: "info",
  description: ADAPTERS[id].settings.notes,
  visibleWhen: { key: PROVIDER_KEY, equals: id },
}));

const providerFields = () => {
  const byKey = new Map();
  for (const id of PROVIDER_ORDER) {
    for (const field of ADAPTERS[id].settings.fields) {
      const entry = byKey.get(field.key) ?? { field, ids: [] };
      entry.ids.push(id);
      byKey.set(field.key, entry);
    }
  }
  return [...byKey.values()].map(({ field, ids }) => ({
    ...field,
    visibleWhen: [{ key: PROVIDER_KEY, equals: ids }, ...asRules(field.visibleWhen)],
  }));
};

export const settingsSchema = [
  {
    key: PROVIDER_KEY,
    label: "Provider",
    type: "select",
    options: [...PROVIDER_ORDER],
    optionLabels: PROVIDER_ORDER.map((id) => PROVIDER_LABELS[id]),
    default: ProviderId.OpenAICompat,
    optionsFrom: {
      dependsOn: ["baseUrl"],
      refreshLabel: "Detect",
      emptyHint: "Pick one, or fill in the base URL below and hit Detect.",
    },
    description:
      "Which API degoog talks. The fields below change to match it. **Detect** asks the base URL what it is and picks for you.",
  },
  ...providerNotes,
  {
    key: "baseUrl",
    label: "API base URL",
    type: "url",
    placeholder: "Blank uses the provider default",
    description:
      "Blank uses the default for the provider above. A bare origin gets the standard path added.",
  },
  {
    key: "apiKey",
    label: "API key",
    type: "password",
    secret: true,
    placeholder: "Leave blank for local servers",
    description: "Sent only from this server, never to the browser.",
  },
  {
    key: "model",
    label: "Model",
    type: "text",
    required: true,
    placeholder: "gpt-4o-mini / gemini-flash-latest / claude-haiku-4-5",
    optionsFrom: {
      dependsOn: ["provider"],
      refreshLabel: "Fetch models",
      emptyHint: "Fetch models to list what this endpoint serves, or type any model id.",
    },
    description:
      "Model id. Reasoning models work; their thoughts stream live and clear when the answer starts.",
  },
  {
    key: "enableThinking",
    label: "Let reasoning models think",
    type: "toggle",
    description:
      "Off by default. Native providers map this to their own thinking controls. OpenAI compatible sends no thinking flags.",
  },
  ...providerFields(),
  {
    key: "maxTokens",
    label: "Max tokens",
    type: "text",
    placeholder: "2048",
    description:
      "Cap on the response length. Default `2048`. Reasoning models spend tokens on thinking too, so give them `4096` or more.",
  },
  {
    key: "questionMarkOnly",
    label: "Only trigger on questions (?)",
    type: "toggle",
    description: "Only summarize when the query ends with `?`.",
  },
  {
    key: "hideOnError",
    label: "Hide summary on error or timeout",
    type: "toggle",
    description: "Removes the summary box instead of showing an error when the provider fails or times out.",
  },
  {
    key: "openLinksInNewTab",
    label: "Open links in a new tab",
    type: "toggle",
    description: "Opens citations, sources and links in the answer in a new tab.",
  },
  {
    key: "enableInputStyling",
    label: "Enable input styling",
    type: "toggle",
    description: "Adds a rotating rainbow border to the follow-up input while it has focus. Purely for show.",
  },
  {
    key: "extraHeaders",
    label: "Extra request headers",
    type: "textarea",
    advanced: true,
    placeholder: "x-opencode-session: {{session}}",
    description:
      "One `Name: value` per line, sent with every request to your provider. `{{session}}` becomes a stable id for the conversation, which is what OpenCode Go wants in `x-opencode-session`. Lines starting with `#` are ignored, and `Content-Type` and `Accept` cannot be overridden.",
  },
  {
    key: "timeoutSeconds",
    label: "Timeout (seconds)",
    type: "text",
    advanced: true,
    placeholder: "180",
    description: "Seconds to wait before giving up. Default `180`.",
  },
  {
    key: "systemPrompt",
    label: "Custom system prompt",
    type: "textarea",
    advanced: true,
    placeholder: DEFAULT_SYSTEM_PROMPT,
    description: "Replaces the built-in system prompt. Leave blank to keep it.",
  },
];
