import {
  consentClickJs,
  documentHtmlJs,
  inspectPageJs,
  progressPageJs,
  readyStateJs,
  warmupSearchJs,
} from "../injectors/index.js";

const WARMUP_ACTION_TIMEOUT_MS = 5000;
const OPEN_READY_TIMEOUT_MS = 2000;
const DEFAULT_SETTLE_MS = 1500;

const BLOCK_PATTERNS = [
  /captcha/i,
  /unusual traffic/i,
  /automated quer(?:y|ies)/i,
  /verify\s+(?:that\s+)?you\s+are\s+human/i,
  /confirm\s+this\s+search\s+was\s+made\s+by\s+a\s+human/i,
  /confirm\s+you\s+are\s+(?:a\s+)?human/i,
  /bots\s+use/i,
  /complete\s+(?:the\s+)?following\s+challenge/i,
  /select\s+all\s+squares/i,
  /suspicious (?:activity|behavior|behaviour)/i,
  /our systems have detected/i,
  /not a robot/i,
  /access denied/i,
  /\/httpservice\/retry\/enablejs/i,
  /Please click\s+<a\s+href=["']\/httpservice/i,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const queryFromUrl = (url) => {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("q") || "";
  } catch {
    return "";
  }
};

const looksBlocked = (text, url = "") => {
  if (typeof text !== "string") return false;
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(text);
  const title = titleMatch ? titleMatch[1].trim() : "";
  const lowerTitle = title.toLowerCase();
  if (
    lowerTitle.includes("bot check") ||
    lowerTitle.includes("robot check") ||
    lowerTitle.includes("captcha") ||
    lowerTitle.includes("pardon our interruption") ||
    lowerTitle.includes("attention required") ||
    lowerTitle.includes("just a moment")
  )
    return true;
  const query = queryFromUrl(url);
  if (query) {
    const cleanTitle = title
      .replace(/\s*-\s*.+\s+Search$/i, "")
      .trim()
      .toLowerCase();
    if (cleanTitle === query.toLowerCase()) return false;
  }
  if (
    /\s-\s.+\s+search$/i.test(lowerTitle) &&
    !lowerTitle.includes("forbidden") &&
    !lowerTitle.includes("access denied")
  )
    return false;
  if (
    /\/httpservice\/retry\/enablejs/i.test(text) ||
    /enablejs\?sei=/i.test(text)
  )
    return true;
  const cleanText = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  return BLOCK_PATTERNS.some((pattern) =>
    pattern.test(cleanText.slice(0, 250000)),
  );
};

export class TabSession {
  constructor({
    client,
    registry,
    timeoutMs,
    warmupQuery,
    humanDelayRange,
    warn,
  }) {
    this._client = client;
    this._registry = registry;
    this._timeoutMs = timeoutMs;
    this._warmupQuery = warmupQuery;
    this._humanDelayRange = humanDelayRange;
    this._warn = warn;
    this.ownedTabs = new Set();
    this.tabContainers = new Map();
    this._domWaiters = new Map();
    this._responseWaiters = new Map();
    this._responses = new Map();
  }

  clear() {
    this.ownedTabs.clear();
    this.tabContainers.clear();
    for (const waiter of this._domWaiters.values()) waiter.resolve(null);
    this._domWaiters.clear();
    for (const waiter of this._responseWaiters.values()) waiter.resolve(null);
    this._responseWaiters.clear();
    this._responses.clear();
  }

  rememberTab(data = {}) {
    if (typeof data.id === "number" && data.container)
      this.tabContainers.set(data.id, data.container);
  }

  settleDom(msg) {
    const tabId = msg?.data?.id;
    const waiter =
      typeof tabId === "number" ? this._domWaiters.get(tabId) : null;
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this._domWaiters.delete(tabId);
    if (msg.action === "dom_load_fail")
      waiter.reject(new Error("tab failed to load"));
    else waiter.resolve(msg.data);
  }

  settleWebResponse(data = {}) {
    const tabId =
      typeof data.id === "number"
        ? data.id
        : typeof data.tabId === "number"
          ? data.tabId
          : null;
    if (tabId === null || !this.ownedTabs.has(tabId)) return;
    const html = decodeResponseHtml(data);
    if (!html) return;
    const waiter = this._responseWaiters.get(tabId);
    if (waiter) {
      clearTimeout(waiter.timer);
      this._responseWaiters.delete(tabId);
      waiter.resolve({ html, data });
      return;
    }
    this._responses.set(tabId, { html, data });
  }

  awaitWebResponse(tabId, timeoutMs = this._timeoutMs()) {
    const cached = this._responses.get(tabId);
    if (cached) {
      this._responses.delete(tabId);
      return Promise.resolve(cached);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._responseWaiters.delete(tabId);
        resolve(null);
      }, timeoutMs);
      this._responseWaiters.set(tabId, { resolve, timer });
    });
  }

  awaitReady(tabId, timeoutMs = this._timeoutMs()) {
    const dom = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._domWaiters.delete(tabId);
        resolve(null);
      }, timeoutMs);
      this._domWaiters.set(tabId, { resolve, reject, timer });
    });
    return Promise.race([dom, this._pollReady(tabId, timeoutMs)]);
  }

  async _pollReady(tabId, timeoutMs = this._timeoutMs()) {
    const deadline = Date.now() + timeoutMs;
    await sleep(Math.min(1200, Math.max(100, timeoutMs / 4)));
    while (Date.now() < deadline) {
      const state = await this.inject(
        tabId,
        readyStateJs(),
        Math.min(1000, timeoutMs),
      ).catch(() => null);
      if (state === "complete" || state === "interactive")
        return { id: tabId, via: "poll" };
      await sleep(400);
    }
    return null;
  }

  async open(url, containerId = null) {
    const tab = await this._client.openTab(url, containerId, this._timeoutMs());
    const tabId = tab?.data?.id;
    if (typeof tabId !== "number")
      throw new Error("4play tab_open did not return tab id");
    this.ownedTabs.add(tabId);
    if (containerId) this.tabContainers.set(tabId, containerId);
    return tabId;
  }

  async close(tabId) {
    if (typeof tabId !== "number") return;
    this.ownedTabs.delete(tabId);
    this.tabContainers.delete(tabId);
    this._responses.delete(tabId);
    const waiter = this._responseWaiters.get(tabId);
    if (waiter) {
      clearTimeout(waiter.timer);
      this._responseWaiters.delete(tabId);
      waiter.resolve(null);
    }
    await this._client.closeTabs([tabId]).catch(() => {});
  }

  async inject(tabId, js, timeoutMs = this._timeoutMs()) {
    const res = await this._client.inject(tabId, js, timeoutMs);
    if (res?.status !== true) return null;
    const first = Array.isArray(res.result) ? res.result[0] : null;
    return first?.result ?? null;
  }

  async warmLikeHuman(origin, containerId = null) {
    let tabId = null;
    let reachedSearch = false;
    try {
      tabId = await this._timed(origin, "open+consent", () =>
        this._openWarmupTab(origin, containerId),
      );
      reachedSearch = await this._timed(origin, "form", () =>
        this._tryWarmupForm(origin, containerId, tabId),
      );
      if (!reachedSearch) {
        await this._timed(origin, "inspect", () =>
          this._inspectWarmupPage(origin, tabId),
        );
      }
      return { tabId, reachedSearch };
    } finally {
      await this.close(tabId);
    }
  }

  async _openWarmupTab(origin, containerId) {
    const tabId = await this.open(`${origin}/`, containerId);
    await this.awaitReady(
      tabId,
      Math.min(OPEN_READY_TIMEOUT_MS, this._timeoutMs()),
    );
    await sleep(DEFAULT_SETTLE_MS);
    await this.acceptConsent(tabId);
    return tabId;
  }

  async _tryWarmupForm(origin, containerId, tabId, progressAttempts = 0) {
    const cap = Math.min(WARMUP_ACTION_TIMEOUT_MS, this._timeoutMs());
    const submitted = await this.inject(
      tabId,
      warmupSearchJs(this._warmupQuery()),
      cap,
    );
    if (!submitted?.submitted) {
      if (progressAttempts >= 2) return false;
      const progressed = await this._progressPage(
        origin,
        containerId,
        tabId,
        `search form unavailable (${submitted?.reason || "unknown"})`,
      );
      if (!progressed) return false;
      return this._tryWarmupForm(
        origin,
        containerId,
        tabId,
        progressAttempts + 1,
      );
    }
    await sleep(DEFAULT_SETTLE_MS);
    await this._inspectWarmupPage(origin, tabId);
    return true;
  }

  async _progressPage(origin, containerId, tabId, stage) {
    const cap = Math.min(WARMUP_ACTION_TIMEOUT_MS, this._timeoutMs());
    const navigated = this.awaitReady(tabId, cap).catch(() => null);
    const progressed = await this.inject(tabId, progressPageJs(), cap);
    if (!progressed?.progressed) return false;
    this._warn?.(
      `warmup progressed ${origin} (${stage}, container=${containerId || "default"}, tab=${tabId}, via=${progressed.via || "unknown"}, target=${progressed.href || "unknown"})`,
    );
    await navigated;
    await sleep(DEFAULT_SETTLE_MS);
    return true;
  }

  async _inspectWarmupPage(origin, tabId) {
    const page = await this.inject(
      tabId,
      inspectPageJs(),
      Math.min(WARMUP_ACTION_TIMEOUT_MS, this._timeoutMs()),
    );
    const haystack = `${page?.title || ""}\n${page?.href || ""}\n${page?.text || ""}`;
    if (looksBlocked(haystack, page?.href)) {
      throw new Error(
        `lolcat-4play: ${origin} warmup page appears blocked/captcha`,
      );
    }
    return page;
  }

  async _timed(origin, phase, run) {
    const started = Date.now();
    try {
      return await run();
    } finally {
      this._warn?.(
        `warmup phase ${phase} for ${origin} took ${Date.now() - started}ms`,
      );
    }
  }

  async htmlFetch(url, origin, containerId = null) {
    const tabId = await this.open(url, containerId);
    await this.awaitReady(tabId).catch(() => null);
    await sleep(900);
    await this.acceptConsent(tabId);
    const html = await this.inject(tabId, documentHtmlJs());
    if (!html) throw new Error("tab_inject_js returned empty HTML");
    return { html, tabId };
  }

  async rawHtmlFetch(url, origin, containerId = null) {
    await this._client.webResponseWhitelist([url]);
    let tabId = null;
    try {
      tabId = await this.open(url, containerId);
      const response = this.awaitWebResponse(tabId);
      await this.awaitReady(tabId).catch(() => null);
      const captured = await response;
      if (!captured?.html)
        throw new Error("4play web_response did not return raw HTML");
      return { html: captured.html, tabId, raw: captured.data };
    } catch (error) {
      await this.close(tabId).catch(() => {});
      throw error;
    } finally {
      await this._client.webResponseWhitelist([]).catch(() => {});
    }
  }

  async acceptConsent(tabId) {
    const result = await this.inject(
      tabId,
      consentClickJs(),
      Math.min(WARMUP_ACTION_TIMEOUT_MS, this._timeoutMs()),
    ).catch(() => null);
    if (!result) return false;
    if (!result.consent) return true;
    if (!result.progressed) return false;
    this._warn?.(
      `accepted consent on tab ${tabId} (${result.label || result.via || "unknown"})`,
    );
    await sleep(1000);
    return true;
  }

  async progressPage(tabId) {
    return this.inject(
      tabId,
      progressPageJs(),
      Math.min(WARMUP_ACTION_TIMEOUT_MS, this._timeoutMs()),
    ).catch(() => null);
  }
}

const decodeResponseHtml = (data = {}) => {
  const encoded =
    data.base64 ||
    data.bodyBase64 ||
    data.contentBase64 ||
    data.responseBase64 ||
    data.body ||
    data.content ||
    data.response;
  if (typeof encoded !== "string" || !encoded) return "";
  if (data.encoding && String(data.encoding).toLowerCase() !== "base64")
    return encoded;
  try {
    if (typeof Buffer !== "undefined")
      return Buffer.from(encoded, "base64").toString("utf8");
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    return encoded;
  }
};
