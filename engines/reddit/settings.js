export const SETTINGS_SCHEMA = [
  {
    key: "includeNsfw",
    label: "Include NSFW",
    type: "toggle",
    description: "Show NSFW posts in search results.",
  },
  {
    key: "sortBy",
    label: "Sort By",
    type: "select",
    options: ["hot", "relevance", "new", "top"],
    description: "How to sort Reddit search results.",
    default: "hot",
  },
];
