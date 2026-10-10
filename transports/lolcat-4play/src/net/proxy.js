import { proxyUrlFromSettings } from "./curl-session.js";

const EXTENSION_SCHEMES = {
  "socks5:": { type: "socks", proxyDNS: false, port: 1080 },
  "socks5h:": { type: "socks", proxyDNS: true, port: 1080 },
  "socks:": { type: "socks", proxyDNS: false, port: 1080 },
  "socks4:": { type: "socks4", proxyDNS: false, port: 1080 },
  "socks4a:": { type: "socks4", proxyDNS: true, port: 1080 },
  "http:": { type: "http", proxyDNS: false, port: 80 },
  "https:": { type: "https", proxyDNS: false, port: 443 },
};

const FLARE_SCHEMES = { "socks5h:": "socks5:", "socks4a:": "socks4:" };

const _credentials = (parsed, target) => {
  if (parsed.username) target.username = decodeURIComponent(parsed.username);
  if (parsed.password) target.password = decodeURIComponent(parsed.password);
  return target;
};

export const extensionProxyFromUrl = (proxyUrl) => {
  const parsed = new URL(proxyUrl);
  const scheme = EXTENSION_SCHEMES[parsed.protocol];
  if (!scheme) {
    throw new Error(`lolcat-4play: Firefox can't use a ${parsed.protocol} proxy`);
  }
  return _credentials(parsed, {
    type: scheme.type,
    host: parsed.hostname,
    port: Number(parsed.port) || scheme.port,
    proxyDNS: scheme.proxyDNS,
  });
};

export const flareProxyFromUrl = (proxyUrl) => {
  if (!proxyUrl) return null;
  const parsed = new URL(proxyUrl);
  const scheme = FLARE_SCHEMES[parsed.protocol] ?? parsed.protocol;
  return _credentials(parsed, { url: `${scheme}//${parsed.host}` });
};

export const buildExtensionProxy = (settings = {}) => {
  const proxy = {
    type: settings.proxyType === "socks5" ? "socks" : settings.proxyType,
    host: settings.proxyHost,
    port: settings.proxyPort,
    proxyDNS: settings.proxyDns,
  };
  if (settings.proxyUsername) proxy.username = settings.proxyUsername;
  if (settings.proxyPassword) proxy.password = settings.proxyPassword;
  return proxy;
};

export const curlProxyUrlFor = (settings = {}) =>
  proxyUrlFromSettings({
    type: settings.proxyType,
    host: settings.proxyHost,
    port: settings.proxyPort,
    username: settings.proxyUsername,
    password: settings.proxyPassword,
    proxyDns: settings.proxyDns,
  });

export const proxyNameplate = (settings = {}) =>
  settings.proxyType && settings.proxyType !== "none" && settings.proxyHost
    ? `${settings.proxyType}://${settings.proxyHost}:${settings.proxyPort}`
    : null;
