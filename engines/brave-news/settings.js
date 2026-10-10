export const SETTINGS_SCHEMA = [
  {
    key: "safeSearch",
    label: "Safe Search",
    type: "select",
    options: ["off", "moderate", "strict"],
    default: "moderate",
    description: "Filter explicit content from search results.",
  },
];
