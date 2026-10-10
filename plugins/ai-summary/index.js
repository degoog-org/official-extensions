import {
  adapterRequirements,
  ChatRole,
  DetectSource,
  effectiveProviderId,
  forgetDetection,
  listModels,
  PROVIDER_LABELS,
  PROVIDER_ORDER,
  sniffProvider,
} from "./providers/index.js";
import { DEFAULT_SYSTEM_PROMPT } from "./src/prompt.js";
import { parseSettings, settingsSchema, FOLLOWUP_MIN_TOKENS } from "./src/settings.js";
import { buildSources, buildUserPrompt, buildPanelHtml, summaryCacheKey } from "./src/panel.js";
import { runStream } from "./src/pipeline.js";
import { cleanChatMessages } from "./src/messages.js";

const AI_SUMMARY_ID = "ai-summary-slot";
const MODEL_FIELD_KEY = "model";
const PROVIDER_FIELD_KEY = "provider";
const SUMMARY_NAMESPACE = "ext:ai-summary:summary";
const SHORT_TTL_MS = 2 * 60 * 1000;
const ROUTE_STREAM = "/stream";
const ROUTE_CHAT = "/chat";
const ROUTE_ANIMATIONS = "/animations.js";

let _settings = parseSettings({});
let _summaryCache = null;
let _animationsSource = "";

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

const providerOptions = () =>
  PROVIDER_ORDER.map((id) => ({ value: id, label: PROVIDER_LABELS[id] ?? id }));

const detectProvider = async (settings) => {
  forgetDetection(settings.baseUrl);
  const found = await sniffProvider(settings.baseUrl, settings.apiKey);
  const options = providerOptions();
  if (found.source === DetectSource.Fallback) {
    return {
      options,
      notice: `Could not identify ${found.origin}. Pick a provider yourself; OpenAI compatible is the safe bet.`,
    };
  }
  const where = settings.baseUrl.trim()
    ? `at ${found.origin}`
    : `on the default ${found.origin}, since no base URL is set`;
  return {
    options,
    value: found.id,
    notice: `Detected ${PROVIDER_LABELS[found.id]} ${where}.`,
  };
};

const fetchModels = async (settings) => {
  const id = effectiveProviderId(settings.provider, settings.openAICompatProvider);
  const options = await listModels(id, settings);
  const label = PROVIDER_LABELS[id] ?? id;
  return {
    options,
    notice: options.length
      ? `${options.length} models served over the ${label} API.`
      : `No models came back from the ${label} API. Check the base URL and key, or type the model id yourself.`,
  };
};

const LANGUAGE_RE = /^[a-z]{2}$/;

const pickLanguage = (raw) => {
  const code = String(raw ?? "").trim().toLowerCase();
  return LANGUAGE_RE.test(code) ? code : "";
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
    return this.t?.("ai-summary-slot.description") ?? "AI Summary";
  },
  position: "at-a-glance",
  isClientExposed: false,

  async init(ctx) {
    _summaryCache = resolveCache(ctx);
    _animationsSource = (await ctx.readFile?.("animations.js")) ?? "";
  },

  configure(s) {
    _settings = parseSettings(s ?? {});
    forgetDetection(_settings.baseUrl);
  },

  async getFieldOptions(key, values) {
    const settings = parseSettings(values ?? {});
    if (key === PROVIDER_FIELD_KEY) return detectProvider(settings);
    if (key === MODEL_FIELD_KEY) return fetchModels(settings);
    return { options: [] };
  },

  async trigger(query) {
    if (!_settings.model) return false;
    const reqs = adapterRequirements(_settings.provider, _settings.openAICompatProvider);
    if (reqs.baseUrl && !_settings.baseUrl) return false;
    if (reqs.apiKey && !_settings.apiKey) return false;
    if (_settings.questionMarkOnly && !query.trim().endsWith("?")) return false;
    return true;
  },

  async execute(query, context) {
    const results = context?.results ?? [];
    if (results.length === 0) return { html: "" };
    if (!_settings.model) return { html: "" };
    if (_settings.questionMarkOnly && !query.trim().endsWith("?")) return { html: "" };
    const sources = buildSources(results, context?.signFaviconUrl);
    return {
      html: buildPanelHtml(
        this.t,
        query.trim(),
        sources,
        _settings.hideOnError,
        _settings.enableInputStyling,
        _settings.openLinksInNewTab,
      ),
    };
  },

  settingsSchema,
};

export const routes = [
  {
    method: "get",
    path: ROUTE_ANIMATIONS,
    handler: () =>
      _animationsSource
        ? new Response(_animationsSource, {
            headers: { "Content-Type": "text/javascript", "Cache-Control": "no-cache" },
          })
        : jsonError("Not ready", 503),
  },
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
      const language = pickLanguage(body.language);
      return runStream(
        buildSummaryMsgs(query, results),
        _settings.maxTokens,
        `${summaryCacheKey(query, results)}${language ? `|${language}` : ""}`,
        _settings,
        _summaryCache,
        query,
        language,
      );
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
      const messages = Array.isArray(body.messages) ? cleanChatMessages(body.messages) : [];
      if (!messages.some((m) => m.role === ChatRole.User)) {
        return jsonError("Missing messages", 400);
      }
      if (!_settings.model) return jsonError("AI summary not configured", 400);
      return runStream(
        messages,
        Math.max(_settings.maxTokens, FOLLOWUP_MIN_TOKENS),
        null,
        _settings,
        _summaryCache,
        String(messages[0]?.content ?? ""),
        pickLanguage(body.language),
      );
    },
  },
];
