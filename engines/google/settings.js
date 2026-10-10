export const SETTINGS_SCHEMA = [
  {
    key: "transportInfo",
    label: "Transport",
    type: "info",
    description:
      "Google only works through the [4play (lolcat)](https://github.com/degoog-org/official-extensions/tree/main/transports/lolcat-4play) or [FlareSolverr](https://github.com/degoog-org/official-extensions/tree/main/transports/flaresolverr) transport right now. Install one from the Store tab and select it as the transport above.",
  },
  {
    key: "outgoingTransport",
    label: "Outgoing HTTP client transport",
    type: "select",
    options: ["fetch", "curl", "curl-fallback"],
    default: "curl",
    advanced: true,
  },
  {
    key: "safeSearch",
    label: "Safe search",
    type: "select",
    options: ["off", "on"],
    description: "Hides explicit content from search results.",
  },
];
