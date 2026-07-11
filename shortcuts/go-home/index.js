export default {
  name: "Go home",
  description: "Return to the Degoog home page.",
  defaultBinding: { key: "h", alt: true },
  run({ window }) {
    window.location.href = window.__DEGOOG_BASE_URL__ || "/";
  },
};
