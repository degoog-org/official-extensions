const _matchesHost = (domain, host) => {
  const bare = String(domain || "").replace(/^\./, "");
  return host === bare || host.endsWith(`.${bare}`);
};

const _hostCookies = (cookies, host) =>
  cookies
    .filter((cookie) => _matchesHost(cookie.domain, host))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

export const createJar = () => {
  const sessions = new Map();

  const stash = (key, origin, solution, ttlMs) => {
    const cookie = _hostCookies(solution?.cookies ?? [], new URL(origin).hostname);
    if (!cookie) return;
    sessions.set(key, {
      cookie,
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
