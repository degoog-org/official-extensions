export const SETTINGS_SCHEMA = [
  {
    key: "outgoingTransport",
    label: "Outgoing HTTP client transport",
    type: "select",
    options: ["fetch", "curl", "curl-fallback"],
    default: "curl",
    advanced: true,
  },
  {
    key: "resultsFormat",
    label: "Results format",
    type: "select",
    options: ["lite", "html"],
    optionLabels: ["Lite results", "HTML results"],
    default: "lite",
    description: "Which Google page the results come from.",
  },
  {
    key: "liteFormatInfo",
    label: "Lite results",
    type: "info",
    description:
      "Lite results come from a lightweight mobile page and work over any transport.",
    visibleWhen: { key: "resultsFormat", equals: "lite" },
  },
  {
    key: "htmlFormatInfo",
    label: "HTML results",
    type: "info",
    description:
      "HTML results fetch the full desktop page for better titles, snippets and thumbnails. They need a real browser session, so install [4play (lolcat)](https://github.com/degoog-org/official-extensions/tree/main/transports/lolcat-4play) from the Store tab and select it as this engine's transport.",
    visibleWhen: { key: "resultsFormat", equals: "html" },
  },
  {
    key: "safeSearch",
    label: "Safe search",
    type: "select",
    options: ["off", "on"],
    description: "Hides explicit content from video results.",
  },
];
