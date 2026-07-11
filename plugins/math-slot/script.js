const EVAL_API = `/api/plugin/${__PLUGIN_ID__}/eval`;
const INPUT_IDS = ["search-input", "results-search-input"];
const HAS_DIGIT = /\d/;
const EVAL_DEBOUNCE = 200;

const _eval = async (expr) => {
  try {
    const res = await fetch(`${EVAL_API}?expr=${encodeURIComponent(expr)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.ok ? data.result : null;
  } catch (err) {
    console.debug("[math-slot] eval failed", err);
    return null;
  }
};

const _stripResult = (input) => {
  const eq = input.value.indexOf("=");
  if (eq < 0) return;
  const caret = input.selectionStart ?? input.value.length;
  const next = input.value.slice(0, eq).replace(/\s+$/, "");
  input.value = next;
  const pos = Math.min(caret, next.length);
  input.setSelectionRange(pos, pos);
};

const _onType = async (input) => {
  const v = input.value;
  if (!v.endsWith("=")) return;
  const expr = v.slice(0, -1).trim();
  if (!expr || expr.includes("=") || !HAS_DIGIT.test(expr)) return;
  const result = await _eval(expr);
  if (result == null || input.value !== v) return;
  const computed = `${v} ${result}`;
  input.value = computed;
  input.dataset.mathComputed = computed;
};

const _onInput = (input) => {
  const computed = input.dataset.mathComputed;
  if (computed !== undefined) {
    delete input.dataset.mathComputed;
    if (input.value !== computed) {
      _stripResult(input);
      return;
    }
  }
  void _onType(input);
};

const _wireInputs = () => {
  INPUT_IDS.forEach((id) => {
    const input = document.getElementById(id);
    if (!input || input.dataset.mathWired) return;
    input.dataset.mathWired = "1";
    input.addEventListener("input", () => _onInput(input));
  });
};

const _runCalc = async (input, out) => {
  const expr = input.value.trim();
  if (!expr) {
    out.textContent = "";
    return;
  }
  const result = await _eval(expr);
  out.textContent = result == null ? "" : `= ${result}`;
};

const _backspace = (input) => {
  const end = input.selectionEnd ?? input.value.length;
  const start = input.selectionStart ?? end;
  const cut = start === end ? Math.max(0, start - 1) : start;
  input.value = input.value.slice(0, cut) + input.value.slice(end);
  input.setSelectionRange(cut, cut);
};

const _insert = (input, token) => {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + token + input.value.slice(end);
  const pos = start + token.length;
  input.setSelectionRange(pos, pos);
};

const _enhanceCalc = (calc) => {
  if (calc.dataset.mathEnhanced) return;
  const input = calc.querySelector(".math-calc-expr");
  const out = calc.querySelector(".math-calc-result");
  if (!input || !out) return;
  calc.dataset.mathEnhanced = "1";

  let timer;
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void _runCalc(input, out), EVAL_DEBOUNCE);
  };

  input.addEventListener("input", debounced);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void _runCalc(input, out);
  });

  calc.querySelectorAll(".math-calc-key").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.k;
      if (k === "C") {
        input.value = "";
        out.textContent = "";
      } else if (k === "back") {
        _backspace(input);
        debounced();
      } else if (k === "=") {
        void _runCalc(input, out);
      } else {
        _insert(input, k);
        debounced();
      }
      input.focus();
    });
  });
};

const _scanCalcs = (node) => {
  if (!node || node.nodeType !== 1) return;
  if (node.matches && node.matches(".math-calc")) _enhanceCalc(node);
  if (node.querySelectorAll) {
    node.querySelectorAll(".math-calc").forEach(_enhanceCalc);
  }
};

const _init = () => {
  _wireInputs();
  _scanCalcs(document.body);
  const obs = new MutationObserver((muts) => {
    _wireInputs();
    muts.forEach((m) => m.addedNodes.forEach(_scanCalcs));
  });
  obs.observe(document.body, { childList: true, subtree: true });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _init);
} else {
  _init();
}
