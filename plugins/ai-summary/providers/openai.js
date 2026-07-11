import { readSse } from "./sse.js";
import { ChunkKind, ProviderId } from "./types.js";

const LOG_NS = "ai-summary:openai";
const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";
const STOP_MARKERS = ["<|endoftext|>", "<|im_end|>", "<|im_start|>"];

const pickReason = (d) => {
  if (!d) return undefined;
  if (typeof d.reasoning_content === "string") return d.reasoning_content;
  if (typeof d.reasoning === "string") return d.reasoning;
  if (d.reasoning && typeof d.reasoning === "object") return d.reasoning.content;
  if (typeof d.thinking === "string") return d.thinking;
  return undefined;
};

const firstStop = (s) => {
  let idx = -1;
  for (const m of STOP_MARKERS) {
    const i = s.indexOf(m);
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  return idx;
};

const makeSplitter = () => {
  let inThink = false;
  let carry = "";
  return (raw) => {
    let work = carry + raw;
    carry = "";
    let think = "";
    let text = "";
    while (work.length > 0) {
      const tag = inThink ? THINK_CLOSE : THINK_OPEN;
      const hit = work.indexOf(tag);
      if (hit < 0) {
        const partial = work.lastIndexOf("<");
        if (partial >= 0 && tag.startsWith(work.slice(partial))) {
          inThink ? (think += work.slice(0, partial)) : (text += work.slice(0, partial));
          carry = work.slice(partial);
          break;
        }
        inThink ? (think += work) : (text += work);
        break;
      }
      inThink ? (think += work.slice(0, hit)) : (text += work.slice(0, hit));
      work = work.slice(hit + tag.length);
      inThink = !inThink;
    }
    const stopAt = firstStop(text);
    if (stopAt >= 0) return { think, text: text.slice(0, stopAt), stopped: true };
    return { think, text, stopped: false };
  };
};

const buildBody = (config, messages, opts) => {
  const body = {
    model: config.model,
    messages,
    stream: true,
    max_tokens: opts.maxTokens,
  };
  if (opts.enableThinking) {
    body.reasoning_effort = "medium";
    body.chat_template_kwargs = { enable_thinking: true };
    body.enable_thinking = true;
    body.thinking = { type: "enabled" };
  }
  return body;
};

const callOpenAI = (config, messages, opts) => {
  const headers = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
  return fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(buildBody(config, messages, opts)),
    signal: opts.signal,
  });
};

export const streamOpenAI = async function* (config, messages, opts) {
  let res;
  try {
    res = await callOpenAI(config, messages, opts);
  } catch (err) {
    console.warn(LOG_NS, "request failed", err);
    yield { kind: ChunkKind.Error, message: "AI request failed" };
    return;
  }
  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => "");
    console.warn(LOG_NS, `bad response ${res.status}`, errBody.slice(0, 200));
    yield { kind: ChunkKind.Error, message: `Provider returned ${res.status}` };
    return;
  }
  const split = makeSplitter();
  let finishReason;
  let textOut = false;
  let stopped = false;

  for await (const ev of readSse(res.body)) {
    if (ev.data === "[DONE]") break;
    let payload;
    try {
      payload = JSON.parse(ev.data);
    } catch {
      continue;
    }
    const choice = payload.choices?.[0];
    if (!choice) continue;

    const reason = pickReason(choice.delta);
    if (reason) yield { kind: ChunkKind.Thinking, text: reason };

    const raw = choice.delta?.content;
    if (raw) {
      const parts = split(raw);
      if (parts.think) yield { kind: ChunkKind.Thinking, text: parts.think };
      if (parts.text) {
        textOut = true;
        yield { kind: ChunkKind.Text, text: parts.text };
      }
      if (parts.stopped) {
        stopped = true;
        finishReason = finishReason ?? "stop";
        break;
      }
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  if (!textOut) {
    console.warn(LOG_NS, "no text emitted", { finishReason });
  }
  yield { kind: ChunkKind.Done, finishReason: stopped ? "stop" : finishReason };
};

export const openAIAdapter = {
  id: ProviderId.OpenAICompat,
  stream: streamOpenAI,
};
