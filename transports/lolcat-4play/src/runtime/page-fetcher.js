import { tabSpell } from "../browser/browser.js";
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
import { wrapResponse } from "../net/response.js";

const CAPTURE_GRACE_MS = 3000;

export class PageFetcher {
  constructor({
    command,
    tabs,
    captcha,
    capture,
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
    this._capture = capture;
    this._store = store;
    this._markBlocked = markBlocked;
    this._flaresolverrUrl = flaresolverrUrl;
    this._flaresolverrTimeoutMs = flaresolverrTimeoutMs;
    this._curlProxyUrl = curlProxyUrl;
    this._timeoutMs = timeoutMs;
    this._warn = warn;
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
      const tabResp = await this._command("tab_open", tabSpell(url, containerId));
      tabId = tabResp?.data?.id;
      if (typeof tabId !== "number") {
        throw new Error("lolcat-4play: tab_open did not return a valid tab id");
      }

      this._tabs.ownedTabIds.add(tabId);
      if (containerId) this._tabs.tabContainerIds.set(tabId, containerId);

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

  async rawBrowserFetch(url, origin, containerId) {
    this._warn(
      `raw browser tab fetch for ${url} (container=${containerId || "default"}): reading the base64 web_response body through 4play instead of replaying with curl`,
    );
    return this._captureFetch(url, origin, containerId, "raw html", () =>
      this._openTab(url, containerId),
    );
  }

  async triggerFetch(url, origin, containerId, { trigger, query }) {
    this._warn(
      `trigger fetch: driving Firefox search "${trigger} ${query}" for ${origin} (container=${containerId || "default"})`,
    );
    return this._captureFetch(url, origin, containerId, `trigger ${trigger}`, () =>
      this._openSearch(trigger, query, containerId),
    );
  }

  _takeTabId(tabResp, containerId) {
    const tabId = tabResp?.data?.id;
    if (typeof tabId !== "number") {
      throw new Error("lolcat-4play: tab_open did not return a valid tab id");
    }
    this._tabs.ownedTabIds.add(tabId);
    if (containerId) this._tabs.tabContainerIds.set(tabId, containerId);
    return tabId;
  }

  async _openTab(url, containerId) {
    const tabResp = await this._command("tab_open", tabSpell(url, containerId));
    return this._takeTabId(tabResp, containerId);
  }

  async _openSearch(trigger, query, containerId) {
    const tabResp = await this._command("tab_open", tabSpell("about:blank", containerId));
    const tabId = this._takeTabId(tabResp, containerId);
    const res = await this._command("search_query", {
      alias: trigger,
      engine: trigger,
      text: query,
      tabid: tabId,
    });
    if (res?.status !== true) {
      throw new Error(
        `lolcat-4play: search trigger "${trigger}" failed: ${res?.error || "unknown error"}`,
      );
    }
    return tabId;
  }

  async _captureFetch(realUrl, origin, containerId, label, open) {
    let tabId = null;
    let keepTabOpen = false;
    await this._capture.begin();

    try {
      tabId = await open();
      const html = await this._grabCaptured(tabId, origin, realUrl);

      try {
        return this._wrapFetchedText(html, origin, containerId, realUrl, tabId);
      } catch (error) {
        if (!(error instanceof OriginBlockedError)) throw error;

        const solved = await this.solveWithFlare(realUrl, origin, containerId);
        if (solved) return solved;

        keepTabOpen = true;
        this._captcha.register(tabId, origin);
        this._warn(
          `keeping ${label} tab ${tabId} open for manual attention (${origin}, reason=${error.reason || error.message || "blocked"})`,
        );
        throw error;
      }
    } finally {
      await this._capture.end();
      if (!keepTabOpen) {
        this._capture.forget(tabId);
        await this._tabs.closeTabQuietly(tabId);
        this._tabs.forgetTab(tabId);
      }
    }
  }

  async _grabCaptured(tabId, origin, realUrl) {
    await this._tabs.awaitReady(tabId, this._timeoutMs()).catch(() => null);

    let html = await this._readBody(tabId);

    if (html && looksConsent(html, realUrl) && (await this._tabs.acceptConsent(tabId))) {
      await this._tabs.awaitReady(tabId, this._timeoutMs()).catch(() => null);
      const after = await this._readBody(tabId);
      if (after) html = after;
    }

    if (!html) {
      throw new Error(
        "lolcat-4play: failed to capture page HTML from browser tab",
      );
    }
    return html;
  }

  async _readBody(tabId) {
    const grace = Math.min(CAPTURE_GRACE_MS, this._timeoutMs());
    const captured = await this._capture.wait(tabId, grace);
    if (captured?.html) return captured.html;
    this._capture.forget(tabId);
    return this._tabs.inject(tabId, documentHtmlJs());
  }
}
