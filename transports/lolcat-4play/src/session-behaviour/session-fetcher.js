import { documentHtmlJs } from "../injectors/index.js";
import {
  cookieJarFromCookieHeader,
  curlFetchWithBrowserHeaders,
  emptyCookieJar,
  resolveCurlBinary,
} from "../net/curl-session.js";
import { solveChallenge } from "../net/flaresolverr.js";
import {
  OriginBlockedError,
  looksBlocked,
  looksConsent,
  sleep,
} from "../warmup/origin-warmup.js";
import { wrapFetchedText, wrapResponse } from "../net/response.js";

export class SessionFetcher {
  constructor({
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

  _wrap(text, origin, containerId, url = "", tabId = null) {
    return wrapFetchedText({
      text,
      origin,
      containerId,
      url,
      tabId,
      markBlocked: this._markBlocked,
    });
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

  async curlFetchWarmed(url, origin, containerId) {
    const session = this._store.usableHeaderSession(origin, containerId);
    if (!session || !(await resolveCurlBinary())) return null;

    const cookieJarText =
      (await this._store.loadCookieJar(origin, containerId)) ||
      session.cookieJarText ||
      emptyCookieJar();

    try {
      const response = await curlFetchWithBrowserHeaders({
        url,
        headers: session.headers,
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

  async browserFetch(url, origin, containerId) {
    this._warn(
      `direct browser tab fetch for ${url} (container=${containerId || "default"}): no warmed curl session for this origin, fetching DOM outerHTML via tab injection`,
    );
    let tabId = null;
    let keepTabOpen = false;

    try {
      tabId = await this._tabs.openTab(url, containerId);

      await this._tabs.awaitReady(tabId, this._timeoutMs());
      await sleep(1000);
      await this._tabs.acceptConsent(tabId);

      const html = await this._tabs.inject(tabId, documentHtmlJs());
      if (!html) {
        throw new Error(
          "lolcat-4play: failed to retrieve page HTML content from browser tab",
        );
      }

      try {
        return this._wrap(html, origin, containerId, url, tabId);
      } catch (error) {
        if (!(error instanceof OriginBlockedError)) throw error;

        if (error.status === "consent") {
          if (await this._tabs.acceptConsent(tabId)) {
            const retryHtml = await this._tabs.inject(tabId, documentHtmlJs());
            if (retryHtml) {
              try {
                return this._wrap(retryHtml, origin, containerId, url, tabId);
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
