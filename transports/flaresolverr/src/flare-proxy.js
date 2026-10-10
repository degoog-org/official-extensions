import { LOG_TAG } from "./const.js";

const BROWSER_SCHEMES = { "socks5h:": "socks5:", "socks4a:": "socks4:" };

export const flareProxy = (proxyUrl) => {
  if (!proxyUrl) return null;
  try {
    const parsed = new URL(proxyUrl);
    const scheme = BROWSER_SCHEMES[parsed.protocol] ?? parsed.protocol;
    const proxy = { url: `${scheme}//${parsed.host}` };
    if (parsed.username) proxy.username = decodeURIComponent(parsed.username);
    if (parsed.password) proxy.password = decodeURIComponent(parsed.password);
    return proxy;
  } catch (err) {
    console.warn(`${LOG_TAG} ignoring a proxy FlareSolverr can't use: ${err?.message || err}`);
    return null;
  }
};
