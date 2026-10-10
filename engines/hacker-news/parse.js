export const parseHits = (data, source) =>
  (data?.hits ?? [])
    .map((hit) => {
      const hnLink = `https://news.ycombinator.com/item?id=${hit.objectID}`;
      const url = hit.url || hnLink;
      const points = typeof hit.points === "number" ? hit.points : 0;
      const comments = typeof hit.num_comments === "number" ? hit.num_comments : 0;
      const author = hit.author ? `by ${hit.author}` : "";
      const snippet = [
        `${points} points`,
        `${comments} comments`,
        author,
        `Discussion: ${hnLink}`,
      ]
        .filter(Boolean)
        .join(" • ");
      return {
        title: hit.title ?? hit.story_title ?? "",
        url,
        snippet,
        source,
      };
    })
    .filter((r) => r.title && r.url);
