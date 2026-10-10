import * as cheerio from "cheerio";
import {
  GOTO_HEADERS,
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

const _followGoto = async (url, userAgent, doFetch) => {
  try {
    const response = await doFetch(_gotoUrl(url), {
      method: "GET",
      redirect: "manual",
      headers: { ...GOTO_HEADERS, "User-Agent": userAgent },
      signal: AbortSignal.timeout(GOTO_TIMEOUT_MS),
    });
    const location = _absolute(response.headers.get("location") || "");
    if (isExternal(location)) {
      await response.body?.cancel();
      return location;
    }
    const href = _anchorHref(await response.text());
    return isExternal(href) ? href : "";
  } catch (err) {
    console.warn(`[google] goto resolve failed: ${err?.message || err}`);
    return "";
  }
};

export const resolveGotos = async (results, userAgent, doFetch = fetch) => {
  const resolved = await Promise.all(
    results.map(async (result) =>
      result.url.startsWith(GOTO_ORIGIN)
        ? { ...result, url: await _followGoto(result.url, userAgent, doFetch) }
        : result,
    ),
  );
  const seen = new Set();
  return resolved.filter((result) => {
    if (!result.url || seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  });
};
