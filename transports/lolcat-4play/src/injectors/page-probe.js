export const pageProbeJs = (domMatch = "") => `(() => {
  const selector = ${JSON.stringify(String(domMatch || ""))};
  return {
    href: location.href,
    title: document.title || "",
    state: document.readyState,
    len: document.body?.innerHTML?.length || 0,
    hit: selector ? Boolean(document.querySelector(selector)) : false,
  };
})()`;
