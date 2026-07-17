import { tabSpell } from "../browser/browser.js";
import {
  cookieJarFromCookieHeader,
  curlFetchWithBrowserHeaders,
  emptyCookieJar,
  engineHeaders,
  fillCookieGaps,
  resolveCurlBinary,
} from "../net/curl-session.js";
import { solveChallenge } from "../net/flaresolverr.js";
import { documentHtmlJs } from "../injectors/index.js";
import {
  OriginBlockedError,
  looksBlocked,
  looksConsent,
  sleep,
} from "../warmup/origin-warmup.js";
import { wrapResponse } from "../net/response.js";

const BLOCK_WORDS = [
  "captcha",
  "unusual traffic",
  "automated quer",
  "verify\\s+(?:that\\s+)?you\\s+are\\s+human",
  "confirm\\s+this\\s+search",
  "bots\\s+use",
  "not a robot",
  "access denied",
  "suspicious (?:activity|behaviour|behavior)",
  "our systems have detected",
  "enablejs",
  "before you continue",
];

export class PageFetcher {
  constructor({
    command,
    tabs,
    captcha,
    store,
    markBlocked,
    flaresolverrUrl,
    flaresolverrTimeoutMs,
    curlProxyUrl,
    timeoutMs,
    warn,
  }) {
    this._command = command;
    this._tabs = tabs;
    this._captcha = captcha;
    this._store = store;
    this._markBlocked = markBlocked;
    this._flaresolverrUrl = flaresolverrUrl;
    this._flaresolverrTimeoutMs = flaresolverrTimeoutMs;
    this._curlProxyUrl = curlProxyUrl;
    this._timeoutMs = timeoutMs;
    this._warn = warn;
  }

  _describe(text, status, origin) {
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(text)?.[1]?.trim() || "(no title)";
    const hit = BLOCK_WORDS.find((word) => new RegExp(word, "i").test(text));
    const sample = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);

    this._warn(
      `verdict detail for ${origin}: http=${status} bytes=${text.length} title="${title}" trigger=${hit || "none"} text="${sample}"`,
    );
  }

  _wrapFetchedText(text, origin, containerId, url = "", tabId = null) {
    if (origin && looksConsent(text, url)) {
      throw new OriginBlockedError(origin, "response consent", tabId, "consent");
    }
    if (origin && looksBlocked(text, url)) {
      this._markBlocked(origin, containerId, "response block/captcha", tabId);
      throw new OriginBlockedError(origin, "response block/captcha", tabId);
    }
    return wrapResponse(text);
  }

  async solveWithFlare(url, origin, containerId) {
    if (!this._flaresolverrUrl()) return null;

    try {
      const solution = await solveChallenge({
        endpoint: this._flaresolverrUrl(),
        url,
        timeoutMs: this._flaresolverrTimeoutMs(),
        proxyUrl: this._curlProxyUrl(),
      });

      if (
        !solution?.html ||
        looksConsent(solution.html, url) ||
        looksBlocked(solution.html, url)
      ) {
        this._warn(
          `FlareSolverr could not clear the challenge for ${origin}; falling back to manual tab`,
        );
        return null;
      }

      if (solution.cookieHeader) {
        const jar = cookieJarFromCookieHeader(origin, solution.cookieHeader);
        const session = this._store.headerSession(origin, containerId);
        if (session) session.cookieJarText = jar;
        this._store.persistCookieJar(
          origin,
          containerId,
          jar,
          session?.headers || null,
        );
      }
      this._store.setWarmupState(origin, containerId, { warmedAt: Date.now() });

      this._warn(`FlareSolverr cleared the challenge for ${origin}`);
      return wrapResponse(solution.html);
    } catch (error) {
      this._warn(
        `FlareSolverr request failed for ${origin}: ${error?.message || error}; falling back to manual tab`,
      );
      return null;
    }
  }

  async curlFetchWarmed(url, origin, containerId, options = {}) {
    const session = this._store.usableHeaderSession(origin, containerId);
    if (!session || !(await resolveCurlBinary())) return null;

    const jar =
      (await this._store.loadCookieJar(origin, containerId)) ||
      session.cookieJarText ||
      emptyCookieJar();
    const wanted = options.headers || {};
    const cookieJarText = fillCookieGaps(origin, jar, wanted.Cookie || wanted.cookie);

    try {
      const response = await curlFetchWithBrowserHeaders({
        url,
        headers: session.headers,
        extraHeaders: engineHeaders(wanted),
        method: options.method || "",
        body: options.body || "",
        timeoutSeconds: this._timeoutMs() / 1000,
        cookieJarText,
        onCookieJarText: (updated) => {
          session.cookieJarText = updated;
          this._store.persistCookieJar(origin, containerId, updated);
        },
        proxyUrl: this._curlProxyUrl(),
      });
      const text = await response.text();

      if (origin && (looksConsent(text, url) || looksBlocked(text, url))) {
        this._describe(text, response.status, origin);
        if (looksBlocked(text, url)) {
          const solved = await this.solveWithFlare(url, origin, containerId);
          if (solved) return solved;
        }
        this._warn(
          `warmed curl fetch for ${origin} needs a live browser session (${looksConsent(text, url) ? "consent" : "block"}); falling back`,
        );
        return null;
      }
      return wrapResponse(text);
    } catch (error) {
      this._warn(
        `warmed curl fetch failed for ${origin}: ${error?.message || error}; falling back to browser tab`,
      );
      return null;
    }
  }

  async browserFetch(url, origin, containerId, options = {}) {
    if (options.body) {
      throw new Error(
        `lolcat-4play: cannot replay a ${String(options.method || "POST").toUpperCase()} to ${url} through a browser tab; a tab can only navigate with GET`,
      );
    }
    this._warn(
      `direct browser tab fetch for ${url} (container=${containerId || "default"}): no warmed curl session for this origin, fetching DOM outerHTML via tab injection`,
    );
    let tabId = null;
    let keepTabOpen = false;

    try {
      const tabResp = await this._command("tab_open", tabSpell(url, containerId));
      tabId = tabResp?.data?.id;
      if (typeof tabId !== "number") {
        throw new Error("lolcat-4play: tab_open did not return a valid tab id");
      }

      this._tabs.ownedTabIds.add(tabId);
      if (containerId) this._tabs.tabContainerIds.set(tabId, containerId);

      await this._tabs.awaitMatch(tabId, {
        origin,
        urlMatch: options.match?.urlMatch,
        domMatch: options.match?.domMatch,
        failUrlMatch: options.match?.failUrlMatch,
        timeoutMs: this._timeoutMs(),
      });
      await sleep(1000);
      await this._tabs.acceptConsent(tabId);

      const html = await this._tabs.inject(tabId, documentHtmlJs());
      if (!html) {
        throw new Error(
          "lolcat-4play: failed to retrieve page HTML content from browser tab",
        );
      }

      try {
        return this._wrapFetchedText(html, origin, containerId, url, tabId);
      } catch (error) {
        if (!(error instanceof OriginBlockedError)) throw error;

        if (error.status === "consent") {
          if (await this._tabs.acceptConsent(tabId)) {
            const retryHtml = await this._tabs.inject(tabId, documentHtmlJs());
            if (retryHtml) {
              try {
                return this._wrapFetchedText(retryHtml, origin, containerId, url, tabId);
              } catch {
                // consent still not cleared; escalate to a manual tab below
              }
            }
          }
          this._markBlocked(origin, containerId, "consent (needs manual accept)", tabId);
        }

        const solved = await this.solveWithFlare(url, origin, containerId);
        if (solved) return solved;

        keepTabOpen = true;
        if (typeof tabId === "number") {
          this._captcha.register(tabId, origin);
          this._warn(
            `keeping browser fetch tab ${tabId} open for manual attention (${origin}, reason=${error.reason || error.message || "blocked"})`,
          );
        }
        throw error;
      }
    } finally {
      if (!keepTabOpen) {
        await this._tabs.closeTabQuietly(tabId);
        this._tabs.forgetTab(tabId);
      }
    }
  }
}
