import { LANG_RE, PAGE_SIZE, SPECIAL_WIKIS } from "./const/wiki.js";

const _normalizeLang = (lang) => {
  if (!lang) return "en";
  const lower = lang.toLowerCase();
  if (SPECIAL_WIKIS.has(lower)) return lower;
  const primary = lower.split("-")[0];
  if (LANG_RE.test(primary)) return primary;
  return "en";
};

export const wikiHost = (lang) => `${_normalizeLang(lang)}.wikipedia.org`;

export const buildUrl = (host, query, page) => {
  const offset = ((page || 1) - 1) * PAGE_SIZE;
  return `https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${PAGE_SIZE}&sroffset=${offset}&utf8=1`;
};
