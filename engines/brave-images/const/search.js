export const FALLBACK_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

export const BASE_URL = "https://search.brave.com/images";

export const RESULT_RE =
  /title:"((?:[^"\\]|\\.)*)",url:"((?:[^"\\]|\\.)*)"[\s\S]*?source:"((?:[^"\\]|\\.)*)"[\s\S]*?thumbnail:\{src:"((?:[^"\\]|\\.)*)"[\s\S]*?original:"((?:[^"\\]|\\.)*)"/g;
