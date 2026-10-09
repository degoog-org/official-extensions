export const DEFAULT_TIMEOUT_MS = 12000;
export const DEFAULT_SESSION_TTL_MIN = 30;
export const MS_PER_MINUTE = 60000;

export const CHROME_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
export const FIREFOX_MARK = "Firefox/";

export const BLOCKED_STATUSES = [403, 429, 503];
export const SORRY_PATH = "/sorry/";
export const CHALLENGE_MARKERS = [
  "<title>Just a moment...</title>",
  "<title>Google Search</title>",
  'id="captcha-form"',
];

export const REPLACED_HEADERS = ["user-agent", "cookie"];
export const DIRECT_ROUTE = "direct";
export const MANUAL_REDIRECT = "manual";
export const FOLLOW_REDIRECT = "follow";

export const SOLVE_OK = "ok";
export const SOLVE_FAILED_STATUS = 502;

export const LOG_TAG = "[flaresolverr]";
