import { ReasoningEffort, TokenParam } from "./types.js";

export const TOKEN_PARAM_ORDER = Object.freeze([TokenParam.MaxTokens, TokenParam.MaxCompletionTokens]);
export const EFFORT_ORDER = Object.freeze([ReasoningEffort.Low, ReasoningEffort.Medium, ReasoningEffort.High]);

export const tokenLimitField = Object.freeze({
  key: "tokenLimitParam",
  label: "Token limit parameter",
  type: "select",
  options: [...TOKEN_PARAM_ORDER],
  optionLabels: ["max_tokens (default)", "max_completion_tokens (newer OpenAI models)"],
  default: TokenParam.MaxTokens,
  description:
    "Which field carries the token cap. Newer OpenAI reasoning models reject `max_tokens` with *Unsupported parameter*. Use `max_completion_tokens` for those.",
});

export const reasoningEffortField = Object.freeze({
  key: "reasoningEffort",
  label: "Reasoning effort",
  type: "select",
  options: [...EFFORT_ORDER],
  optionLabels: ["Low", "Medium (default)", "High"],
  default: ReasoningEffort.Medium,
  visibleWhen: { key: "enableThinking", equals: "true" },
  description: "How hard the model thinks before answering. Higher is slower and costs more.",
});
