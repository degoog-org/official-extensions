const TIMEOUT_MS = 8000;

const STATUS_ERRORS = {
  401: "Dynacat rejected the credentials",
  403: "Dynacat rejected the credentials",
  404: "Not found, check the API is enabled and the page exists",
  429: "Dynacat rate limit reached",
};

const trimUrl = (url) => String(url || "").trim().replace(/\/+$/, "");

export const createClient = ({ baseUrl, token, username, password, fetchFn }) => {
  const base = trimUrl(baseUrl);
  const doFetch = fetchFn || fetch;

  const headers = () => {
    const out = { Accept: "application/json" };
    if (token) out["X-API-Token"] = token;
    if (username && password) {
      out.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    }
    return out;
  };

  const get = async (path, signal) => {
    if (!base) throw new Error("Dynacat URL is not set");
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    if (signal) signal.addEventListener("abort", () => abort.abort(), { once: true });
    try {
      const res = await doFetch(`${base}/api/v1${path}`, {
        headers: headers(),
        signal: abort.signal,
      });
      if (STATUS_ERRORS[res.status]) throw new Error(STATUS_ERRORS[res.status]);
      if (!res.ok) throw new Error(`Dynacat responded with ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    base,
    listPages: (signal) => get("/pages", signal),
    getPage: (slug, signal) => get(`/pages/${encodeURIComponent(slug)}`, signal),
    getWidget: (id, signal) => get(`/widgets/${encodeURIComponent(id)}`, signal),
    absolute: (path) => {
      const p = String(path || "");
      if (!p) return "";
      if (/^https?:\/\//i.test(p)) return p;
      return `${base}${p.startsWith("/") ? "" : "/"}${p}`;
    },
  };
};

// Dynacat nests container widgets such as group and split-column under `widgets`.
export const flattenWidgets = (widgets, prefix = "") =>
  (widgets || []).flatMap((widget, index) => {
    const path = prefix ? `${prefix}.${index}` : String(index);
    if (Array.isArray(widget.widgets) && widget.widgets.length > 0) {
      return flattenWidgets(widget.widgets, path);
    }
    const apiId = widget["api-id"] || "";
    return {
      key: apiId || `${widget.type}-${path}`,
      apiId,
      type: widget.type || "unknown",
      title: widget.title || widget.type || "Widget",
      error: widget.error || "",
      data: widget.data || null,
    };
  });
