export const SETTINGS_SCHEMA = [
  {
    key: "safeSearch",
    label: "Safe Search",
    type: "select",
    options: ["off", "moderate", "on"],
    default: "moderate",
    description: "Filter explicit content from image results.",
  },
  {
    key: "hideAiImages",
    label: "AI Images",
    type: "select",
    options: ["show", "hide"],
    description: "Hide AI-generated images from results using DuckDuckGo's built-in filter.",
  },
];
