const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 250;
const MAX_BYTES = 5 * 1024 * 1024;

export function createThumbCache() {
  const cache = new Map();
  let apiBase = "";

  const useApiBase = (base) => {
    apiBase = String(base || "").replace(/\/+$/, "");
  };

  const prune = () => {
    const now = Date.now();
    for (const [id, entry] of cache) {
      if (now - entry.ts > TTL_MS) cache.delete(id);
    }
    if (cache.size <= MAX_ENTRIES) return;
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < cache.size - MAX_ENTRIES; i++) {
      cache.delete(oldest[i][0]);
    }
  };

  const store = async (fetchFn, imageUrl, headers) => {
    if (!imageUrl) return "";
    try {
      const res = await fetchFn(imageUrl, { headers });
      if (!res.ok) return "";
      const contentType =
        res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
      const body = await res.arrayBuffer();
      if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return "";
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      cache.set(id, { body, contentType, ts: Date.now() });
      prune();
      return `${apiBase}/thumb?id=${encodeURIComponent(id)}`;
    } catch {
      return "";
    }
  };

  const route = {
    method: "get",
    path: "/thumb",
    handler: async (req) => {
      const id = new URL(req.url).searchParams.get("id");
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        return new Response(null, { status: 400 });
      }
      const entry = cache.get(id);
      if (!entry || Date.now() - entry.ts > TTL_MS) {
        if (entry) cache.delete(id);
        return new Response(null, { status: 404 });
      }
      return new Response(entry.body, {
        status: 200,
        headers: {
          "Content-Type": entry.contentType,
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
  };

  return { store, route, useApiBase };
}
