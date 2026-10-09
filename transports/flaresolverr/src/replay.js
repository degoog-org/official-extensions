import * as cheerio from "cheerio";
import { cookieHeaderFor } from "./session-jar.js";
import {
  BLOCKED_STATUSES,
  CHALLENGE_MARKERS,
  FOLLOW_REDIRECT,
  LOG_TAG,
  MANUAL_REDIRECT,
  PROXY_CONNECT_ERROR,
  REPLACED_HEADERS,
} from "./const.js";

const _missesDom = (html, selector) => {
  try {
    return cheerio.load(html)(selector).length === 0;
  } catch {
    return false;
  }
};

export const looksBlocked = (status, url, html, match = {}) =>
  BLOCKED_STATUSES.includes(status) ||
  Boolean(match.failUrlMatch && String(url || "").includes(match.failUrlMatch)) ||
  CHALLENGE_MARKERS.some((marker) => html.includes(marker)) ||
  Boolean(match.domMatch && _missesDom(html, match.domMatch));

export const isRedirect = (status) => status >= 300 && status < 400;

export const wantsLocation = (options) =>
  options?.redirect === MANUAL_REDIRECT && !options?.allowlistHop;

const _joinCookies = (...parts) => parts.filter(Boolean).join("; ");

const _replayHeaders = (url, options, session) => {
  const headers = new Headers(options.headers ?? {});
  const callerCookie = headers.get("cookie") || "";
  for (const name of REPLACED_HEADERS) headers.delete(name);
  if (session.userAgent) headers.set("User-Agent", session.userAgent);
  const cookie = _joinCookies(cookieHeaderFor(session, url), callerCookie);
  if (cookie) headers.set("Cookie", cookie);
  return headers;
};

export const replayFetch = async (url, options, session, doFetch) => {
  const manual = wantsLocation(options);
  try {
    const res = await doFetch(url, {
      method: "GET",
      headers: _replayHeaders(url, options, session),
      redirect: manual ? MANUAL_REDIRECT : FOLLOW_REDIRECT,
      signal: options.signal,
    });
    if (manual && isRedirect(res.status)) return res;

    const html = await res.clone().text();
    if (looksBlocked(res.status, res.url, html, options.match)) {
      await res.body?.cancel();
      return null;
    }
    return res;
  } catch (err) {
    if (options.signal?.aborted || err?.name === PROXY_CONNECT_ERROR) throw err;
    console.warn(`${LOG_TAG} session replay failed: ${err?.message || err}`);
    return null;
  }
};
