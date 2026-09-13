import {
  loadStats,
  recordRun,
  snapshot,
  setRetention,
  BUCKET_MS,
} from "./src/store.js";
import { tableHtml, summaryHtml, windowsHtml } from "./src/render.js";

export const WINDOWS = ["1h", "6h", "24h", "48h"];
export const DEFAULT_WINDOW = "24h";
export const TRIGGER = "engine-stats";

let _template = "";
let _defaultWindow = DEFAULT_WINDOW;

const log = (msg, err) => {
  if (err) console.warn(`[engine-stats] ${msg}`, err);
  else console.warn(`[engine-stats] ${msg}`);
};

const pickWindow = (args) => {
  const wanted = String(args ?? "").trim().toLowerCase();
  if (WINDOWS.includes(wanted)) return wanted;
  return _defaultWindow;
};

const windowMs = (label) => parseInt(label, 10) * BUCKET_MS;

const applySettings = (settings) => {
  setRetention(settings?.retentionHours ?? 48);
  const wanted = String(settings?.defaultWindow ?? DEFAULT_WINDOW);
  _defaultWindow = WINDOWS.includes(wanted) ? wanted : DEFAULT_WINDOW;
};

export const plugin = {
  id: "engine-stats",
  name: "Engine stats",
  description:
    "Records per-engine response times, failure rates and result counts, then shows them with !engine-stats.",
  settingsSchema: [
    {
      key: "retentionHours",
      label: "Retention (hours)",
      type: "number",
      default: "48",
      description:
        "How much history to keep. Older hourly buckets are dropped. Max 336.",
    },
    {
      key: "defaultWindow",
      label: "Default window",
      type: "select",
      default: DEFAULT_WINDOW,
      options: WINDOWS,
      description: "Window shown when !engine-stats is used without an argument.",
    },
  ],
};

export const interceptor = {
  isClientExposed: false,
  name: "Engine stats recorder",
  description: "Passive recorder for per-engine search telemetry.",
  priority: -100,

  configure(settings) {
    applySettings(settings);
  },

  async init() {
    await loadStats();
  },

  async intercept(query) {
    return { query };
  },

  observe(report) {
    try {
      recordRun(report);
    } catch (err) {
      log("failed to record engine run", err);
    }
  },
};

export const command = {
  isClientExposed: false,
  name: "Engine stats",
  description: "Shows per-engine response times, failure rates and result counts.",
  trigger: TRIGGER,
  aliases: ["enginestats", "estats"],
  naturalLanguagePhrases: ["engine stats", "engine statistics", "engine health"],

  configure(settings) {
    applySettings(settings);
  },

  async init(ctx) {
    _template = ctx.template;
    await loadStats();
  },

  async execute(args) {
    const label = pickWindow(args);
    const rows = snapshot(windowMs(label));

    const html = _template
      .replace(/\{\{window\}\}/g, label)
      .replace(/\{\{tabs\}\}/g, windowsHtml(WINDOWS, label))
      .replace(/\{\{summary\}\}/g, summaryHtml(rows))
      .replace(/\{\{table\}\}/g, tableHtml(rows));

    return { title: `Engine stats (last ${label})`, html };
  },
};

