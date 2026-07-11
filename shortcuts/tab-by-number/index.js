export default {
  name: "Switch tab by number",
  description: "Hold the recorded modifier and press 1-9 to jump to that result tab.",
  kind: "numeric",
  defaultBinding: { alt: true },
  run({ document, event }) {
    const n = Number(event?.key);
    if (!Number.isInteger(n) || n < 1 || n > 9) return;
    const tabs = Array.from(document.querySelectorAll(".results-tab")).filter(
      (tab) => tab.style.display !== "none",
    );
    tabs[n - 1]?.click();
  },
};
