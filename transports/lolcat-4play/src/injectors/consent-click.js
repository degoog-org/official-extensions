import { consentMatchers } from "../warmup/consents.js";

const CONSENT = consentMatchers();

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
