export const SETTINGS_SCHEMA = [
  {
    key: "apiKey",
    label: "API Key",
    type: "password",
    secret: true,
    required: true,
    placeholder: "Enter your Guardian Open Platform API key",
    description:
      "Get a free API key at open-platform.theguardian.com/access/. Required to use this engine.",
  },
];
