const _excerpt = (text) => (text ? text.substring(0, 250) + "..." : "");

const _communities = (data, baseUrl, source) =>
  (Array.isArray(data.communities) ? data.communities : [])
    .map((item) => item.community)
    .filter(Boolean)
    .map((comm) => ({
      title: comm.title || comm.name || "",
      url: comm.actor_id || `${baseUrl}/c/${comm.name}`,
      snippet: _excerpt(comm.description),
      source,
      thumbnail: comm.icon || "",
    }));

const _posts = (data, baseUrl, source) =>
  (Array.isArray(data.posts) ? data.posts : [])
    .map((item) => item.post)
    .filter(Boolean)
    .map((post) => ({
      title: post.name || post.title || "",
      url: post.ap_id || `${baseUrl}/post/${post.id}`,
      snippet: _excerpt(post.body),
      source,
      thumbnail: post.thumbnail_url || "",
    }));

const _comments = (data, baseUrl, source) =>
  (Array.isArray(data.comments) ? data.comments : [])
    .filter((item) => item.comment)
    .map((item) => {
      const { comment } = item;
      const post = item.post || {};
      const creator = item.creator || {};
      return {
        title: `Comment on ${post.name || post.title || "a post"} by ${creator.name || "someone"}`,
        url: comment.ap_id || `${baseUrl}/comment/${comment.id}`,
        snippet: _excerpt(comment.content),
        source,
        thumbnail: creator.avatar || "",
      };
    });

export const parseSearch = (data, baseUrl, source) => [
  ..._communities(data, baseUrl, source),
  ..._posts(data, baseUrl, source),
  ..._comments(data, baseUrl, source),
];
