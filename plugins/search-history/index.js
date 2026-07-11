import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const CLOCK_ICON =
  "<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' aria-hidden='true'><circle cx='12' cy='12' r='10'/><path d='M12 6v6l4 2'/></svg>";
const TRASH_ICON =
  "<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' aria-hidden='true'><path d='M3 6h18v2l-2 14H5L3 8V6z'/><path d='M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2'/><path d='M10 11v6'/><path d='M14 11v6'/></svg>";

const HISTORY_PATH = join(process.cwd(), "data", "history.json");
const PER_PAGE = 20;
let maxEntries = 1000;
let apiBase = "";

const _getDataDir = () => {
  return join(process.cwd(), "data");
}

const _loadHistory = async () => {
  try {
    const raw = await readFile(HISTORY_PATH, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    await _saveHistory([]);
    return [];
  }
}

const _saveHistory = async (entries) => {
  const dir = _getDataDir();
  await mkdir(dir, { recursive: true });
  await writeFile(HISTORY_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

const _esc = (s) => {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const _formatTimestamp = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default {
  isClientExposed: false,
  name: "Search history",
  description: "Stores search history in data/history.json with timestamps; !history shows a paginated, deletable list.",
  trigger: "history",
  aliases: [],
  naturalLanguagePhrases: ["search history", "history"],

  settingsSchema: [
    {
      key: "maxEntries",
      label: "Max entries",
      type: "text",
      placeholder: "1000",
      description: "Maximum number of history entries to keep (oldest removed when exceeded).",
    },
  ],

  init(ctx) {
    apiBase = ctx.apiBase;
  },

  configure(settings) {
    const n = parseInt(settings.maxEntries, 10);
    maxEntries = Number.isFinite(n) && n > 0 ? Math.min(100000, n) : 1000;
  },

  async execute(args, context) {
    const pageFromArgs = parseInt(String(args || "").trim(), 10);
    const pageNum = Math.max(1, context?.page ?? (Number.isFinite(pageFromArgs) ? pageFromArgs : 1));
    const entries = await _loadHistory();
    const newestFirst = [...entries].reverse();
    const totalPages = Math.max(1, Math.ceil(newestFirst.length / PER_PAGE));
    const page = Math.min(pageNum, totalPages);
    const start = (page - 1) * PER_PAGE;
    const slice = newestFirst.slice(start, start + PER_PAGE);

    let items = "";
    for (const item of slice) {
      const entry = _esc(String(item.entry ?? ""));
      const ts = _formatTimestamp(item.timestamp);
      const timeStr = _esc(ts);
      const searchUrl = `/search?q=${encodeURIComponent(item.entry ?? "")}`;
      const deleteUrl = `${apiBase}/delete?id=${encodeURIComponent(item.id)}&return=bang`;
      items += `<div class="result-item"><div class="result-body"><div class="result-url-row"><span class="result-favicon result-favicon--clock">${CLOCK_ICON}</span><cite class="result-cite">${timeStr}</cite><a href="${_esc(deleteUrl)}" class="history-delete-btn" aria-label="Delete">${TRASH_ICON}</a></div><a class="result-title" href="${_esc(searchUrl)}">${entry}</a></div></div>`;
    }

    const noResults = slice.length === 0 ? '<div class="no-results">No history yet.</div>' : "";
    const html = `<div class="search-history-result">${items || noResults}</div>`;
    return { title: "Search history", html, totalPages };
  },

  routes: [
    {
      method: "get",
      path: "/list",
      handler: async (req) => {
        const url = new URL(req.url);
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam, 10) || 10)) : null;
        const entries = await _loadHistory();
        const newestFirst = [...entries].reverse();
        const out = limit ? newestFirst.slice(0, limit) : newestFirst;
        return new Response(JSON.stringify(out), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
    {
      method: "post",
      path: "/append",
      handler: async (req) => {
        let body;
        try {
          const text = await req.text();
          body = text ? JSON.parse(text) : {};
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        const entry = typeof body.entry === "string" ? body.entry.trim() : "";
        if (!entry) {
          return new Response(JSON.stringify({ error: "Missing or empty entry" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        if (entry === "!history" || entry.startsWith("!history ")) {
          return new Response(JSON.stringify({ error: "Cannot store bang command" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        const history = await _loadHistory();
        const entryLower = entry.toLowerCase();
        const existingIdx = history.findIndex((e) => String(e.entry || "").toLowerCase() === entryLower);
        const timestamp = new Date().toISOString();
        let id;
        let storedEntry = entry;
        if (existingIdx >= 0) {
          const existing = history[existingIdx];
          id = existing.id;
          storedEntry = existing.entry;
          history.splice(existingIdx, 1);
          history.push({ id, entry: storedEntry, timestamp });
        } else {
          id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          history.push({ id, entry, timestamp });
          while (history.length > maxEntries) {
            history.shift();
          }
        }
        await _saveHistory(history);
        return new Response(JSON.stringify({ id, entry: storedEntry, timestamp }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
    {
      method: "get",
      path: "/delete",
      handler: async (req) => {
        const url = new URL(req.url);
        const id = url.searchParams.get("id");
        const returnBang = url.searchParams.get("return") === "bang";
        if (!id) {
          return new Response(JSON.stringify({ error: "Missing id" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        const history = await _loadHistory();
        const idx = history.findIndex((e) => String(e.id) === String(id));
        if (idx === -1) {
          if (returnBang) {
            const base = new URL(req.url);
            return Response.redirect(`${base.origin}/search?q=${encodeURIComponent("!history")}`, 302);
          }
          return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
        }
        history.splice(idx, 1);
        await _saveHistory(history);
        if (returnBang) {
          const base = new URL(req.url);
          return Response.redirect(`${base.origin}/search?q=${encodeURIComponent("!history")}`, 302);
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    },
  ],
};
