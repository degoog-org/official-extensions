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
  if (typeof url !== "string" || !url) return null;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
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

  const cleanText = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  const sample = cleanText.slice(0, 250000);
  return BLOCK_PATTERNS.some((pattern) => pattern.test(sample));
};
