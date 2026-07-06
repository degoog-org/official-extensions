export const warmupSearchJs = (query) => `(() => {
  const isVisible = (el) => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
  };
  const candidates = [
    ...document.querySelectorAll([
      'textarea[name="q"]',
      'input[name="q"]',
      'input[type="search"]',
      'input[role="searchbox"]',
      'textarea[role="searchbox"]',
      'input[aria-label*="search" i]',
      'textarea[aria-label*="search" i]',
      'input[placeholder*="search" i]',
      'textarea[placeholder*="search" i]',
    ].join(',')),
  ].filter((el) => !el.disabled && !el.readOnly && isVisible(el));

  const field = candidates[0];
  if (!field) {
    return { submitted: false, reason: "no_search_box", href: location.href, title: document.title || "" };
  }

  const value = ${JSON.stringify(String(query ?? "weather"))};
  field.focus();
  field.value = value;
  field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  field.dispatchEvent(new Event("change", { bubbles: true }));

  const form = field.form || field.closest("form");
  if (form?.requestSubmit) {
    form.requestSubmit();
  } else if (form) {
    form.submit();
  } else {
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    field.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }

  return { submitted: true, href: location.href, title: document.title || "" };
})()`;
