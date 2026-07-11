import { ProviderId } from "./providers/index.js";
import { DEFAULT_SYSTEM_PROMPT } from "./src/prompt.js";
import { parseSettings, settingsSchema, FOLLOWUP_MIN_TOKENS } from "./src/settings.js";
import { buildSources, buildUserPrompt, buildPanelHtml, summaryCacheKey } from "./src/panel.js";
import { runStream } from "./src/pipeline.js";

const AI_SUMMARY_ID = "ai-summary-slot";
const SUMMARY_NAMESPACE = "ext:ai-summary:summary";
const SHORT_TTL_MS = 2 * 60 * 1000;
const ROUTE_STREAM = "/stream";
const ROUTE_CHAT = "/chat";

let _settings = parseSettings({});
let _summaryCache = null;

const resolveCache = (ctx) => {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache(SUMMARY_NAMESPACE, SHORT_TTL_MS);
  }
  if (typeof ctx?.createCache === "function") {
    const sync = ctx.createCache(SHORT_TTL_MS);
    return {
      get: async (k) => sync.get(k),
      set: async (k, v) => sync.set(k, v),
      delete: async (k) => { if (typeof sync.delete === "function") sync.delete(k); },
      clear: async () => sync.clear(),
    };
  }
  return null;
};

const buildSummaryMsgs = (query, results) => {
  const sources = buildSources(results);
  return [
    { role: "system", content: _settings.systemPrompt || DEFAULT_SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(query, sources) },
  ];
};

const jsonError = (msg, status) =>
  new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const slot = {
  id: AI_SUMMARY_ID,
  settingsId: AI_SUMMARY_ID,
  name: "AI Summary",
  waitForResults: true,
  get description() {
    return this.t?.("ai-summary.description") ?? "AI Summary";
  },
  position: "at-a-glance",
  isClientExposed: false,

  async init(ctx) {
    _summaryCache = resolveCache(ctx);
  },

  configure(s) {
    _settings = parseSettings(s ?? {});
  },

  async trigger(query) {
    if (!_settings.model) return false;
    if (_settings.provider === ProviderId.OpenAICompat && !_settings.baseUrl) return false;
    if (_settings.provider !== ProviderId.OpenAICompat && !_settings.apiKey) return false;
    if (_settings.questionMarkOnly && !query.trim().endsWith("?")) return false;
    return true;
  },

  async execute(query, context) {
    const results = context?.results ?? [];
    if (results.length === 0) return { html: "" };
    if (!_settings.model) return { html: "" };
    if (_settings.questionMarkOnly && !query.trim().endsWith("?")) return { html: "" };
    const sources = buildSources(results);
    return { html: buildPanelHtml(this.t, query.trim(), sources) };
  },

  settingsSchema,
};

export const routes = [
  {
    method: "post",
    path: ROUTE_STREAM,
    async handler(req) {
      let body;
      try {
        body = await req.json();
      } catch {
        return jsonError("Invalid JSON", 400);
      }
      const query = (body.query ?? "").trim();
      const results = Array.isArray(body.results) ? body.results : [];
      if (!query || results.length === 0) return jsonError("Missing query or results", 400);
      if (!_settings.model) return jsonError("AI summary not configured", 400);
      if (_settings.questionMarkOnly && !query.endsWith("?")) return jsonError("Question-only mode", 403);
      return runStream(buildSummaryMsgs(query, results), _settings.maxTokens, summaryCacheKey(query, results), _settings, _summaryCache);
    },
  },
  {
    method: "post",
    path: ROUTE_CHAT,
    async handler(req) {
      let body;
      try {
        body = await req.json();
      } catch {
        return jsonError("Invalid JSON", 400);
      }
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return jsonError("Missing messages", 400);
      }
      if (!_settings.model) return jsonError("AI summary not configured", 400);
      return runStream(body.messages, Math.max(_settings.maxTokens, FOLLOWUP_MIN_TOKENS), null, _settings, _summaryCache);
    },
  },
];
