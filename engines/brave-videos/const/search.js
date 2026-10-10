export const FALLBACK_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

export const BASE_URL = "https://search.brave.com/videos";

export const RESULT_RE =
  /title:"((?:[^"\\]|\\.)*)",url:"((?:[^"\\]|\\.)*)",[\s\S]{0,400}?description:(?:"((?:[^"\\]|\\.)*)"|null)[\s\S]{0,400}?type:"video_result",video:\{duration:(?:"([^"]*)"|null)[\s\S]{0,600}?thumbnail:\{src:"((?:[^"\\]|\\.)*)"/g;
