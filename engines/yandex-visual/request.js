import { FALLBACK_UA, Include, MAX_TEXT, UPLOAD_BLOCKS } from "./const/visual.js";

const _extension = (mime) =>
  ({ "image/png": "png", "image/webp": "webp" })[mime] ?? "jpg";

const _multipart = (field, filename, mime, bytes) => {
  const boundary = `----degoog${crypto.randomUUID().replaceAll("-", "")}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return { body, type: `multipart/form-data; boundary=${boundary}` };
};

export const buildHeaders = (domain, context, extra = {}) => ({
  "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
  "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
  Referer: `https://${domain}/images/`,
  ...extra,
});

export const buildUpload = (host, image) => {
  const { body, type } = _multipart(
    "upfile",
    `image.${_extension(image.mime)}`,
    image.mime,
    image.bytes,
  );
  return {
    url: `${host}/images/search?rpt=imageview&format=json&request=${encodeURIComponent(UPLOAD_BLOCKS)}`,
    body,
    type,
  };
};

export const buildResultsUrl = (host, cbirId, include, query) => {
  const params = new URLSearchParams({
    rpt: "imageview",
    cbir_id: cbirId,
    cbir_page: include === Include.Similar ? "similar" : "sites",
  });
  const text = String(query ?? "")
    .trim()
    .slice(0, MAX_TEXT);
  if (text) params.set("text", text);
  return `${host}/images/search?${params}`;
};
