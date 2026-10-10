import { buildSettingsSchema } from "./settings.js";
import {
  CAPTCHA_RE,
  DESCRIPTION,
  DOMAINS,
  Include,
  NAME,
} from "./const/visual.js";
import { buildHeaders, buildResultsUrl, buildUpload } from "./request.js";
import { initialState, parseCbirId, parseResults } from "./parse.js";

export default class YandexVisualEngine {
  name = NAME;
  domain = DOMAINS[0];
  include = Include.Both;
  description = DESCRIPTION;

  get settingsSchema() {
    return buildSettingsSchema(this.t);
  }

  configure(settings) {
    if (DOMAINS.includes(settings?.domain)) this.domain = settings.domain;
    if (Object.values(Include).includes(settings?.include))
      this.include = settings.include;
  }

  _blocked(context, where) {
    return (
      context?.engineError?.(
        "captcha",
        `${NAME} asked for a captcha ${where}`,
        {
          engine: NAME,
        },
      ) ?? new Error(`${NAME} asked for a captcha ${where}`)
    );
  }

  async _upload(image, context) {
    const host = `https://${this.domain}`;
    const { url, body, type } = buildUpload(host, image);
    const res = await context.fetch(url, {
      method: "POST",
      headers: buildHeaders(this.domain, context, {
        Accept: "application/json",
        "Content-Type": type,
      }),
      body,
    });
    context.sentinel?.(res, NAME);
    const text = await res.text();
    if (CAPTCHA_RE.test(res.url ?? "") || CAPTCHA_RE.test(text))
      throw this._blocked(context, "on upload");
    const cbirId = parseCbirId(text);
    if (!cbirId) throw new Error(`${NAME} didn't accept the image`);
    return cbirId;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const image = context?.image;
    if (!image || page > 1) return [];
    const host = `https://${this.domain}`;
    const cbirId = await this._upload(image, context);
    const res = await context.fetch(buildResultsUrl(host, cbirId, this.include, query), {
      headers: buildHeaders(this.domain, context, {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }),
      redirect: "follow",
    });
    context.sentinel?.(res, NAME);
    const html = await res.text();
    const state = initialState(html);
    if (!state) {
      if (CAPTCHA_RE.test(res.url ?? "") || CAPTCHA_RE.test(html))
        throw this._blocked(context, "on the results page");
      throw new Error(`${NAME} changed its results page`);
    }
    return parseResults(state, host, this.include);
  }
}

export const type = "images";
export const input = "image";
