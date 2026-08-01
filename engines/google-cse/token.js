const CSE_SCRIPT_URL = "https://cse.google.com/cse/cse.js";
const TOKEN_TTL_MS = 3_600_000;

const _cache = new Map();

const _unwrapJsonp = (text) => {
  const end = text.lastIndexOf("});");
  const start = text.lastIndexOf("({");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start + 1, end + 1));
  } catch {
    return null;
  }
};

const _fetchToken = async (cx, context) => {
  const doFetch = context?.fetch ?? fetch;
  const response = await doFetch(
    `${CSE_SCRIPT_URL}?cx=${encodeURIComponent(cx)}`,
    {
      headers: {
        "User-Agent": context?.userAgent?.() || "Mozilla/5.0",
        Accept: "*/*",
        Cookie: "CONSENT=YES+",
      },
      redirect: "follow",
    },
  );

  context?.sentinel?.(response, "Google CSE");

  const opts = _unwrapJsonp(await response.text());
  if (!opts?.cse_token) return null;

  return {
    token: opts.cse_token,
    libVersion: opts.cselibVersion || "",
    exp: Array.isArray(opts.exp) ? opts.exp.join(",") : "",
  };
};

export const cseToken = async (cx, context) => {
  const cached = _cache.get(cx);
  if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.value;

  const value = await _fetchToken(cx, context);
  if (!value) return null;

  _cache.set(cx, { value, at: Date.now() });
  return value;
};

export const dropToken = (cx) => {
  _cache.delete(cx);
};
