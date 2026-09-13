export const ProviderId = Object.freeze({
  OpenAICompat: "openai-compat",
  OpenAI: "openai",
  OpenRouter: "openrouter",
  Ollama: "ollama",
  LlamaCpp: "llama-cpp",
  Vllm: "vllm",
  LmStudio: "lm-studio",
  Gemini: "gemini",
  Anthropic: "anthropic",
});

export const ChunkKind = Object.freeze({
  Text: "text",
  Thinking: "thinking",
  Done: "done",
  Error: "error",
});

export const TokenParam = Object.freeze({
  MaxTokens: "max_tokens",
  MaxCompletionTokens: "max_completion_tokens",
});

export const SESSION_PLACEHOLDER = "{{session}}";

export const ChatRole = Object.freeze({
  System: "system",
  User: "user",
  Assistant: "assistant",
});

export const OPENAI_DEFAULT_BASE = "https://api.openai.com/v1";
export const OPENROUTER_DEFAULT_BASE = "https://openrouter.ai/api/v1";
export const OLLAMA_DEFAULT_BASE = "http://localhost:11434";
export const LLAMACPP_DEFAULT_BASE = "http://localhost:8080/v1";
export const VLLM_DEFAULT_BASE = "http://localhost:8000/v1";
export const LMSTUDIO_DEFAULT_BASE = "http://localhost:1234/v1";
export const GEMINI_DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const ANTHROPIC_DEFAULT_BASE = "https://api.anthropic.com/v1";
export const ANTHROPIC_VERSION = "2023-06-01";
