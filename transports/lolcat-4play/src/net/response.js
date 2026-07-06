import {
  OriginBlockedError,
  looksBlocked,
  looksConsent,
} from "../warmup/origin-warmup.js";

export const wrapFetchedText = ({
  text,
  origin,
  containerId,
  url = "",
  tabId = null,
  markBlocked,
}) => {
  if (origin && looksConsent(text, url)) {
    throw new OriginBlockedError(origin, "response consent", tabId, "consent");
  }
  if (origin && looksBlocked(text, url)) {
    markBlocked?.(origin, containerId, "response block/captcha", tabId);
    throw new OriginBlockedError(origin, "response block/captcha", tabId);
  }
  return wrapResponse(text);
};

export const wrapResponse = (text) => {
  const trimmed = String(text ?? "").trimStart();
  const isJson =
    trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith(")]}'");

  return new Response(String(text ?? ""), {
    status: 200,
    headers: {
      "Content-Type": isJson
        ? "application/json; charset=utf-8"
        : "text/html; charset=utf-8",
    },
  });
};
