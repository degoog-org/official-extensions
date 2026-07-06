import { wrapFetchedText } from "../net/response.js";
import { OriginBlockedError, looksConsent } from "../warmup/origin-warmup.js";

const CAPTURE_GRACE_MS = 3000;

export class HtmlFetcher {
  constructor({ tabs, capture, captcha, markBlocked, solveWithFlare, timeoutMs, warn }) {
    this._tabs = tabs;
    this._capture = capture;
    this._captcha = captcha;
    this._markBlocked = markBlocked;
    this._solveWithFlare = solveWithFlare;
    this._timeoutMs = timeoutMs;
    this._warn = warn;
  }

  async rawBrowserFetch(url, origin, containerId) {
    this._warn(
      `raw browser tab fetch for ${url} (container=${containerId || "default"}): reading the base64 web_response body through 4play instead of replaying with curl`,
    );

    let tabId = null;
    let keepTabOpen = false;
    await this._capture.begin();

    try {
      tabId = await this._tabs.openTab(url, containerId);
      const html = await this._readNetworkBody(tabId, url);

      try {
        return wrapFetchedText({
          text: html,
          origin,
          containerId,
          url,
          tabId,
          markBlocked: this._markBlocked,
        });
      } catch (error) {
        if (!(error instanceof OriginBlockedError)) throw error;

        const solved = await this._solveWithFlare(url, origin, containerId);
        if (solved) return solved;

        keepTabOpen = true;
        this._captcha.register(tabId, origin);
        this._warn(
          `keeping raw html tab ${tabId} open for manual attention (${origin}, reason=${error.reason || error.message || "blocked"})`,
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

  async _readNetworkBody(tabId, url) {
    await this._tabs.awaitReady(tabId, this._timeoutMs()).catch(() => null);

    const grace = Math.min(CAPTURE_GRACE_MS, this._timeoutMs());
    let captured = await this._capture.wait(tabId, grace);
    let html = captured?.html || "";

    if (html && looksConsent(html, url) && (await this._tabs.acceptConsent(tabId))) {
      await this._tabs.awaitReady(tabId, this._timeoutMs()).catch(() => null);
      const after = await this._capture.wait(tabId, grace);
      if (after?.html) html = after.html;
    }

    if (!html) {
      throw new Error(
        "lolcat-4play: failed to capture the raw network response body from the browser tab",
      );
    }
    return html;
  }
}
