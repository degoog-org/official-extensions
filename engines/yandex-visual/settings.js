import { DOMAINS, ID, Include, INCLUDE_LABELS } from "./const/visual.js";

const _tr = (t, key, fallback) => {
  const value = t?.(`${ID}.${key}`);
  return typeof value === "string" && value !== `${ID}.${key}`
    ? value
    : fallback;
};

export const buildSettingsSchema = (t) => [
  {
    key: "privacy",
    label: "Where the image goes",
    type: "info",
    description:
      "This engine uploads every image searched with it to Yandex, a third party, together with any words typed next to it. Yandex sees this server's IP address, not the visitor's, and keeps the image under its own terms.",
  },
  {
    key: "domain",
    label: "Yandex domain",
    type: "select",
    options: DOMAINS,
    default: DOMAINS[0],
  },
  {
    key: "include",
    label: "Results",
    type: "select",
    options: Object.values(Include),
    optionLabels: Object.values(Include).map((id) =>
      _tr(t, `options.include.${id}`, INCLUDE_LABELS[id]),
    ),
    default: Include.Both,
    description:
      "Pages that contain the image, images that look like it, or both. Pages come first.",
  },
];
