export const SETTINGS_SCHEMA = [
  {
    key: "resultsFormat",
    label: "Results format",
    type: "select",
    options: ["json", "html"],
    optionLabels: ["JSON results", "HTML results"],
    default: "json",
    description: "Which Google Images response the results come from.",
  },
  {
    key: "jsonFormatInfo",
    label: "JSON results",
    type: "info",
    description:
      "For JSON results, install [4play (lolcat)](https://github.com/degoog-org/official-extensions/tree/main/transports/lolcat-4play) from the Store tab.",
    visibleWhen: { key: "resultsFormat", equals: "json" },
  },
  {
    key: "htmlFormatInfo",
    label: "HTML results",
    type: "info",
    description:
      "For HTML results, install [4play (lolcat)](https://github.com/degoog-org/official-extensions/tree/main/transports/lolcat-4play) from the Store tab.",
    visibleWhen: { key: "resultsFormat", equals: "html" },
  },
  {
    key: "safeSearch",
    label: "Safe search",
    type: "select",
    options: ["off", "moderate", "on"],
    default: "moderate",
    description: "Hides explicit content from image results.",
  },
];
