export const resolveProviderBaseUrl = (userBase, fallback) => {
  const trimmed = userBase.trim();
  if (!trimmed) return fallback;
  const clean = trimmed.replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(clean);
  } catch {
    return fallback;
  }
  if (parsed.pathname && parsed.pathname !== "/") return clean;
  try {
    const fb = new URL(fallback);
    return `${parsed.origin}${fb.pathname.replace(/\/+$/, "")}`;
  } catch {
    return clean;
  }
};
