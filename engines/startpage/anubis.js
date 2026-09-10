import { createHash } from "node:crypto";

const CHALLENGE_TAG = 'id="anubis_challenge"';
const CHALLENGE_JSON = /<script id="anubis_challenge"[^>]*>([\s\S]*?)<\/script>/;
const PASS_PATH = "/.within.website/x/cmd/anubis/api/pass-challenge";
const NONCE_HEADROOM = 8;

export const ANUBIS_AUTH_COOKIE = "spchal-auth";

const AUTH_PATTERN = new RegExp(
  `(?:^|;\\s*)${ANUBIS_AUTH_COOKIE}=([^;]+)`,
);

export const hasChallenge = (html) =>
  typeof html === "string" && html.includes(CHALLENGE_TAG);

export const readChallenge = (html) => {
  const match = CHALLENGE_JSON.exec(typeof html === "string" ? html : "");
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

const zeroNibbles = (digest, count) => {
  for (let i = 0; i < count; i++) {
    const byte = digest[i >> 1];
    const nibble = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
    if (nibble !== 0) return false;
  }
  return true;
};

export const crackingDiocane = (data, difficulty) => {
  const started = Date.now();
  const ceiling = Math.pow(16, difficulty) * NONCE_HEADROOM;

  for (let nonce = 0; nonce <= ceiling; nonce++) {
    const digest = createHash("sha256").update(`${data}${nonce}`).digest();
    if (!zeroNibbles(digest, difficulty)) continue;
    return {
      response: digest.toString("hex"),
      nonce,
      elapsedTime: Math.max(1, Date.now() - started),
    };
  }

  return null;
};

export const buildPassUrl = (baseUrl, challenge, solved, redir) => {
  const params = new URLSearchParams({
    id: challenge.id,
    response: solved.response,
    nonce: String(solved.nonce),
    redir,
    elapsedTime: String(solved.elapsedTime),
  });
  return `${baseUrl}${PASS_PATH}?${params.toString()}`;
};

export const readAuthCookie = (res) => {
  const headers = res?.headers;
  if (!headers) return null;

  const listed =
    typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const lines = listed.length ? listed : [headers.get?.("set-cookie") ?? ""];

  for (const line of lines) {
    const match = AUTH_PATTERN.exec(typeof line === "string" ? line : "");
    if (match) return match[1];
  }

  return null;
};
