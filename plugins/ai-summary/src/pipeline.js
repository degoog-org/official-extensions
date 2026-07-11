import { ChunkKind, pickAdapter } from "../providers/index.js";

const LOG_NS = "ai-summary:pipeline";
const THINK_ONLY_MS = 45_000;
const encoder = new TextEncoder();

export const writeSse = (controller, event, data) => {
  const payload = typeof data === "string" ? data : JSON.stringify(data ?? {});
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload}\n\n`));
};

export const sseResponse = (body) =>
  new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });

const pump = async (iter, controller) => {
  let errored = false;
  let finishReason;
  let text = "";
  for await (const ch of iter) {
    if (ch.kind === ChunkKind.Text) {
      text += ch.text;
      writeSse(controller, "delta", { text: ch.text });
    } else if (ch.kind === ChunkKind.Thinking) {
      writeSse(controller, "thinking", { text: ch.text });
    } else if (ch.kind === ChunkKind.Error) {
      errored = true;
      writeSse(controller, "error", { message: ch.message });
    } else if (ch.kind === ChunkKind.Done) {
      finishReason = ch.finishReason;
    }
  }
  return { finishReason, errored, text };
};

export const runStream = (messages, maxTokens, cacheKey, settings, cache) => {
  const adapter = pickAdapter(settings.provider);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), settings.timeoutMs);

  const body = new ReadableStream({
    async start(controller) {
      let watchdog = null;
      try {
        if (cacheKey && cache) {
          const cached = await cache.get(cacheKey);
          if (cached) {
            writeSse(controller, "delta", { text: cached });
            writeSse(controller, "done", { finishReason: "cache" });
            return;
          }
        }
        if (!settings.enableThinking) {
          watchdog = setTimeout(() => {
            console.warn(LOG_NS, "no text within window, aborting");
            abort.abort();
          }, THINK_ONLY_MS);
        }
        const iter = adapter.stream(
          { baseUrl: settings.baseUrl, model: settings.model, apiKey: settings.apiKey },
          messages,
          { maxTokens, enableThinking: settings.enableThinking, signal: abort.signal },
        );
        const wrapped = (async function* () {
          for await (const ch of iter) {
            if (ch.kind === ChunkKind.Text && watchdog) {
              clearTimeout(watchdog);
              watchdog = null;
            }
            yield ch;
          }
        })();
        const out = await pump(wrapped, controller);
        if (out.errored) return;
        if (!out.text.trim()) {
          writeSse(controller, "error", { message: "Model produced no answer" });
          return;
        }
        if (cacheKey && cache) {
          try {
            await cache.set(cacheKey, out.text);
          } catch (err) {
            console.warn(LOG_NS, "cache set failed", err);
          }
        }
        writeSse(controller, "done", { finishReason: out.finishReason ?? "stop" });
      } catch (err) {
        console.warn(LOG_NS, "stream failed", err);
        try { writeSse(controller, "error", { message: "Stream failed" }); } catch {}
      } finally {
        if (watchdog) clearTimeout(watchdog);
        clearTimeout(timeout);
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      clearTimeout(timeout);
      abort.abort();
    },
  });

  return sseResponse(body);
};
