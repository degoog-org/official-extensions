export const SETTINGS_SCHEMA = [
  {
    key: "outgoingTransport",
    label: "Outgoing HTTP client transport",
    type: "select",
    options: ["fetch", "curl", "curl-impersonate", "curl-fallback"],
    default: "curl-impersonate",
    advanced: true,
  },
  {
    key: "safeSearch",
    label: "Safe Search",
    type: "select",
    options: ["off", "moderate", "strict"],
    default: "moderate",
    description: "Filter explicit content from search results.",
  },
];
