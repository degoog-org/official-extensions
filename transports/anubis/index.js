import { createHash } from "node:crypto";

const PASS_PATH = "/.within.website/x/cmd/anubis/api/pass-challenge";
const CHALLENGE_TAG = 'id="anubis_challenge"';
const ANUBIS_ASSET = "/.within.website/x/cmd/anubis/";
const CHALLENGE_JSON = /<script id="anubis_challenge"[^>]*>([\s\S]*?)<\/script>/;
const NONCE_HEADROOM = 8;
const DEFAULT_MAX_DIFFICULTY = 4;

const _isHtml = (res) =>
  (res.headers.get("content-type") ?? "").toLowerCase().includes("html");

const _hasChallenge = (html) =>
  html.includes(CHALLENGE_TAG) ||
  (html.includes(ANUBIS_ASSET) && html.includes("challenge"));

const _readChallenge = (html) => {
  const match = CHALLENGE_JSON.exec(html);
  if (!match) return null;
  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    return null;
  }
  const id = payload?.challenge?.id;
  const data = payload?.challenge?.randomData;
  const difficulty = payload?.rules?.difficulty;
  if (typeof id !== "string" || !id) return null;
  if (typeof data !== "string" || !data) return null;
  if (!Number.isInteger(difficulty) || difficulty < 1) return null;
  return { id, data, difficulty };
};

const _zeroNibbles = (digest, count) => {
  for (let i = 0; i < count; i++) {
    const byte = digest[i >> 1];
    const nibble = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
    if (nibble !== 0) return false;
  }
  return true;
};

/** Anubis wants a sha256 of `${randomData}${nonce}` with `difficulty` leading zero nibbles. */
const _solve = (data, difficulty) => {
  const started = Date.now();
  const ceiling = Math.pow(16, difficulty) * NONCE_HEADROOM;
  for (let nonce = 0; nonce <= ceiling; nonce++) {
    const digest = createHash("sha256").update(`${data}${nonce}`).digest();
    if (!_zeroNibbles(digest, difficulty)) continue;
    return {
      response: digest.toString("hex"),
      nonce,
      elapsedTime: Math.max(1, Date.now() - started),
    };
  }
  return null;
};

const _origin = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

const _setCookies = (res) => {
  const headers = res?.headers;
  if (!headers) return [];
  const listed =
    typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const lines = listed.length ? listed : [headers.get?.("set-cookie") ?? ""];
  const pairs = [];
  for (const line of lines) {
    if (typeof line !== "string" || !line) continue;
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    if (index < 1) continue;
    pairs.push([pair.slice(0, index).trim(), pair.slice(index + 1).trim()]);
  }
  return pairs;
};

export default class AnubisTransport {
  isClientExposed = false;
  name = "anubis";
  displayName = "Anubis (proof of work)";
  description =
    "Solves the Anubis proof-of-work gate that sites like Startpage put in front of search, then replays the request with the cookies it hands back. Engines select it as their outgoing transport; no browser or external service needed.";

  settingsSchema = [
    {
      key: "maxDifficulty",
      label: "Max difficulty",
      type: "number",
      default: "4",
      placeholder: "4",
      min: "1",
      max: "8",
      description:
        "Refuse a challenge harder than this instead of burning CPU on it. Difficulty 4 costs about 40ms; every step up multiplies the work by 16, so 6 already costs seconds per request.",
    },
  ];

  maxDifficulty = DEFAULT_MAX_DIFFICULTY;

  // One jar per origin, kept for the life of the process. Anubis scopes its cookies to the site, and
  // a solved token is reusable until the site expires it, so a jar per origin is what it expects.
  _jars = new Map();

  configure(settings) {
    const parsed = parseInt(settings.maxDifficulty, 10);
    this.maxDifficulty =
      Number.isInteger(parsed) && parsed > 0
        ? Math.min(8, parsed)
        : DEFAULT_MAX_DIFFICULTY;
  }

  available() {
    return true;
  }

  _jar(origin) {
    let jar = this._jars.get(origin);
    if (!jar) {
      jar = new Map();
      this._jars.set(origin, jar);
    }
    return jar;
  }

  _absorb(origin, res) {
    const jar = this._jar(origin);
    for (const [name, value] of _setCookies(res)) {
      if (value) jar.set(name, value);
      else jar.delete(name);
    }
  }

  /** Our cookies go after the caller's, so a token we solved wins over a stale one it carries. */
  _headers(origin, headers) {
    const jar = this._jar(origin);
    if (jar.size === 0) return headers;
    const merged = { ...(headers ?? {}) };
    const existing = merged.Cookie ?? merged.cookie ?? "";
    delete merged.cookie;
    const ours = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    merged.Cookie = existing ? `${existing}; ${ours}` : ours;
    return merged;
  }

  _send(context, url, options, headers) {
    return context.fetch(url, {
      method: options.method ?? "GET",
      redirect: options.redirect ?? "follow",
      signal: options.signal,
      headers,
      body: options.body,
    });
  }

  async fetch(url, options, context) {
    const origin = _origin(url);
    if (!origin) return this._send(context, url, options, options.headers);

    const res = await this._send(
      context,
      url,
      options,
      this._headers(origin, options.headers),
    );
    this._absorb(origin, res);
    if (!_isHtml(res)) return res;

    const html = await res.text();
    if (!_hasChallenge(html)) {
      return new Response(html, { status: res.status, headers: res.headers });
    }

    const challenge = _readChallenge(html);
    // A gate we cannot read is the caller's to report: hand back what the site said.
    if (!challenge || challenge.difficulty > this.maxDifficulty) {
      return new Response(html, { status: res.status, headers: res.headers });
    }

    const solved = _solve(challenge.data, challenge.difficulty);
    if (!solved) {
      return new Response(html, { status: res.status, headers: res.headers });
    }

    const params = new URLSearchParams({
      id: challenge.id,
      response: solved.response,
      nonce: String(solved.nonce),
      redir: url,
      elapsedTime: String(solved.elapsedTime),
    });
    // The cookies the challenge page set have to ride along, or pass-challenge answers 500 and
    // clears the token it would otherwise issue.
    const pass = await context.fetch(`${origin}${PASS_PATH}?${params}`, {
      method: "GET",
      redirect: "manual",
      signal: options.signal,
      headers: this._headers(origin, { ...options.headers, Referer: url }),
    });
    this._absorb(origin, pass);

    const retry = await this._send(
      context,
      url,
      options,
      this._headers(origin, options.headers),
    );
    this._absorb(origin, retry);
    return retry;
  }
}
