export const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
export const BASE_URL = "https://www.startpage.com";
export const SEARCH_URL = `${BASE_URL}/sp/search`;

export const TIME_MAP = { hour: "h", day: "d", week: "w", month: "m", year: "y" };
export const SAFE_MAP = { off: "none", on: "heavy" };

export const READY_SELECTOR = "#debug";
export const ANUBIS_MARKER = 'id="anubis_challenge"';

export const CAPTCHA_MARKERS = [
  "/sp/captcha",
  "Startpage Captcha",
  "CAPTCHA Verification",
  "captcha-section",
];

export const SUSPENDED_MARKERS = [
  "Access Denied - Startpage",
  "error-pages/blocked.html",
];
