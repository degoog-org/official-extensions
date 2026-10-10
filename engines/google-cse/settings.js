import { PUBLIC_CX } from "./const/cse.js";

export const SETTINGS_SCHEMA = [
  {
    key: "outgoingTransport",
    label: "Outgoing HTTP client transport",
    type: "select",
    options: ["fetch", "curl", "curl-fallback"],
    default: "fetch",
    advanced: true,
  },
  {
    key: "cx",
    label: "Custom Search Engine ID (cx)",
    type: "text",
    default: PUBLIC_CX,
    placeholder: PUBLIC_CX,
    description:
      "The `cx` of the Google Programmable Search Engine to query. Create your own at [programmablesearchengine.google.com](https://programmablesearchengine.google.com/) and set it to search the entire web. The default is a shared public engine, so results are whatever that engine is configured to return.",
  },
  {
    key: "category",
    label: "Result category",
    type: "select",
    options: ["web", "image"],
    optionLabels: ["Web results", "Image results"],
    default: "web",
    description:
      "Image results only work if the configured search engine has image search enabled. Changing this moves the engine between the Web and Images tabs.",
  },
  {
    key: "safeSearch",
    label: "Safe Search",
    type: "select",
    options: ["off", "moderate", "strict"],
    default: "off",
    description: "Filter explicit content from search results.",
  },
];
