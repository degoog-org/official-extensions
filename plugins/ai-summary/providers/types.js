export const ProviderId = Object.freeze({
  OpenAICompat: "openai-compat",
  Gemini: "gemini",
  Anthropic: "anthropic",
});

export const ChunkKind = Object.freeze({
  Text: "text",
  Thinking: "thinking",
  Done: "done",
  Error: "error",
});

export const ChatRole = Object.freeze({
  System: "system",
  User: "user",
  Assistant: "assistant",
});

export const GEMINI_DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const ANTHROPIC_DEFAULT_BASE = "https://api.anthropic.com/v1";
export const ANTHROPIC_VERSION = "2023-06-01";
