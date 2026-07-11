export default {
  name: "Highlight previous result",
  description: "Move focus to the previous result link.",
  defaultBinding: { key: "ArrowUp", alt: true, meta: true },
  run({ document }) {
    const anchors = Array.from(document.querySelectorAll("#results-list a.result-title"));
    if (!anchors.length) return;
    const current = anchors.indexOf(document.activeElement);
    const next = Math.max(0, current < 0 ? anchors.length - 1 : current - 1);
    anchors[next]?.focus();
    anchors[next]?.scrollIntoView({ block: "center", behavior: "smooth" });
  },
};
