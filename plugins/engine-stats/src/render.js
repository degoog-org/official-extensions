export const HEALTHY_FAIL_PCT = 5;
export const SHAKY_FAIL_PCT = 25;

const esc = (value) => {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const ms = (value) => {
  if (value == null) return "-";
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${value}ms`;
};

const pct = (value) => `${value.toFixed(1)}%`;

const overflowMs = (value, fresh) => {
  if (fresh === 0) return "-";
  return value == null ? "16s+" : ms(value);
};

const healthOf = (row) => {
  if (row.fresh === 0) return "idle";
  if (row.failRate >= SHAKY_FAIL_PCT) return "down";
  if (row.failRate >= HEALTHY_FAIL_PCT || row.zeroRate >= SHAKY_FAIL_PCT)
    return "shaky";
  return "healthy";
};

const errorCell = (row) => {
  if (!row.lastError) return "<span class=\"es-muted\">-</span>";
  const { status, reason, httpStatus } = row.lastError;
  const code = httpStatus ? ` ${httpStatus}` : "";
  const title = reason ? ` title="${esc(reason)}"` : "";
  return `<span class="es-error"${title}>${esc(status)}${esc(code)}</span>`;
};

const statusChips = (status) =>
  Object.entries(status)
    .filter(([name]) => name !== "ok")
    .sort((a, b) => b[1] - a[1])
    .map(
      ([name, count]) =>
        `<span class="es-chip">${esc(name)} ${esc(count)}</span>`,
    )
    .join("");

const rowHtml = (row) => {
  const health = healthOf(row);
  return `
    <tr class="es-row es-row--${health}">
      <td class="es-engine">
        <span class="es-dot es-dot--${health}"></span>
        <span class="es-name">${esc(row.name)}</span>
        <span class="es-chips">${statusChips(row.status)}</span>
      </td>
      <td>${esc(row.fresh)}<span class="es-muted"> / ${esc(row.total)}</span></td>
      <td class="es-num es-fail">${pct(row.failRate)}</td>
      <td class="es-num">${ms(row.avgTime)}</td>
      <td class="es-num">${overflowMs(row.p50, row.fresh)}</td>
      <td class="es-num">${overflowMs(row.p90, row.fresh)}</td>
      <td class="es-num">${overflowMs(row.p95, row.fresh)}</td>
      <td class="es-num">${ms(row.maxTime)}</td>
      <td class="es-num">${row.avgResults == null ? "-" : row.avgResults.toFixed(1)}</td>
      <td class="es-num">${pct(row.zeroRate)}</td>
      <td class="es-num es-muted">${pct(row.cacheRate)}</td>
      <td>${errorCell(row)}</td>
    </tr>`;
};

const HEAD_CELLS = [
  ["Engine", ""],
  ["Runs", "fresh upstream calls / total including cache replays"],
  ["Fail", "share of fresh calls that errored"],
  ["Avg", "mean response time of fresh calls"],
  ["p50", "bucketed median"],
  ["p90", "bucketed 90th percentile"],
  ["p95", "bucketed 95th percentile"],
  ["Max", "slowest fresh call"],
  ["Results", "mean results per fresh call"],
  ["Empty", "share of successful calls returning nothing"],
  ["Cached", "share of runs served from cache"],
  ["Last error", "most recent failure in this window"],
];

const headHtml = () =>
  HEAD_CELLS.map(
    ([label, hint]) =>
      `<th${hint ? ` title="${esc(hint)}"` : ""}>${esc(label)}</th>`,
  ).join("");

export const tableHtml = (rows) => {
  if (rows.length === 0) {
    return `<p class="es-empty">No engine runs recorded in this window yet.</p>`;
  }
  return `
    <div class="es-table-wrap">
      <table class="es-table">
        <thead><tr>${headHtml()}</tr></thead>
        <tbody>${rows.map(rowHtml).join("")}</tbody>
      </table>
    </div>`;
};

export const summaryHtml = (rows) => {
  const fresh = rows.reduce((sum, r) => sum + r.fresh, 0);
  const errors = rows.reduce((sum, r) => sum + r.errors, 0);
  const failing = rows.filter((r) => healthOf(r) !== "healthy").length;
  const cards = [
    ["Engines", rows.length],
    ["Fresh calls", fresh],
    ["Failures", errors],
    ["Needs a look", failing],
  ];
  return cards
    .map(
      ([label, value]) =>
        `<div class="es-card"><span class="es-card-value">${esc(value)}</span><span class="es-card-label">${esc(label)}</span></div>`,
    )
    .join("");
};

export const windowsHtml = (windows, active) =>
  windows
    .map(
      (w) =>
        `<a class="es-tab${w === active ? " es-tab--on" : ""}" href="/search?q=${encodeURIComponent(`!engine-stats ${w}`)}">${esc(w)}</a>`,
    )
    .join("");
