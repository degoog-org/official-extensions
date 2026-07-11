const QR_API = "https://api.qrserver.com/v1/create-qr-code/";
const SIZE = 256;

let _apiBase = "";
let _fetch = fetch;

const _esc = (s) => {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const _extractUrl = (args) => {
  const t = args.trim();
  const urlMatch = t.match(/https?:\/\/[^\s]+/);
  if (urlMatch) return urlMatch[0].replace(/[.,;:!?)]+$/, "");
  if (/^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(t)) return `https://${t}`;
  return t ? `https://${t}` : "";
};

const _validUrl = (url) => {
  try {
    const p = new URL(url);
    return ["http:", "https:"].includes(p.protocol);
  } catch {
    return false;
  }
};

export default {
  isClientExposed: false,
  name: "QR Code",
  description: "Generate a QR code for a URL.",
  trigger: "qr",
  aliases: ["qrcode"],
  naturalLanguagePhrases: ["qr code for", "qrcode for", "generate qr for"],

  settingsSchema: [],

  init(ctx) {
    _apiBase = ctx.apiBase;
    _fetch = ctx.fetch ?? fetch;
  },

  execute(args) {
    const raw = args.trim();
    if (!raw) {
      return {
        title: "QR Code",
        html: `<div class="command-result"><p>Usage: <code>!qr &lt;url&gt;</code></p><p>Example: <code>!qr https://example.com</code> or &quot;qr code for https://example.com&quot;</p></div>`,
      };
    }
    const url = _extractUrl(raw);
    if (!_validUrl(url)) {
      return {
        title: "QR Code",
        html: `<div class="command-result"><p>Usage: <code>!qr &lt;url&gt;</code></p><p>Example: <code>!qr https://example.com</code></p></div>`,
      };
    }
    const imgUrl = `${_apiBase}/qr?url=${encodeURIComponent(url)}`;
    return {
      title: "QR Code",
      html: `<div class="command-result qr-result"><p class="qr-label">${_esc(url)}</p><img src="${_esc(imgUrl)}" alt="QR code" class="qr-image" width="${SIZE}" height="${SIZE}"></div>`,
    };
  },
};

export const routes = [
  {
    method: "get",
    path: "/qr",
    handler: async (req) => {
      const urlParam = new URL(req.url).searchParams.get("url") ?? "";
      if (!_validUrl(urlParam)) {
        return new Response("Invalid URL", { status: 400 });
      }
      const apiUrl = `${QR_API}?size=${SIZE}x${SIZE}&data=${encodeURIComponent(urlParam)}`;
      const res = await _fetch(apiUrl);
      if (!res.ok) return new Response("QR fetch failed", { status: 502 });
      return new Response(res.body, {
        status: 200,
        headers: {
          "Content-Type": res.headers.get("Content-Type") ?? "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    },
  },
];
