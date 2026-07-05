const FLARE_CMD = "request.get";
const MIN_FLARE_TIMEOUT_MS = 10000;
const ABORT_GRACE_MS = 5000;

const resolveEndpoint = (base) => {
  const trimmed = String(base || "").replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
};

const cookiesToHeader = (cookies = []) =>
  (Array.isArray(cookies) ? cookies : [])
    .filter((cookie) => cookie?.name)
    .map((cookie) => `${cookie.name}=${cookie.value ?? ""}`)
    .join("; ");

export const solveChallenge = async ({ endpoint, url, timeoutMs = 60000, proxyUrl = "" }) => {
  const target = resolveEndpoint(endpoint);
  if (!target) return null;

  const maxTimeout = Math.max(MIN_FLARE_TIMEOUT_MS, Number(timeoutMs) || 60000);
  const body = { cmd: FLARE_CMD, url, maxTimeout };
  if (proxyUrl) body.proxy = { url: proxyUrl };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxTimeout + ABORT_GRACE_MS);

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`FlareSolverr responded ${response.status}`);
    }

    const data = await response.json();
    if (data?.status !== "ok" || !data?.solution) {
      throw new Error(data?.message || "FlareSolverr returned no solution");
    }

    return {
      html: data.solution.response || "",
      cookieHeader: cookiesToHeader(data.solution.cookies),
      userAgent: data.solution.userAgent || "",
    };
  } finally {
    clearTimeout(timer);
  }
};
