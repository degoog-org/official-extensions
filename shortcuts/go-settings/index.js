export default {
  name: "Go settings",
  description: "Open the settings page.",
  defaultBinding: { key: ",", alt: true },
  run({ window }) {
    const base = window.__DEGOOG_BASE_URL__ || "";
    window.location.href = `${base}/settings`;
  },
};
