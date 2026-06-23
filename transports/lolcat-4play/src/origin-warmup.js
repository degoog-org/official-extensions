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
];

export class OriginBlockedError extends Error {
  constructor(origin, reason = "blocked") {
    super(`lolcat-4play: ${origin} session appears blocked (${reason})`);
    this.name = "SentinelBreach";
    this.status = "captcha";
    this.origin = origin;
    this.reason = reason;
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

export const looksBlocked = (text, url = "") => {
  if (typeof text !== "string") return false;

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

  // 3. If the title matches the query + search engine suffix exactly, it is a successful search
  const query = queryFromUrl(url);
  if (query) {
    const cleanTitle = title.replace(/\s*-\s*(Google|Brave)\s*Search/i, "").trim().toLowerCase();
    if (cleanTitle === query.toLowerCase()) {
      return false;
    }
  }

  // 4. Fallback: If title contains "Google Search" or "Brave Search" but NOT access denied / forbidden, assume successful
  if (
    (lowerTitle.includes("google search") || lowerTitle.includes("brave search")) &&
    !lowerTitle.includes("forbidden") &&
    !lowerTitle.includes("access denied")
  ) {
    return false;
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
