import {
  SOFT_CAPTCHA_EID_RE,
  SOFT_CAPTCHA_TITLE,
  SOFT_CAPTCHA_WAIT_MS,
} from "./const/serp.js";

export const sniffEid = (html) => {
  if (!html.includes(SOFT_CAPTCHA_TITLE)) return "";
  return html.match(SOFT_CAPTCHA_EID_RE)?.[1] || "";
};

export const withSei = (url, eid) => {
  const next = new URL(url);
  next.searchParams.set("sei", eid);
  return next.toString();
};

export const napTime = () =>
  new Promise((resolve) => setTimeout(resolve, SOFT_CAPTCHA_WAIT_MS));
