let mathEnabled = true;

const HAS_DIGIT = /\d/;
const MAX_EXPR_LEN = 120;

const MATH_TOKEN =
  /\b(?:sqrt|cbrt|nthroot|abs|sign|sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|log|log10|log2|ln|exp|round|floor|ceil|pow|mod|gcd|lcm|factorial|pi|tau|phi|e)\b/g;
const OPERATOR = /[+\-*/^%]/;
const NON_FUNC_LEFTOVER = /^[0-9\s+\-*/.^(),%]*$/;
const MATHJS_API = "https://api.mathjs.org/v4/";

const CALC_KEYS = [
  ["C", "(", ")", "back"],
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "^", "+"],
  ["sqrt(", "%", ",", "="],
];

const KEY_LABEL = {
  "/": "÷",
  "*": "×",
  "-": "−",
  "sqrt(": "√",
  back: "⌫",
  "=": "=",
};

const _esc = (s) => {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const _sanitize = (expr) => {
  let s = expr.trim().toLowerCase();
  s = s.replace(/\[/g, "(").replace(/\]/g, ")");
  s = s.replace(/\{/g, "(").replace(/\}/g, ")");
  s = s.replace(/√/g, "sqrt(");
  s = s.replace(/root\(/g, "sqrt(");
  return s;
};

const _parseExpr = (query) => {
  const eq = query.indexOf("=");
  return (eq >= 0 ? query.slice(0, eq) : query).trim();
};

const _prettyNum = (text) => {
  const num = Number(text);
  if (!isNaN(num) && text.trim() !== "") {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(
      num,
    );
  }
  return text;
};

const _evaluate = async (expr, fetchFn) => {
  const safe = _sanitize(expr);
  const res = await fetchFn(`${MATHJS_API}?expr=${encodeURIComponent(safe)}`);
  if (!res.ok) return { ok: false, result: "" };
  const text = (await res.text()).trim();
  return { ok: true, result: _prettyNum(text), raw: text };
};

const _calcHtml = (expr, result) => {
  const rows = CALC_KEYS.map((row) => {
    const keys = row
      .map((k) => {
        const label = KEY_LABEL[k] ?? k;
        const cls =
          k === "="
            ? "math-calc-key math-calc-eq"
            : k === "C" || k === "back"
              ? "math-calc-key math-calc-fn"
              : "math-calc-key";
        return `<button type="button" class="${cls}" data-k="${_esc(k)}">${_esc(label)}</button>`;
      })
      .join("");
    return `<div class="math-calc-row">${keys}</div>`;
  }).join("");

  return `<div class="math-calc" data-math-calc>
  <div class="math-calc-screen">
    <input class="math-calc-expr" type="text" value="${_esc(expr)}" spellcheck="false" autocomplete="off" />
    <div class="math-calc-result">${result ? `= ${_esc(result)}` : ""}</div>
  </div>
  <div class="math-calc-keys">${rows}</div>
</div>`;
};

const _json = (body, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

export const slot = {
  isClientExposed: false,
  id: "math-slot",
  name: "Math",
  description:
    "Evaluates math expressions straight in the search bar and shows an interactive calculator.",
  position: "at-a-glance",

  settingsSchema: [
    {
      key: "enabled",
      label: "Enabled",
      type: "toggle",
    },
  ],

  configure(settings) {
    mathEnabled = settings?.enabled !== "false";
  },

  trigger(query) {
    const q = query.trim();
    if (!mathEnabled || q.length < 1 || q.length > MAX_EXPR_LEN) return false;

    const expr = _sanitize(_parseExpr(q));
    if (!HAS_DIGIT.test(expr)) return false;

    const leftover = expr.replace(MATH_TOKEN, " ");
    if (!NON_FUNC_LEFTOVER.test(leftover)) return false;

    const hasFunc = leftover !== expr;
    return hasFunc || OPERATOR.test(leftover);
  },

  async execute(query, context) {
    const fetchFn = context?.fetch || fetch;
    const expr = _parseExpr(query.trim());

    try {
      const out = await _evaluate(expr, fetchFn);
      return { html: _calcHtml(expr, out.ok ? out.result : "") };
    } catch {
      return { html: _calcHtml(expr, "") };
    }
  },
};

export const routes = [
  {
    method: "get",
    path: "/eval",
    handler: async (req) => {
      const expr = new URL(req.url).searchParams.get("expr") || "";
      if (!expr.trim()) return _json({ ok: false, error: "empty" }, 400);
      if (expr.length > MAX_EXPR_LEN) {
        return _json({ ok: false, error: "too-long" }, 400);
      }
      try {
        return _json(await _evaluate(expr, fetch));
      } catch (err) {
        console.error("[math-slot] eval route failed", err);
        return _json({ ok: false, error: "eval-failed" }, 502);
      }
    },
  },
];

export default { slot, routes };
