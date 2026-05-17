const SELECTORS = [".result-title", ".result-snippet"];
const HL_DONE_ATTR = "data-hl-done";
const SEARCH_PATH = "/search";

const getWords = () => {
  const q = new URLSearchParams(window.location.search).get("q") ?? "";
  return q.trim().split(/\s+/).filter((w) => w.length > 1);
};

const buildPattern = (words) => {
  if (!words.length) return null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
};

const lumos = (el, pattern) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);

  for (const textNode of nodes) {
    const text = textNode.nodeValue ?? "";
    pattern.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let matched = false;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      matched = true;
      if (m.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      const strong = document.createElement("strong");
      strong.textContent = m[0];
      frag.appendChild(strong);
      last = m.index + m[0].length;
    }
    if (!matched) continue;
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }
    try {
      textNode.parentNode?.replaceChild(frag, textNode);
    } catch (err) {
      console.warn("[highlight-terms] replaceChild failed", err);
    }
  }
};

const highlightAll = (pattern) => {
  const selector = SELECTORS.join(", ");
  document.querySelectorAll(selector).forEach((el) => {
    if (el.hasAttribute(HL_DONE_ATTR)) return;
    el.setAttribute(HL_DONE_ATTR, "1");
    lumos(el, pattern);
  });
};

const init = () => {
  if (!window.location.pathname.startsWith(SEARCH_PATH)) return;
  const words = getWords();
  const pattern = buildPattern(words);
  if (!pattern) return;

  highlightAll(pattern);

  const resultsList = document.getElementById("results-list");
  if (!resultsList) return;

  const observer = new MutationObserver(() => highlightAll(pattern));
  observer.observe(resultsList, { childList: true, subtree: true });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
