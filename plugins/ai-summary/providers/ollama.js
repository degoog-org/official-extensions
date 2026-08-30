import { resolveProviderBaseUrl } from "./base-url.js";
import { readNdjson } from "./ndjson.js";
import { ChunkKind, OLLAMA_DEFAULT_BASE, ProviderId } from "./types.js";

const LOG_NS = "ai-summary:ollama";

const resolveOllamaBase = (baseUrl) => {
  const base = resolveProviderBaseUrl(baseUrl ?? "", OLLAMA_DEFAULT_BASE);
  try {
    const url = new URL(base);
    if (url.pathname === "/v1") return url.origin;
  } catch {}
  return base.replace(/\/$/, "");
};

const callOllama = (config, messages, opts) => {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
  return fetch(`${resolveOllamaBase(config.baseUrl)}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      think: !!opts.enableThinking,
      options: { num_predict: opts.maxTokens },
    }),
    signal: opts.signal,
  });
};

export const streamOllama = async function* (config, messages, opts) {
  let res;
  try {
    res = await callOllama(config, messages, opts);
  } catch (err) {
    console.warn(LOG_NS, "request failed", err);
    yield { kind: ChunkKind.Error, message: "AI request failed" };
    return;
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    console.warn(LOG_NS, `bad response ${res.status}`, text.slice(0, 200));
    yield { kind: ChunkKind.Error, message: `Provider returned ${res.status}` };
    return;
  }
  let finishReason;
  for await (const line of readNdjson(res.body)) {
    let payload;
    try {
      payload = JSON.parse(line);
    } catch {
      continue;
    }
    const thinking = payload.message?.thinking;
    if (thinking) yield { kind: ChunkKind.Thinking, text: thinking };
    const text = payload.message?.content;
    if (text) yield { kind: ChunkKind.Text, text };
    if (payload.done) {
      finishReason = payload.done_reason;
      break;
    }
  }
  yield { kind: ChunkKind.Done, finishReason };
};

export const ollamaAdapter = {
  id: ProviderId.Ollama,
  stream: streamOllama,
};
