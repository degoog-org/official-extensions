const BLOCK_PATTERNS = [
  /captcha/i,
  /unusual traffic/i,
  /automated quer(?:y|ies)/i,
  /verify\s+(?:that\s+)?you\s+are\s+human/i,
  /suspicious (?:activity|behavior|behaviour)/i,
  /our systems have detected/i,
  /not a robot/i,
  /access denied/i,
];

export class OriginBlockedError extends Error {
  constructor(origin, reason = "blocked") {
    super(`lolcat-4play: ${origin} session appears blocked (${reason})`);
    this.name = "OriginBlockedError";
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

export const looksBlocked = (text) => {
  const sample = String(text ?? "").slice(0, 250000);
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
