export const SEARCH_URL = "https://www.google.com/search";

export const TBS_MAP = {
  hour: "qdr:h",
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
};

export const MUTANT_SIGNATURES = [
  "/httpservice/retry/enablejs",
  'Please click <a href="/httpservice',
];

export const SORRY_SIGNATURES = [
  'id="captcha-form"',
  "unusual traffic from your computer network",
  "/sorry/index?continue=",
];

export const UDM_WEB_ONLY = "14";
export const SERP_READY_SELECTOR = "#search h3, #rso h3";
export const SERP_SORRY_PATH = "/sorry/";

export const GOTO_PREFIX = "/goto?";
export const GOTO_ORIGIN = "https://www.google.com";
export const GOTO_PATH = "/goto";
export const GOTO_PAGE_MAX_BYTES = 8192;
export const GOTO_TIMEOUT_MS = 5000;
export const GOTO_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

export const SOFT_CAPTCHA_TITLE = "<title>Google</title>";
export const SOFT_CAPTCHA_EID_RE = /var eid ?= ?'([^']*)'/;
export const SOFT_CAPTCHA_WAIT_MS = 10000;
