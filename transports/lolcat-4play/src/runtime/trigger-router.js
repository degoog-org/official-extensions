const QUERY_PARAM_KEYS = ["q", "query", "p", "text", "k", "wd", "search"];

const queryOf = (url) => {
  try {
    const params = new URL(url).searchParams;
    for (const key of QUERY_PARAM_KEYS) {
      const value = params.get(key);
      if (value && value.trim()) return value.trim();
    }
  } catch {
    return "";
  }
  return "";
};

const sameEngine = (rowEngine, engineId) =>
  String(rowEngine || "").trim().toLowerCase() === String(engineId || "").trim().toLowerCase();

export class TriggerRouter {
  constructor({ triggers }) {
    this._triggers = triggers;
  }

  match(engineId, url) {
    if (!engineId) return null;

    const rows = this._triggers() || [];
    for (const row of rows) {
      if (!row?.trigger || !row.engine) continue;
      if (!sameEngine(row.engine, engineId)) continue;

      const query = queryOf(url);
      if (!query) return null;
      return { trigger: row.trigger, engine: row.engine, query };
    }
    return null;
  }
}
