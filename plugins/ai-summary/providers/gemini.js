import { resolveProviderBaseUrl } from "./base-url.js";
import { readSse } from "./sse.js";
import { ChatRole, ChunkKind, GEMINI_DEFAULT_BASE, ProviderId } from "./types.js";

const LOG_NS = "ai-summary:gemini";

const toGeminiContents = (messages) => {
  const contents = [];
  let system = "";
  for (const m of messages) {
    if (m.role === ChatRole.System) {
      system += (system ? "\n\n" : "") + m.content;
      continue;
    }
    contents.push({
      role: m.role === ChatRole.Assistant ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  return { contents, system };
};

const callGemini = async (config, messages, opts) => {
  const base = resolveProviderBaseUrl(config.baseUrl ?? "", GEMINI_DEFAULT_BASE);
  const url = `${base}/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;
  const { contents, system } = toGeminiContents(messages);
  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: opts.maxTokens,
      thinkingConfig: opts.enableThinking
        ? { includeThoughts: true }
        : { thinkingBudget: 0 },
    },
  };
  if (system) body["systemInstruction"] = { parts: [{ text: system }] };
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
};

export const streamGemini = async function* (config, messages, opts) {
  let res;
  try {
    res = await callGemini(config, messages, opts);
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
  for await (const ev of readSse(res.body)) {
    let payload;
    try {
      payload = JSON.parse(ev.data);
    } catch {
      continue;
    }
    const cand = payload.candidates?.[0];
    if (!cand) continue;
    for (const part of cand.content?.parts ?? []) {
      if (!part.text) continue;
      if (part.thought) {
        yield { kind: ChunkKind.Thinking, text: part.text };
      } else {
        yield { kind: ChunkKind.Text, text: part.text };
      }
    }
    if (cand.finishReason) finishReason = cand.finishReason;
  }
  yield { kind: ChunkKind.Done, finishReason };
};

export const geminiAdapter = {
  id: ProviderId.Gemini,
  stream: streamGemini,
};
