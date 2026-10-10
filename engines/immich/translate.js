import { ID } from "./const/api.js";

export const translate = (t, key, fallback) => {
  const value = t?.(`${ID}.${key}`);
  return typeof value === "string" && value !== `${ID}.${key}` ? value : fallback;
};
