const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const _matchesHost = (domain, host) => {
  const bare = String(domain || "").replace(/^\./, "");
  return host === bare || host.endsWith(`.${bare}`);
};

const _trustworthy = (url) =>
  url.protocol === "https:" ||
  LOCAL_HOSTS.has(url.hostname) ||
  url.hostname.endsWith(".localhost") ||
  /^127\./.test(url.hostname);

const _keep = (cookie) => ({
  name: cookie.name,
  value: cookie.value,
  domain: cookie.domain,
  secure: cookie.secure === true,
});

export const cookieHeaderFor = (session, target) => {
  const url = new URL(target);
  const secureOk = _trustworthy(url);
  return session.cookies
    .filter((cookie) => _matchesHost(cookie.domain, url.hostname))
    .filter((cookie) => secureOk || !cookie.secure)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
};

export const createJar = () => {
  const sessions = new Map();

  const _sweep = () => {
    const now = Date.now();
    for (const [key, session] of sessions) {
      if (session.expires <= now) sessions.delete(key);
    }
  };

  const stash = (key, origin, solution, ttlMs) => {
    _sweep();
    const host = new URL(origin).hostname;
    const cookies = (solution?.cookies ?? [])
      .filter((cookie) => cookie?.name && _matchesHost(cookie.domain, host))
      .map(_keep);
    if (!cookies.length) return;
    sessions.set(key, {
      cookies,
      userAgent: solution.userAgent || "",
      expires: Date.now() + ttlMs,
    });
  };

  const find = (key) => {
    const session = sessions.get(key);
    if (!session) return null;
    if (session.expires > Date.now()) return session;
    sessions.delete(key);
    return null;
  };

  const drop = (key) => sessions.delete(key);
  const clear = () => sessions.clear();

  return { stash, find, drop, clear };
};
