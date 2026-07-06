import { curlReplayFetch, seedCookieJarFromHeaders } from "../net/curl-impersonate.js";
import { solveChallenge } from "../net/flaresolverr.js";
import { originFor } from "../util/url.js";

const BLOCKED = [/captcha/i, /unusual traffic/i, /verify\s+(?:that\s+)?you\s+are\s+human/i, /\/httpservice\/retry\/enablejs/i, /access denied/i];
const looksBlocked = (text) => BLOCKED.some((re) => re.test(text || ""));

export class FetchPipeline {
  constructor({ registry, containers, tabs, seenOrigins, proxySettings, rawHtmlFromTab, flaresolverrUrl, flaresolverrTimeoutMs, warn }) {
    this._registry = registry;
    this._containers = containers;
    this._tabs = tabs;
    this._seenOrigins = seenOrigins;
    this._proxySettings = proxySettings;
    this._rawHtmlFromTab = rawHtmlFromTab;
    this._flaresolverrUrl = flaresolverrUrl;
    this._flaresolverrTimeoutMs = flaresolverrTimeoutMs;
    this._warn = warn;
  }

  _proxyUrl() {
    const settings = this._proxySettings?.() || {};
    if (!settings.proxyType || settings.proxyType === "none" || !settings.proxyHost) return "";
    const scheme =
      settings.proxyType === "socks5" ? (settings.proxyDns ? "socks5h" : "socks5") :
      settings.proxyType === "socks4" ? (settings.proxyDns ? "socks4a" : "socks4") :
      settings.proxyType;
    const auth = settings.proxyUsername
      ? `${encodeURIComponent(settings.proxyUsername)}${settings.proxyPassword ? `:${encodeURIComponent(settings.proxyPassword)}` : ""}@`
      : "";
    return `${scheme}://${auth}${settings.proxyHost}:${settings.proxyPort || 1080}`;
  }

  async _solveWithFlare(url, origin, containerId) {
    if (!this._flaresolverrUrl?.()) return null;
    try {
      const solution = await solveChallenge({
        endpoint: this._flaresolverrUrl(),
        url,
        timeoutMs: this._flaresolverrTimeoutMs?.() || 60000,
        proxyUrl: this._proxyUrl(),
      });
      if (!solution?.html || looksBlocked(solution.html)) return null;
      const cookieJarText = solution.cookieHeader ? seedCookieJarFromHeaders(origin, [`Cookie: ${solution.cookieHeader}`]) : "";
      this._registry.markWarmed(origin, containerId, {
        via: "flaresolverr",
        headers: solution.userAgent ? [`User-Agent: ${solution.userAgent}`] : [],
        cookieJarText,
      });
      return new Response(solution.html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    } catch (error) {
      this._warn(`FlareSolverr failed for ${origin}: ${error?.message || error}`);
      return null;
    }
  }

  async fetch(url, options = {}, context = {}) {
    const origin = originFor(url);
    if (!origin) return fetch(url, options);
    this._seenOrigins.add(origin);

    let containerId = null;
    let session = null;
    try {
      containerId = await this._containers.borrow();
      session = this._registry.usable(origin, containerId) || this._registry.usable(origin, null);
      if (!session) {
        this._registry.markWarming(origin, containerId);
        const warmup = await this._tabs.warmLikeHuman(origin, containerId);
        session = this._registry.usable(origin, containerId);
        if (!warmup?.reachedSearch || !session) {
          const hadSession = Boolean(session);
          this._registry.clearOrigin(origin);
          session = null;
          this._warn(
            `origin warmup for ${origin} did not reach a usable search session (reachedSearch=${Boolean(warmup?.reachedSearch)}, session=${hadSession})`,
          );
        }
      }

      if (session && this._rawHtmlFromTab?.()) {
        const browser = await this._tabs.rawHtmlFetch(url, origin, containerId);
        if (looksBlocked(browser.html)) {
          const solved = await this._solveWithFlare(url, origin, containerId);
          if (solved) {
            await this._tabs.close(browser.tabId).catch(() => {});
            await this._containers.release(containerId, { keep: true });
            return solved;
          }
          this._registry.markCaptcha(origin, containerId, "raw browser response returned block/captcha", { tabId: browser.tabId });
          this._containers.holdForManualAttention(containerId);
          return new Response(browser.html, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        this._registry.markWarmed(origin, containerId, { via: "browser-raw-html" });
        await this._tabs.close(browser.tabId).catch(() => {});
        await this._containers.release(containerId, { keep: true });
        return new Response(browser.html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }

      if (!session) {
        await this._containers.release(containerId, { keep: false, degraded: true }).catch(() => {});
        throw new Error(`lolcat-4play: warmup for ${origin} did not capture reusable browser headers/cookies`);
      }

      if (session) {
        const response = await curlReplayFetch({ url, options, session, proxyUrl: context.proxyUrl || this._proxyUrl(), timeoutMs: this._proxySettings?.()?.timeoutMs, warn: this._warn });
        const text = await response.text();
        if (!looksBlocked(text)) {
          await this._containers.release(containerId, { keep: true });
          return new Response(text, response);
        }
        this._registry.markDegraded(origin, containerId, "curl replay returned block/captcha", { headers: session.headers, cookieJarText: session.cookieJarText });
        const solved = await this._solveWithFlare(url, origin, containerId);
        if (solved) {
          await this._containers.release(containerId, { keep: true });
          return solved;
        }
        await this._containers.retire(containerId);
        return new Response(text, { status: response.status || 403, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }

      throw new Error(`lolcat-4play: no usable session for ${origin}`);
    } catch (error) {
      if (origin) this._registry.markDegraded(origin, containerId, error?.message || "fetch failed");
      await this._containers.release(containerId, { keep: false, degraded: true }).catch(() => {});
      throw error;
    }
  }
}
