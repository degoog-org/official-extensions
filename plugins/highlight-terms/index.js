const INFO_HTML =
  `<div class="command-result"><p>Query terms are automatically highlighted in result titles and snippets on every search page.</p></div>`;

export default {
  isClientExposed: false,
  name: "Highlight Terms",
  description: "Wraps query-matching words in <strong> on result titles and snippets.",
  trigger: "highlight",
  aliases: ["hl"],
  settingsSchema: [],

  execute() {
    return { title: "Highlight Terms", html: INFO_HTML };
  },
};
