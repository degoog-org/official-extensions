import { SIZES, THUMB_LABELS } from "./const/api.js";
import { translate } from "./translate.js";

export const buildSettingsSchema = (t) => [
  {
    key: "url",
    label: "Immich URL",
    type: "url",
    required: true,
    placeholder: "http://192.168.1.10:2283",
    description: "The address this server uses to reach Immich.",
  },
  {
    key: "apiKey",
    label: "API key",
    type: "password",
    secret: true,
    required: true,
    placeholder: "Immich API key",
    description:
      "Create one in Immich under Account Settings > API Keys, with the asset.read and asset.view permissions.",
  },
  {
    key: "publicUrl",
    label: "Public Immich URL",
    type: "url",
    placeholder: "https://photos.example.com",
    description:
      "Optional. Links that open a photo in Immich use this address. Leave it blank to use the Immich URL above.",
  },
  {
    key: "pageSize",
    label: "Results per page",
    type: "number",
    default: "30",
  },
  {
    key: "thumbSize",
    label: "Thumbnail size",
    type: "select",
    default: "thumbnail",
    options: SIZES,
    optionLabels: SIZES.map((s) => translate(t, `options.thumbSize.${s}`, THUMB_LABELS[s])),
  },
];
