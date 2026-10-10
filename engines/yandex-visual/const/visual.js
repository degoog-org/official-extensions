export const ID = "yandex-visual-engine";
export const NAME = "Yandex Visual Search";
export const FALLBACK_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
export const DESCRIPTION =
  "Yandex Visual Search allows you to search for images by uploading an image or by typing a description of the image you are looking for. Please read the privacy note above the configuration options before using it.";
export const DOMAINS = ["yandex.com", "yandex.ru", "yandex.com.tr", "yandex.kz"];
export const UPLOAD_BLOCKS = JSON.stringify({
  blocks: [{ block: "b-page_type_search-by-image__link" }],
});
export const CAPTCHA_RE = /showcaptcha|smartcaptcha/i;
export const MAX_TEXT = 200;

export const Include = Object.freeze({
  Both: "both",
  Pages: "pages",
  Similar: "similar",
});

export const INCLUDE_LABELS = {
  [Include.Both]: "Pages and similar images",
  [Include.Pages]: "Pages that contain the image",
  [Include.Similar]: "Similar images",
};
