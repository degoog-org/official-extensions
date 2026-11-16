import * as cheerio from "cheerio";
import {
  GOTO_HEADERS,
  GOTO_HOLD_MAX_BYTES,
  GOTO_HOLD_MAX_DELAY_MS,
  GOTO_HOLD_MAX_HOPS,
  GOTO_ORIGIN,
  GOTO_PAGE_MAX_BYTES,
  GOTO_PATH,
  GOTO_TIMEOUT_MS,
} from "./const/serp.js";
import { isExternal } from "./parse.js";

const _gotoUrl = (url) => {
  const token = new URL(url).searchParams.get("url");
  if (!token) return url;
  return `${GOTO_ORIGIN}${GOTO_PATH}?url=${encodeURIComponent(token)}`;
};

const _absolute = (href) => (href.startsWith("//") ? `https:${href}` : href);

const _anchorHref = (html) => {
  if (html.length > GOTO_PAGE_MAX_BYTES) return "";
  const href = cheerio.load(html)("a[href]").first().attr("href") || "";
  return _absolute(href.trim());
};

const _jsString = (raw) =>
  raw.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

const _onGoto = (href, base) => {
  try {
    const url = new URL(href, base);
    return url.origin === GOTO_ORIGIN && url.pathname === GOTO_PATH ? url.href : "";
  } catch {
    return "";
  }
};

const _holdDelay = (ms) =>
  Math.min(Number.isFinite(ms) && ms > 0 ? ms : 0, GOTO_HOLD_MAX_DELAY_MS);

const _holdHop = (html, current) => {
  if (html.length > GOTO_HOLD_MAX_BYTES) return null;
  const redirect = html.match(/var redirectUrl='([^']*)'/);
  if (redirect) {
    const delayMs = _holdDelay(parseInt(html.match(/var delayMillis=(\d+)/)?.[1] ?? "", 10));
    if (redirect[1]) {
      const url = _onGoto(_jsString(redirect[1]), current);
      return url ? { url, delayMs } : null;
    }
    const url = new URL(current);
    const eid = html.match(/var eid='([^']*)'/)?.[1];
    if (eid) url.searchParams.set("sei", eid);
    url.searchParams.set("sg_hc", "1");
    return { url: url.href, delayMs };
  }
  const refresh = cheerio.load(html)("meta[http-equiv]")
    .filter((_, el) => (el.attribs["http-equiv"] || "").toLowerCase() === "refresh")
    .first()
    .attr("content") || "";
  const match = refresh.match(/^\s*(\d+)\s*;\s*url=(.+)$/i);
  if (!match) return null;
  const url = _onGoto(match[2].trim().replace(/^['"]|['"]$/g, ""), current);
  return url ? { url, delayMs: _holdDelay(parseInt(match[1], 10) * 1000) } : null;
};

const _wait = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

const _leftGoogle = (landed) => {
  if (!landed) return false;
  try {
    return new URL(landed).origin !== GOTO_ORIGIN;
  } catch {
    return true;
  }
};

const _signal = (context) => {
  const timeout = AbortSignal.timeout(GOTO_TIMEOUT_MS);
  return context?.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
};

const _isGoto = (result) => result.url.startsWith(GOTO_ORIGIN);

const _followGoto = async (url, userAgent, context) => {
  const doFetch = context?.fetch ?? fetch;
  let target = _gotoUrl(url);
  try {
    for (let hop = 0; hop <= GOTO_HOLD_MAX_HOPS && !context?.signal?.aborted; hop++) {
      const response = await doFetch(target, {
        method: "GET",
        redirect: "manual",
        headers: { ...GOTO_HEADERS, "User-Agent": userAgent },
        signal: _signal(context),
      });
      const location = _absolute(response.headers.get("location") || "");
      if (isExternal(location)) {
        await response.body?.cancel();
        return location;
      }
      if (_leftGoogle(response.url)) {
        await response.body?.cancel();
        console.warn("[google] transport followed a goto redirect itself, skipping the link");
        return "";
      }
      const html = await response.text();
      const href = _anchorHref(html);
      if (isExternal(href)) return href;
      const next = _holdHop(html, target);
      if (!next) return "";
      await _wait(next.delayMs, context?.signal);
      target = next.url;
    }
    return "";
  } catch (err) {
    console.warn(`[google] goto resolve failed: ${err?.message || err}`);
    return "";
  }
};

export const resolveGotos = async (results, userAgent, context) => {
  const progress = { expected: results.length };
  const direct = results.filter((result) => !_isGoto(result));
  if (direct.length > 0 && direct.length < results.length) context?.emit?.(direct, progress);
  const resolved = await Promise.all(
    results.map(async (result) => {
      if (!_isGoto(result)) return result;
      const url = await _followGoto(result.url, userAgent, context);
      const next = { ...result, url };
      if (url) context?.emit?.([next], progress);
      return next;
    }),
  );
  const seen = new Set();
  return resolved.filter((result) => {
    if (!result.url || seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  });
};
