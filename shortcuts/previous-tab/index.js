export default {
  name: "Previous tab",
  description: "Switch to the previous visible results tab.",
  defaultBinding: { key: "ArrowLeft", alt: true },
  run({ document }) {
    const tabs = Array.from(document.querySelectorAll(".results-tab")).filter(
      (tab) => tab.style.display !== "none",
    );
    if (!tabs.length) return;
    const active = tabs.findIndex((tab) => tab.classList.contains("active"));
    tabs[((active < 0 ? 0 : active) - 1 + tabs.length) % tabs.length]?.click();
  },
};
