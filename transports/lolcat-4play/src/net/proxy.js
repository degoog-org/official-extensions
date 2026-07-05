import { proxyUrlFromSettings } from "./curl-session.js";

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
