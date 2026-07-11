export function parseGoogleImagesJson(text, sourceName) {
  const body = String(text ?? "");
  const jsonStart = body.indexOf('{"ischj":');
  if (jsonStart < 0) return [];

  try {
    const data = JSON.parse(body.substring(jsonStart));
    const metadata = data.ischj?.metadata || [];
    const results = [];

    for (const item of metadata) {
      const title = item.result?.page_title?.replace(/<[^>]+>/g, "") || "";
      const url = item.result?.referrer_url || "";
      const thumbnail = item.thumbnail?.url || "";
      if (title && url) {
        results.push({
          title,
          url,
          snippet: item.result?.site_title || "",
          source: sourceName,
          thumbnail,
          imageUrl: item.original_image?.url || thumbnail,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}
