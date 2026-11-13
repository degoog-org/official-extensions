import * as cheerio from "cheerio";
import {
  GO_CONCURRENCY,
  GO_PAGE_MAX_BYTES,
  GO_PATH_PREFIX,
  GO_TIMEOUT_MS,
  SEARCH_ORIGIN,
} from "./const/search.js";

const _parse = (url, base) => {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
};

export const isGoLink = (href) => {
  const parsed = _parse(href, SEARCH_ORIGIN);
  return !!parsed && parsed.origin === SEARCH_ORIGIN && parsed.pathname.startsWith(GO_PATH_PREFIX);
};

export const toGoUrl = (href) => _parse(href, SEARCH_ORIGIN)?.href ?? "";

export const isExternal = (url) => {
  const parsed = _parse(url);
  if (!parsed) return false;
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  return parsed.origin !== SEARCH_ORIGIN;
};

const _isBraveHost = (url) => {
  const host = _parse(url)?.hostname ?? "";
  return host === "brave.com" || host.endsWith(".brave.com");
};

const _refreshTarget = ($) => {
  const content = $("meta[http-equiv]")
    .filter((_, el) => ($(el).attr("http-equiv") || "").toLowerCase() === "refresh")
    .first()
    .attr("content") || "";
  const match = content.match(/url\s*=\s*['"]?([^'"\s;]+)/i);
  return match ? match[1] : "";
};

const _pageTarget = (html, goUrl) => {
  if (html.length > GO_PAGE_MAX_BYTES) return "";
  const $ = cheerio.load(html);
  const anchors = $("a[href]").map((_, el) => $(el).attr("href")).get();
  return [_refreshTarget($), ...anchors]
    .map((href) => _parse((href || "").trim(), goUrl)?.href ?? "")
    .find((url) => isExternal(url) && !_isBraveHost(url)) ?? "";
};

const _leftBrave = (landed) => !!landed && _parse(landed)?.origin !== SEARCH_ORIGIN;

const _signal = (context) => {
  const timeout = AbortSignal.timeout(GO_TIMEOUT_MS);
  return context?.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
};

const _follow = async (goUrl, headers, context) => {
  const doFetch = context?.fetch ?? fetch;
  try {
    const response = await doFetch(goUrl, {
      method: "GET",
      redirect: "manual",
      headers,
      signal: _signal(context),
    });
    const location = response.headers.get("location") || "";
    const target = location ? _parse(location, goUrl)?.href ?? "" : "";
    if (isExternal(target)) {
      await response.body?.cancel();
      return target;
    }
    if (_leftBrave(response.url)) {
      await response.body?.cancel();
      console.warn("[brave] transport followed a /go/ redirect itself, skipping the link");
      return "";
    }
    return _pageTarget(await response.text(), goUrl);
  } catch (err) {
    console.warn(`[brave] go link resolve failed: ${err?.message || err}`);
    return "";
  }
};

const _unique = (results) => {
  const seen = new Set();
  return results.filter((result) => {
    if (!result.url || isGoLink(result.url) || seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  });
};

export const resolveGoLinks = async (results, headers, context) => {
  const pending = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => isGoLink(result.url));
  if (pending.length === 0) return { results: _unique(results), cloaked: 0 };

  const progress = { expected: results.length };
  const direct = results.filter((result) => !isGoLink(result.url));
  if (direct.length > 0) context?.emit?.(direct, progress);
  const resolved = [...results];
  let next = 0;

  const worker = async () => {
    while (next < pending.length && !context?.signal?.aborted) {
      const { result, index } = pending[next++];
      const url = await _follow(result.url, headers, context);
      resolved[index] = { ...result, url };
      if (url) context?.emit?.([resolved[index]], progress);
    }
  };

  const workers = Math.min(GO_CONCURRENCY, pending.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return { results: _unique(resolved), cloaked: pending.length };
};
