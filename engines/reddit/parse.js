const _decodeEntities = (str) =>
  str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");

const _stripTags = (html) =>
  html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const _parseEntries = (xml) => {
  const entries = [];
  const rx = /<entry>([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = rx.exec(xml)) !== null) entries.push(m[1]);
  return entries;
};

const _tag = (name, block) => {
  const m = block.match(
    new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`, "i"),
  );
  return m ? m[1].trim() : "";
};

const _atomLink = (block) => {
  const m = block.match(/<link[^>]+href="([^"]+)"/i);
  return m ? m[1].trim() : "";
};

export const parseFeed = (xml, source) => {
  const results = [];

  for (const entry of _parseEntries(xml)) {
    const title = _decodeEntities(_tag("title", entry));
    const link = _atomLink(entry);
    const content = _stripTags(_decodeEntities(_tag("content", entry)));
    const category = _decodeEntities(_tag("category", entry));

    if (!title || !link) continue;

    results.push({
      title,
      url: link,
      snippet: content.substring(0, 200) || category,
      source,
    });
  }

  return results;
};
