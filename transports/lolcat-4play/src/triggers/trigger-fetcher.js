import { documentHtmlJs } from "../injectors/index.js";
import { wrapFetchedText } from "../net/response.js";
import { OriginBlockedError, looksConsent } from "../warmup/origin-warmup.js";
import { runSearch } from "./search-command.js";

export class TriggerFetcher {
  constructor({ command, tabs, captcha, markBlocked, solveWithFlare, timeoutMs, warn }) {
    this._command = command;
    this._tabs = tabs;
    this._captcha = captcha;
    this._markBlocked = markBlocked;
    this._solveWithFlare = solveWithFlare;
    this._timeoutMs = timeoutMs;
    this._warn = warn;
  }

  async fetch(url, origin, containerId, { trigger, query }) {
    this._warn(
      `trigger fetch: Firefox search "${trigger} ${query}" for ${origin} (container=${containerId || "default"}); returning the rendered results DOM`,
    );

    let tabId = null;
    let keepTabOpen = false;

    try {
      tabId = await this._tabs.openBlank(containerId);
      await runSearch(this._command, trigger, query, tabId);

      const html = await this._renderedHtml(tabId, url);

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
          `keeping trigger tab ${tabId} open for manual attention (${origin}, reason=${error.reason || error.message || "blocked"})`,
        );
        throw error;
      }
    } finally {
      if (!keepTabOpen) {
        await this._tabs.closeTabQuietly(tabId);
        this._tabs.forgetTab(tabId);
      }
    }
  }

  async _renderedHtml(tabId, url) {
    await this._tabs.awaitReady(tabId, this._timeoutMs()).catch(() => null);

    await this._dismissConsent(tabId);

    let html = await this._tabs.inject(tabId, documentHtmlJs());

    if (html && looksConsent(html, url) && (await this._tabs.acceptConsent(tabId))) {
      await this._tabs.awaitReady(tabId, this._timeoutMs()).catch(() => null);
      const after = await this._tabs.inject(tabId, documentHtmlJs());
      if (after) html = after;
    }

    if (!html) {
      throw new Error(
        "lolcat-4play: failed to read the rendered page HTML from the browser tab",
      );
    }
    return html;
  }

  async _dismissConsent(tabId) {
    const consent = await this._tabs.tryConsent(tabId);
    if (!consent?.consent || !consent?.progressed) return;
    this._warn(`accepted consent overlay on trigger tab ${tabId} (${consent.label || consent.via || "unknown"})`);
    await this._tabs.awaitReady(tabId, this._timeoutMs()).catch(() => null);
  }
}
