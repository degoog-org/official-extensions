import { ID_RE, SIZES } from "./const/api.js";
import { buildSettingsSchema } from "./settings.js";
import { validSig } from "./sign.js";
import { buildSearchRequest, buildThumbUrl, trimUrl } from "./request.js";
import { parseAssets } from "./parse.js";

export default class ImmichEngine {
  isClientExposed = false;
  name = "Immich";
  bangShortcut = "immich";
  immichUrl = "";
  publicUrl = "";
  apiKey = "";
  pageSize = 30;
  thumbSize = "thumbnail";

  get settingsSchema() {
    return buildSettingsSchema(this.t);
  }

  routes = [
    {
      method: "get",
      path: "/thumb",
      handler: (req) => this.serveThumb(req),
    },
  ];

  configure(settings) {
    this.immichUrl = trimUrl(settings?.url);
    this.publicUrl = trimUrl(settings?.publicUrl);
    this.apiKey = String(settings?.apiKey ?? "").trim();
    const size = Number.parseInt(String(settings?.pageSize ?? ""), 10);
    this.pageSize = Number.isFinite(size) && size > 0 ? Math.min(size, 250) : 30;
    this.thumbSize = SIZES.includes(settings?.thumbSize) ? settings.thumbSize : "thumbnail";
  }

  async serveThumb(req) {
    const params = new URL(req.url).searchParams;
    const id = params.get("id") ?? "";
    const size = SIZES.includes(params.get("size")) ? params.get("size") : this.thumbSize;
    if (!ID_RE.test(id) || !validSig(id, params.get("sig"))) return new Response(null, { status: 403 });
    if (!this.immichUrl || !this.apiKey) return new Response(null, { status: 404 });
    try {
      const res = await fetch(buildThumbUrl(this.immichUrl, id, size), {
        headers: { "x-api-key": this.apiKey },
      });
      if (!res.ok) return new Response(null, { status: res.status === 404 ? 404 : 502 });
      const type = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
      if (!type.startsWith("image/")) return new Response(null, { status: 502 });
      return new Response(res.body, {
        status: 200,
        headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
      });
    } catch {
      return new Response(null, { status: 502 });
    }
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!this.immichUrl || !this.apiKey || !context?.routeUrl) return [];
    const doFetch = context.fetch ?? fetch;
    const { url, init } = buildSearchRequest(this.immichUrl, this.apiKey, query, page, this.pageSize);
    const response = await doFetch(url, init);
    context.sentinel?.(response, this.name);
    return parseAssets(await response.json(), {
      base: this.publicUrl || this.immichUrl,
      source: this.name,
      t: this.t,
      routeUrl: context.routeUrl,
    });
  }
}

export const type = "images";
