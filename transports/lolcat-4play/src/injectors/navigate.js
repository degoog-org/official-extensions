export const navigateJs = (url) => `(() => {
  const target = ${JSON.stringify(String(url ?? ""))};
  if (!target) return { navigating: false, reason: "no_target" };
  const from = location.href;
  location.assign(target);
  return { navigating: true, from };
})()`;
