import { BOOT_SESSION } from "./session.js";
import { SESSION_PLACEHOLDER } from "./types.js";

const LOG_NS = "ai-summary:headers";
const LOCKED_NAMES = new Set(["content-type", "accept"]);
const NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const MAX_HEADERS = 20;
const COMMENT_MARK = "#";

const stamp = (value, session) => value.split(SESSION_PLACEHOLDER).join(session);

export const parseHeaders = (raw) => {
  const lines = (typeof raw === "string" ? raw : "").split(/\r?\n/);
  const pairs = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(COMMENT_MARK)) continue;
    const split = trimmed.indexOf(":");
    if (split <= 0) {
      console.warn(LOG_NS, "skipping header line without a colon");
      continue;
    }
    const name = trimmed.slice(0, split).trim();
    const value = trimmed.slice(split + 1).trim();
    if (!NAME_PATTERN.test(name)) {
      console.warn(LOG_NS, "skipping header with an illegal name");
      continue;
    }
    if (LOCKED_NAMES.has(name.toLowerCase())) {
      console.warn(LOG_NS, `skipping reserved header ${name}`);
      continue;
    }
    pairs.push({ name, value });
    if (pairs.length >= MAX_HEADERS) break;
  }
  return pairs;
};

export const withExtras = (base, config) => {
  const pairs = parseHeaders(config?.extraHeaders);
  if (pairs.length === 0) return base;
  const session = config?.sessionId || BOOT_SESSION;
  const out = { ...base };
  for (const pair of pairs) out[pair.name] = stamp(pair.value, session);
  return out;
};
