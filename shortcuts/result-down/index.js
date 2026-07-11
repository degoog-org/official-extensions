export default {
  name: "Highlight next result",
  description: "Move focus to the next result link.",
  defaultBinding: { key: "ArrowDown", alt: true, meta: true },
  run({ document }) {
    const anchors = Array.from(document.querySelectorAll("#results-list a.result-title"));
    if (!anchors.length) return;
    const current = anchors.indexOf(document.activeElement);
    const next = Math.min(anchors.length - 1, current < 0 ? 0 : current + 1);
    anchors[next]?.focus();
    anchors[next]?.scrollIntoView({ block: "center", behavior: "smooth" });
  },
};
