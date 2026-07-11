const PLACEHOLDER = /\{\{\{s\}\}\}|%s/g;

const isTruthy = (v) => v === true || v === "true";

const flagOrDefault = (v) => (v === undefined || v === null ? true : isTruthy(v));

const stripPlaceholder = (template) => template.replace(PLACEHOLDER, "");

const encodeTerms = (query, bang) => {
  if (!flagOrDefault(bang.encodeQuery)) return query;
  const encoded = encodeURIComponent(query);
  if (flagOrDefault(bang.spaceToPlus)) return encoded.replace(/%20/g, "+");
  return encoded;
};

const substitute = (template, query, bang) =>
  template.replace(PLACEHOLDER, encodeTerms(query, bang));

const basePath = (template) => {
  try {
    const u = new URL(stripPlaceholder(template));
    return u.origin + u.pathname;
  } catch {
    return "";
  }
};

const snapDomain = (bang, template) => {
  let host = (bang.snapDomain || "").trim();
  if (!host) {
    try {
      host = new URL(stripPlaceholder(template)).hostname;
    } catch {
      host = "";
    }
  }
  if (!host) return "";
  if (/^https?:\/\//i.test(host)) return host;
  return `https://${host.replace(/^\/+/, "")}`;
};

const applyRegex = (pattern, query) => {
  try {
    const match = new RegExp(pattern).exec(query);
    if (!match) return query;
    return match[1] != null ? match[1] : match[0];
  } catch {
    return query;
  }
};

export const buildBangUrl = (bang, terms) => {
  const template = (bang.url || "").trim();
  if (!template) return "";
  const hasTerms = terms != null && String(terms).trim() !== "";

  if (!hasTerms) {
    if (isTruthy(bang.openBase)) {
      const base = basePath(template);
      if (base) return base;
    }
    if (isTruthy(bang.openSnap)) {
      const snap = snapDomain(bang, template);
      if (snap) return snap;
    }
    return substitute(template, "", bang);
  }

  let query = String(terms).trim();
  if (bang.regex) query = applyRegex(bang.regex, query);
  return substitute(template, query, bang);
};
