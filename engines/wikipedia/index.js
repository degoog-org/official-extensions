const WIKI_HEADERS = {
  "User-Agent": "degoog/1.0 (+https://github.com/degoog-org/degoog)",
  "Api-User-Agent": "degoog/1.0 (+https://github.com/degoog-org/degoog)",
};

const LANG_RE = /^[a-z]{2,3}$/;

const SPECIAL_WIKIS = new Set(["simple"]);

const _normalizeLang = (lang) => {
  if (!lang) return "en";
  const lower = lang.toLowerCase();
  if (SPECIAL_WIKIS.has(lower)) return lower;
  const primary = lower.split("-")[0];
  if (LANG_RE.test(primary)) return primary;
  return "en";
};

const _wikiHost = (lang) => `${_normalizeLang(lang)}.wikipedia.org`;

export default class WikipediaEngine {
  isClientExposed = false;
  name = "Wikipedia";
  bangShortcut = "w";

  async executeSearch(query, page, _timeFilter, context) {
    const q = query.trim();
    if (!q) return [];
    const offset = ((page || 1) - 1) * 15;
    const host = _wikiHost(context?.lang);
    const url = `https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=15&sroffset=${offset}&utf8=1`;
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, { headers: WIKI_HEADERS });
    context?.sentinel?.(response, this.name);

    let data;
    try { data = await response.json(); } catch { return []; }
    if (data?.error) return [];
    const items = data?.query?.search;
    if (!Array.isArray(items)) return [];

    return items.map((item) => ({
      title: item.title,
      url: `https://${host}/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
      snippet: (item.snippet ?? "").replace(/<[^>]+>/g, "").trim(),
      source: this.name,
    }));
  }
}
