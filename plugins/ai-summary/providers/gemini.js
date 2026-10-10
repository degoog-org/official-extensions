import { resolveProviderBaseUrl } from "./base-url.js";
import { reasoningEffortField } from "./fields.js";
import { withExtras } from "./headers.js";
import { readSse } from "./sse.js";
import { ChatRole, ChunkKind, GEMINI_DEFAULT_BASE, ProviderId, ReasoningEffort } from "./types.js";

const LOG_NS = "ai-summary:gemini";
const LEGACY_MODEL = /^(models\/)?gemini-(1|2)(\.|-)/;
const BAD_REQUEST = 400;

const toGeminiContents = (messages, systemAsUser = false) => {
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
  if (systemAsUser && system) {
    const first = contents[0];
    if (first?.role === "user") first.parts.unshift({ text: system });
    else contents.unshift({ role: "user", parts: [{ text: system }] });
    system = "";
  }
  return { contents, system };
};

export const thinkingVariants = (model, opts) => {
  const legacy = LEGACY_MODEL.test(model ?? "");
  if (opts.enableThinking) {
    const level = opts.reasoningEffort ?? ReasoningEffort.Medium;
    const leveled = { includeThoughts: true, thinkingLevel: level };
    return legacy
      ? [{ includeThoughts: true }, leveled]
      : [leveled, { includeThoughts: true }];
  }
  const off = [{ thinkingLevel: "minimal" }, { thinkingLevel: "low" }];
  return legacy ? [{ thinkingBudget: 0 }, ...off] : [...off, { thinkingBudget: 0 }];
};

export const requestVariants = (model, opts) => [
  ...thinkingVariants(model, opts).map((thinkingConfig) => ({ thinkingConfig, systemAsUser: false })),
  { thinkingConfig: null, systemAsUser: false },
  { thinkingConfig: null, systemAsUser: true },
];

export const buildGeminiBody = (messages, opts, variant) => {
  const { contents, system } = toGeminiContents(messages, variant.systemAsUser);
  const generationConfig = { maxOutputTokens: opts.maxTokens };
  if (variant.thinkingConfig) generationConfig.thinkingConfig = variant.thinkingConfig;
  const body = { contents, generationConfig };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return body;
};

const callGemini = (config, messages, opts, variant) => {
  const base = resolveProviderBaseUrl(config.baseUrl ?? "", GEMINI_DEFAULT_BASE);
  const url = `${base}/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;
  return fetch(url, {
    method: "POST",
    headers: withExtras({
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    }, config),
    body: JSON.stringify(buildGeminiBody(messages, opts, variant)),
    signal: opts.signal,
  });
};

const workingVariant = new Map();

const variantKey = (config, opts) =>
  `${config.baseUrl ?? ""}|${config.model}|${!!opts.enableThinking}|${opts.reasoningEffort ?? ""}`;

const describe = (variant) =>
  JSON.stringify({ thinkingConfig: variant.thinkingConfig, systemAsUser: variant.systemAsUser });

const requestWithFallback = async (config, messages, opts) => {
  const variants = requestVariants(config.model, opts);
  const key = variantKey(config, opts);
  const start = workingVariant.get(key) ?? 0;
  let res;
  for (let i = start; i < variants.length; i++) {
    res = await callGemini(config, messages, opts, variants[i]);
    if (res.status !== BAD_REQUEST || i === variants.length - 1) {
      if (res.ok) workingVariant.set(key, i);
      return res;
    }
    const text = await res.text().catch(() => "");
    console.warn(LOG_NS, `400 with ${describe(variants[i])}, trying the next request shape`, text.slice(0, 200));
  }
  return res;
};

export const streamGemini = async function* (config, messages, opts) {
  let res;
  try {
    res = await requestWithFallback(config, messages, opts);
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
  settings: {
    label: "Google Gemini",
    requires: { baseUrl: false, apiKey: true },
    notes:
      "Needs a key from [Google AI Studio](https://aistudio.google.com/apikey). A blank base URL uses `https://generativelanguage.googleapis.com/v1beta`. Gemini 3 models can't turn thinking off, so with thinking off they run at the lowest level the model takes.",
    fields: [reasoningEffortField],
  },
};
