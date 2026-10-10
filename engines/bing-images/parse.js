export const parseResults = ($, name) => {
  const results = [];

  $("a.iusc").each((_, el) => {
    const meta = $(el).attr("m") || "";
    try {
      const data = JSON.parse(meta);
      if (data.murl && data.turl) {
        results.push({
          title: data.t || data.desc || "",
          url: data.purl || data.murl,
          snippet: data.desc || "",
          source: name,
          thumbnail: data.turl,
          imageUrl: data.murl,
        });
      }
    } catch { }
  });

  if (results.length === 0) {
    $("a.thumb").each((_, el) => {
      const href = $(el).attr("href") || "";
      const img = $(el).find("img");
      const thumbnail = img.attr("src") || img.attr("data-src") || "";
      const title = img.attr("alt") || "";
      if (thumbnail && title) {
        results.push({
          title,
          url: href.startsWith("http") ? href : `https://www.bing.com${href}`,
          snippet: "",
          source: name,
          thumbnail,
        });
      }
    });
  }

  return results;
};
