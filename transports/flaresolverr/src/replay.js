import {
  BLOCKED_STATUSES,
  CHALLENGE_MARKERS,
  FOLLOW_REDIRECT,
  LOG_TAG,
  MANUAL_REDIRECT,
  REPLACED_HEADERS,
  SORRY_PATH,
} from "./const.js";

export const looksBlocked = (status, url, html) =>
  BLOCKED_STATUSES.includes(status) ||
  String(url || "").includes(SORRY_PATH) ||
  CHALLENGE_MARKERS.some((marker) => html.includes(marker));

export const isRedirect = (status) => status >= 300 && status < 400;

export const wantsLocation = (options) =>
  options?.redirect === MANUAL_REDIRECT && !options?.allowlistHop;

const _joinCookies = (...parts) => parts.filter(Boolean).join("; ");

const _pickHeader = (headers, name) => {
  const hit = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return hit ? hit[1] : "";
};

const _replayHeaders = (options, session) => {
  const headers = {};
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (!REPLACED_HEADERS.includes(key.toLowerCase())) headers[key] = value;
  }
  headers["User-Agent"] = session.userAgent;
  headers.Cookie = _joinCookies(session.cookie, _pickHeader(options.headers, "cookie"));
  return headers;
};

export const replayFetch = async (url, options, session, doFetch) => {
  const manual = wantsLocation(options);
  try {
    const res = await doFetch(url, {
      method: "GET",
      headers: _replayHeaders(options, session),
      redirect: manual ? MANUAL_REDIRECT : FOLLOW_REDIRECT,
      signal: options.signal,
    });
    if (manual && isRedirect(res.status)) return res;

    const html = await res.text();
    if (looksBlocked(res.status, res.url, html)) return null;
    return new Response(html, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") || "text/html" },
    });
  } catch (err) {
    if (options.signal?.aborted) throw err;
    console.warn(`${LOG_TAG} session replay failed: ${err?.message || err}`);
    return null;
  }
};
