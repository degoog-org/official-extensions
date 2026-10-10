import { cseToken, dropToken } from "./token.js";
import { cseBody, cseResults } from "./parse.js";
import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildSearchUrl } from "./request.js";
import {
  CATEGORY_IMAGE,
  CATEGORY_WEB,
  MAX_PAGE,
  PUBLIC_CX,
  SAFE_MAP,
} from "./const/cse.js";

export { regions } from "./const/regions.js";

export const description = "";

let _category = CATEGORY_WEB;

export const type = () => (_category === CATEGORY_IMAGE ? ["images"] : ["web"]);

export default class GoogleCseEngine {
  isClientExposed = false;
  name = "Google CSE";
  bangShortcut = "gcse";
  cx = PUBLIC_CX;
  category = CATEGORY_WEB;
  safeSearch = "off";
  settingsSchema = SETTINGS_SCHEMA;

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

  async _request(url, context) {
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: buildHeaders(context),
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

    const url = buildSearchUrl(
      {
        query,
        page,
        timeFilter,
        token,
        cx: this.cx,
        category: this.category,
        safeSearch: this.safeSearch,
      },
      context,
    );
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
