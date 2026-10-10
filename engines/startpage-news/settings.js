export const SETTINGS_SCHEMA = [
  {
    key: "useAnonymousView",
    label: "Use Anonymous View",
    type: "toggle",
    description: "Open result links via Startpage's proxy so the destination site does not see your IP.",
  },
  {
    key: "safeSearch",
    label: "Safe Search",
    type: "select",
    options: ["off", "on"],
    description: "Filter explicit content from news results.",
  },
];
