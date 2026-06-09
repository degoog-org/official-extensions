const DEFAULT_INSTANCE = "https://lemmy.world";
const SEARCH_LIMIT = 20;

const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const _normalizeInstance = (value) => {
    const trimmed = (value || "").trim().replace(/\/+$/, "");
    if (!trimmed) return DEFAULT_INSTANCE;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export default class LemmyEngine {
    isClientExposed = false;
    name = "Lemmy";
    bangShortcut = "lemmy";

    settingsSchema = [
        {
            key: "instanceUrl",
            label: "Instance URL",
            type: "url",
            placeholder: "https://lemmy.world",
            description: "Custom Lemmy instance to query. Leave blank to use lemmy.world",
            default: "https://lemmy.world"
        },
        {
            key: "searchType",
            label: "Search Type",
            type: "select",
            options: ["All", "Posts", "Comments", "Communities"],
            description: "Select what content to search across Lemmy.world",
            default: "All"
        },
        {
            key: "sort",
            label: "Sort",
            type: "select",
            options: ["New", "Hot", "Old", "TopDay", "TopWeek", "TopMonth", "TopYear", "TopAll", "MostComments", "NewComments", "TopHour", "TopSixHour", "TopTwelveHour", "TopThreeMonths", "TopSixMonths", "TopNineMonths", "Controversial", "Scaled"],
            description: "Select the sort order for the search results",
            default: "New"
        },
        {
            key: "showNSFW",
            label: "Show NSFW Content",
            type: "toggle",
            description: "Show NSFW content in the search results",
            default: false
        }
    ];

    searchType = "All"

    configure(settings) {
        this.instanceUrl = _normalizeInstance(settings.instanceUrl);
        this.searchType = settings.searchType || "All";
        this.sort = settings.sort || "New";
        this.showNSFW = settings.showNSFW || false;
    }

    async executeSearch(query, page = 1, _timeFilter, context) {
        const params = new URLSearchParams({
            q: query,
            type_: this.searchType,
            sort: this.sort,
            page: String(page),
            limit: String(SEARCH_LIMIT),
            show_nsfw: this.showNSFW ? "true" : "false",
        });

        const baseUrl = this.instanceUrl || DEFAULT_INSTANCE;
        const url = `${baseUrl}/api/v3/search?${params.toString()}`;
        const doFetch = context?.fetch ?? fetch;

        try {
            const response = await doFetch(url, {
                headers: {
                    "accept": "application/json",
                    "User-Agent": context?.userAgent?.() ?? FALLBACK_UA
                },
                method: "GET",
            });

            context?.sentinel?.(response, this.name);
            const data = await response.json();
            const results = [];

            if (data.communities && Array.isArray(data.communities)) {
                for (const item of data.communities) {
                    const comm = item.community;
                    if (!comm) continue;
                    results.push({
                        title: comm.title || comm.name || "",
                        url: comm.actor_id || `${baseUrl}/c/${comm.name}`,
                        snippet: comm.description ? comm.description.substring(0, 250) + "..." : "",
                        source: this.name,
                        thumbnail: comm.icon || "",
                    });
                }
            }

            if (data.posts && Array.isArray(data.posts)) {
                for (const item of data.posts) {
                    const post = item.post;
                    if (!post) continue;
                    results.push({
                        title: post.name || post.title || "",
                        url: post.ap_id || `${baseUrl}/post/${post.id}`,
                        snippet: post.body ? post.body.substring(0, 250) + "..." : "",
                        source: this.name,
                        thumbnail: post.thumbnail_url || "",
                    });
                }
            }

            if (data.comments && Array.isArray(data.comments)) {
                for (const item of data.comments) {
                    const comment = item.comment;
                    const post = item.post || {};
                    const creator = item.creator || {};
                    if (!comment) continue;
                    results.push({
                        title: `Comment on ${post.name || post.title || "a post"} by ${creator.name || "someone"}`,
                        url: comment.ap_id || `${baseUrl}/comment/${comment.id}`,
                        snippet: comment.content ? comment.content.substring(0, 250) + "..." : "",
                        source: this.name,
                        thumbnail: creator.avatar || "",
                    });
                }
            }

            return results;
        } catch (e) {
            if (e?.name === "SentinelBreach") throw e;
            return [];
        }
    }
}