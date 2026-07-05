import { consentMatchers } from "./consents.js";

const CONSENT = consentMatchers();

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

const PROGRESS_TEXT_RE =
  /^(?:continue|next|proceed|start|search|i agree|agree|accept|accept all|allow all|yes,? continue|not now|skip|here)$/i;
const PROGRESS_HREF_RE = /\/httpservice\/retry\/enablejs/i;
const AUTH_HREF_RE = /accounts\.|\/servicelogin|\/signin|\/login\b|passive=true|flowname=glifwebsignin/i;

export class OriginBlockedError extends Error {
  constructor(origin, reason = "blocked", tabId = null, status = "captcha") {
    const tabSuffix = typeof tabId === "number" ? `, tab=${tabId}` : "";
    super(`lolcat-4play: ${origin} session appears blocked (${reason}${tabSuffix})`);
    this.name = "SentinelBreach";
    this.status = status;
    this.origin = origin;
    this.reason = reason;
    this.tabId = tabId;
  }
}

export const originFor = (url) => {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) return null;
  return parsed.origin;
};

export const warmupKeyFor = (origin, containerId) => `${containerId || "default"}\n${origin}`;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const queryFromUrl = (url) => {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("q") || "";
  } catch {
    return "";
  }
};

export const looksConsent = (text, url = "") => {
  if (typeof text !== "string") return false;

  try {
    const parsed = new URL(url || "https://invalid");
    const host = parsed.hostname.toLowerCase();
    if (CONSENT.hosts.some((h) => host.includes(h))) return true;
    if (/^consent\./i.test(parsed.hostname) || /\/consent\b/i.test(parsed.pathname)) return true;
  } catch {
  }

  if (!CONSENT.texts.length) return false;

  const sample = (
    text.includes("<")
      ? text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      : text
  )
    .slice(0, 50000)
    .toLowerCase();

  return CONSENT.texts.some((t) => sample.includes(t));
};

export const looksBlocked = (text, url = "") => {
  if (typeof text !== "string") return false;
  if (looksConsent(text, url)) return false;

  // 1. Extract the title from HTML if present
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(text);
  const title = titleMatch ? titleMatch[1].trim() : "";
  const lowerTitle = title.toLowerCase();

  // 2. Check for explicit bot check / captcha indicators in the title
  if (
    lowerTitle.includes("bot check") ||
    lowerTitle.includes("robot check") ||
    lowerTitle.includes("captcha") ||
    lowerTitle.includes("pardon our interruption") ||
    lowerTitle.includes("attention required") ||
    lowerTitle.includes("just a moment")
  ) {
    return true;
  }

  const query = queryFromUrl(url);
  if (query) {
    const cleanTitle = title.replace(/\s*-\s*.+\s+Search$/i, "").trim().toLowerCase();
    if (cleanTitle === query.toLowerCase()) {
      return false;
    }
  }

  if (
    /\s-\s.+\s+search$/i.test(lowerTitle) &&
    !lowerTitle.includes("forbidden") &&
    !lowerTitle.includes("access denied")
  ) {
    return false;
  }

  if (/\/httpservice\/retry\/enablejs/i.test(text) || /enablejs\?sei=/i.test(text)) {
    return true;
  }

  // 5. Strip scripts and styles to avoid matching embedded translation JSON strings or styles
  const cleanText = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  const sample = cleanText.slice(0, 250000);
  return BLOCK_PATTERNS.some((pattern) => pattern.test(sample));
};

export const inspectPageJs = () => `(() => {
  const bodyText = document.body?.innerText || "";
  return {
    href: location.href,
    title: document.title || "",
    text: bodyText.slice(0, 20000),
  };
})()`;

export const consentClickJs = () => `(() => {
  const M = ${JSON.stringify(CONSENT)};
  const isVisible = (el) => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
  };
  const norm = (value) => (value || "").replace(/\\s+/g, " ").trim().toLowerCase();
  const bySelector = (predicate) => {
    for (const selector of M.acceptSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el && predicate(el)) return el;
      } catch {}
    }
    return null;
  };

  const acceptSet = new Set(M.acceptText);
  const rejectSet = new Set(M.rejectText);
  const isAccept = (text) => acceptSet.has(text) || text.startsWith("accept all");
  const isReject = (text) => rejectSet.has(text);

  const controls = [
    ...document.querySelectorAll(
      'button, input[type="submit"], input[type="button"], [role="button"], a[role="button"]',
    ),
  ].map((el) => ({
    el,
    text: norm(el.innerText || el.value || el.getAttribute("aria-label") || el.textContent),
  }));

  const acceptButtons = controls.filter(({ text }) => isAccept(text));
  const rejectButtons = controls.filter(({ text }) => isReject(text));
  const heading = norm(document.querySelector('h1, h2, [role="heading"]')?.textContent);
  const host = location.hostname.toLowerCase();

  const looksConsent =
    M.texts.some((t) => heading.includes(t)) ||
    M.hosts.some((h) => host.includes(h)) ||
    (acceptButtons.length > 0 && rejectButtons.length > 0) ||
    Boolean(bySelector(() => true));

  if (!looksConsent) {
    return { consent: false, progressed: false, href: location.href, title: document.title || "" };
  }

  const rank = (text) =>
    text === "accept all" ? 3 : text.startsWith("accept all") ? 2 : 1;
  const target =
    bySelector(isVisible) ||
    (acceptButtons
      .filter(({ el }) => isVisible(el))
      .sort((a, b) => rank(b.text) - rank(a.text))[0] || acceptButtons[0])?.el;

  if (target) {
    target.click();
    return {
      consent: true,
      progressed: true,
      via: "consent",
      label: norm(target.innerText || target.textContent) || "accept",
      href: location.href,
      title: document.title || "",
    };
  }

  return { consent: true, progressed: false, href: location.href, title: document.title || "" };
})()`;

export const progressPageJs = () => `(() => {
  const textRe = ${PROGRESS_TEXT_RE};
  const hrefRe = ${PROGRESS_HREF_RE};
  const authRe = ${AUTH_HREF_RE};
  const isVisible = (el) => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
  };

  const resolveUrl = (href) => {
    try { return new URL(href, location.href).href; } catch { return href || ""; }
  };

  const candidates = [
    ...document.querySelectorAll('a[href], button, input[type="submit"], input[type="button"]'),
  ];

  for (const el of candidates) {
    const label = (el.innerText || el.value || el.getAttribute('aria-label') || el.textContent || '').trim();
    const href = el.getAttribute?.('href') || '';
    const target = resolveUrl(href);
    if (authRe.test(href) || authRe.test(target)) continue;
    const hrefLooksUseful = hrefRe.test(href) || hrefRe.test(target);
    const textLooksUseful = textRe.test(label);
    if (!hrefLooksUseful && !textLooksUseful) continue;

    if (hrefLooksUseful) {
      location.href = target;
      return { progressed: true, via: 'href', label, href: target, title: document.title || '' };
    }
    if (isVisible(el)) {
      el.click();
      return { progressed: true, via: 'click', label, href: target, title: document.title || '' };
    }
  }

  const meta = document.querySelector('meta[http-equiv="refresh" i][content*="url=" i]');
  const content = meta?.getAttribute('content') || '';
  const match = /url=([^;]+)/i.exec(content);
  if (match?.[1]) {
    const target = resolveUrl(match[1].trim().replace(/^['\"]|['\"]$/g, ''));
    if (hrefRe.test(target)) {
      location.href = target;
      return { progressed: true, via: 'meta-refresh', href: target, title: document.title || '' };
    }
  }

  return { progressed: false, href: location.href, title: document.title || '' };
})()`;

export const warmupSearchJs = (query) => `(() => {
  const isVisible = (el) => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
  };
  const candidates = [
    ...document.querySelectorAll([
      'textarea[name="q"]',
      'input[name="q"]',
      'input[type="search"]',
      'input[role="searchbox"]',
      'textarea[role="searchbox"]',
      'input[aria-label*="search" i]',
      'textarea[aria-label*="search" i]',
      'input[placeholder*="search" i]',
      'textarea[placeholder*="search" i]',
    ].join(',')),
  ].filter((el) => !el.disabled && !el.readOnly && isVisible(el));

  const field = candidates[0];
  if (!field) {
    return { submitted: false, reason: "no_search_box", href: location.href, title: document.title || "" };
  }

  const value = ${JSON.stringify(String(query ?? "weather"))};
  field.focus();
  field.value = value;
  field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  field.dispatchEvent(new Event("change", { bubbles: true }));

  const form = field.form || field.closest("form");
  if (form?.requestSubmit) {
    form.requestSubmit();
  } else if (form) {
    form.submit();
  } else {
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    field.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }

  return { submitted: true, href: location.href, title: document.title || "" };
})()`;
