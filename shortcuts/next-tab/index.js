export default {
  name: "Next tab",
  description: "Switch to the next visible results tab.",
  defaultBinding: { key: "ArrowRight", alt: true },
  run({ document }) {
    const tabs = Array.from(document.querySelectorAll(".results-tab")).filter(
      (tab) => tab.style.display !== "none",
    );
    if (!tabs.length) return;
    const active = tabs.findIndex((tab) => tab.classList.contains("active"));
    tabs[((active < 0 ? 0 : active) + 1) % tabs.length]?.click();
  },
};
