export const inspectPageJs = () => `(() => {
  const bodyText = document.body?.innerText || "";
  return {
    href: location.href,
    title: document.title || "",
    text: bodyText.slice(0, 20000),
  };
})()`;
