const PROGRESS_TEXT_RE =
  /^(?:continue|next|proceed|i agree|agree|accept|accept all|allow all|yes,? continue|not now|skip|here)$/i;
const PROGRESS_HREF_RE = /\/httpservice\/retry\/enablejs/i;
const AUTH_HREF_RE = /accounts\.|\/servicelogin|\/signin|\/login\b|passive=true|flowname=glifwebsignin/i;

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
