import { cseToken, dropToken } from "./token.js";
import { cseBody, cseResults } from "./parse.js";

export const description =
  "Google Custom Search Engine. Works over plain HTTP without a browser session, and can be pointed at your own CSE.";

const ELEMENT_URL = "https://cse.google.com/cse/element/v1";
const PUBLIC_CX = "partner-pub-8993703457585266:4862972284";
const PAGE_SIZE = 20;
const MAX_PAGE = 5;

const CATEGORY_WEB = "";
const CATEGORY_IMAGE = "image";

const SAFE_MAP = {
  off: "off",
  moderate: "medium",
  strict: "high",
};

const TIME_RANGE_DAYS = {
  hour: 1,
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

let _category = CATEGORY_WEB;

export const type = () => (_category === CATEGORY_IMAGE ? ["images"] : ["web"]);

const _stamp = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
};

const _rangeSort = (timeFilter, context) => {
  if (timeFilter === "custom") {
    const from = new Date(context?.dateFrom ?? "");
    const to = new Date(context?.dateTo ?? "");
    if (isNaN(from.getTime()) && isNaN(to.getTime())) return null;
    const start = isNaN(from.getTime()) ? new Date(0) : from;
    const end = isNaN(to.getTime()) ? new Date() : to;
    return `date:r:${_stamp(start)}:${_stamp(end)}`;
  }

  const days = TIME_RANGE_DAYS[timeFilter];
  if (!days) return null;

  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  return `date:r:${_stamp(start)}:${_stamp(end)}`;
};

export default class GoogleCseEngine {
  isClientExposed = false;
  name = "Google CSE";
  bangShortcut = "gcse";
  cx = PUBLIC_CX;
  category = CATEGORY_WEB;
  safeSearch = "off";
  settingsSchema = [
    {
      key: "outgoingTransport",
      label: "Outgoing HTTP client transport",
      type: "select",
      options: ["fetch", "curl", "curl-fallback"],
      default: "fetch",
      advanced: true,
    },
    {
      key: "cx",
      label: "Custom Search Engine ID (cx)",
      type: "text",
      default: PUBLIC_CX,
      placeholder: PUBLIC_CX,
      description:
        "The `cx` of the Google Programmable Search Engine to query. Create your own at [programmablesearchengine.google.com](https://programmablesearchengine.google.com/) and set it to search the entire web. The default is a shared public engine, so results are whatever that engine is configured to return.",
    },
    {
      key: "category",
      label: "Result category",
      type: "select",
      options: ["web", "image"],
      optionLabels: ["Web results", "Image results"],
      default: "web",
      description:
        "Image results only work if the configured search engine has image search enabled. Changing this moves the engine between the Web and Images tabs.",
    },
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "strict"],
      default: "off",
      description: "Filter explicit content from search results.",
    },
  ];

  configure(settings) {
    if (typeof settings.cx === "string" && settings.cx.trim())
      this.cx = settings.cx.trim();
    if (settings.category === "web" || settings.category === "image") {
      this.category =
        settings.category === "image" ? CATEGORY_IMAGE : CATEGORY_WEB;
      _category = this.category;
    }
    if (typeof settings.safeSearch === "string" && SAFE_MAP[settings.safeSearch])
      this.safeSearch = settings.safeSearch;
  }

  _buildUrl(query, page, timeFilter, token, context) {
    const params = new URLSearchParams({
      rsz: "filtered_cse",
      num: String(PAGE_SIZE),
      hl: context?.lang || "en",
      cselibv: token.libVersion,
      cx: this.cx,
      q: query,
      safe: SAFE_MAP[this.safeSearch] ?? "off",
      cse_tok: token.token,
      callback: "_",
      rurl: "",
      searchtype: this.category,
    });

    const sort = _rangeSort(timeFilter, context);
    if (sort) params.set("sort", sort);
    if (token.exp) params.set("exp", token.exp);

    const start = (Math.max(1, page) - 1) * PAGE_SIZE;
    if (start) params.set("start", String(start));

    return `${ELEMENT_URL}?${params.toString()}`;
  }

  async _request(url, context) {
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: {
        "User-Agent": context?.userAgent?.() || "Mozilla/5.0",
        Accept: "*/*",
        "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
        Referer: "https://cse.google.com/",
        Cookie: "CONSENT=YES+",
      },
      redirect: "follow",
    });

    context?.sentinel?.(response, this.name);
    return response.text();
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (page > MAX_PAGE) return [];

    const token = await cseToken(this.cx, context);
    if (!token) {
      throw this._fail(
        "unavailable",
        `${this.name} could not obtain a CSE token`,
        context,
      );
    }

    const url = this._buildUrl(query, page, timeFilter, token, context);
    const data = cseBody(await this._request(url, context));

    if (!data) {
      throw this._fail(
        "parse-error",
        `${this.name} returned an unreadable response`,
        context,
      );
    }

    if (data.error) {
      dropToken(this.cx);
      const message = data.error.message || "unknown error";
      const rateLimited = data.error.code === 429;
      throw this._fail(
        rateLimited ? "rate-limited" : "upstream-error",
        `${this.name}: ${message}`,
        context,
        data.error.code,
      );
    }

    return cseResults(data, this.category, this.name);
  }

  _fail(status, message, context, httpStatus) {
    if (context?.engineError) {
      return context.engineError(status, message, {
        engine: this.name,
        ...(typeof httpStatus === "number" ? { httpStatus } : {}),
      });
    }
    return new Error(message);
  }
}
