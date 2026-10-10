export const SETTINGS_SCHEMA = [
  {
    key: "apiKey",
    label: "API Key",
    type: "password",
    secret: true,
    required: true,
    placeholder: "Enter your API key",
    description: "Get an API key at brave.com/search/api",
  },
  {
    key: "safeSearch",
    label: "Safe Search",
    type: "select",
    options: ["off", "moderate", "strict"],
    default: "moderate",
    description: "Filter explicit content from results.",
  },
];
