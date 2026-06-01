import * as cheerio from "cheerio";

const GSA_SAMSUNG_MODELS = [
  "S8500",
  "S5230",
  "S8530",
  "S8300",
  "I8910",
  "S7350",
  "B7300",
  "S5600",
  "S8000",
  "S5330",
  "C3510",
  "S5250",
  "S7220",
  "S5560",
  "B3410",
  "S5620",
  "S3310",
  "S3370",
  "S3650",
  "S5233",
  "S5260",
  "S5300",
  "S5360",
  "S5380",
  "S5570",
  "S5660",
  "S5670",
  "S5830",
  "S6500",
  "S7070",
  "S7230",
  "S7550",
  "S7560",
  "S8600",
  "B2100",
  "B2700",
  "B3210",
  "B3310",
  "B5310",
  "B7320",
  "B7722",
  "C3011",
  "C3050",
  "C3212",
  "C3300",
  "C3312",
  "C3520",
  "C3530",
  "C3780",
  "C5220",
  "C5510",
  "C6112",
  "C6712",
];
const GSA_REGIONS = ["XE", "XX", "JF", "XP", "DD", "DV", "XI"];
const GSA_DOLFIN = ["1.5", "2.0", "2.2", "3.0"];
const GSA_SAMSUNG_BROWSERS = ["Dolfin", "Jasmine"];
const GSA_LETTERS = "ABCDEFGHJKL";
const GSA_DIGITS = "0123456789";
const GO_APP_MARKER = "NSTNWV";

const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _randInt = (min, max) =>
  min + Math.floor(Math.random() * (max - min + 1));
const _randChars = (n, alphabet) =>
  Array.from({ length: n }, () => _pick(alphabet.split(""))).join("");

const _gsaAgent = () => {
  const model = _pick(GSA_SAMSUNG_MODELS);
  const firmware = `${model}${_pick(GSA_REGIONS)}${_randChars(2, GSA_LETTERS)}${_randChars(1, GSA_DIGITS)}`;
  const browser = _pick(GSA_SAMSUNG_BROWSERS);
  const browserVer = browser === "Dolfin" ? _pick(GSA_DOLFIN) : "1.0";
  const engine = browser === "Dolfin" ? "Nextreaming" : "Qtv/5.3";
  return `SAMSUNG-GT-${model}/${firmware} SHP/VPP/R5 ${browser}/${browserVer} ${engine} SMM-MMS/1.2.0 profile/MIDP-2.1 configuration/CLDC-1.1 ${GO_APP_MARKER}`;
};

const TBS_MAP = {
  hour: "qdr:h",
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
};

const _resolveTbs = (timeFilter) => {
  if (!timeFilter || timeFilter === "any" || timeFilter === "custom")
    return null;
  return TBS_MAP[timeFilter] ?? null;
};

const _resolveCustomTbs = (dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) return null;
  const parts = ["cdr:1"];
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime()))
      parts.push(
        `cd_min:${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`,
      );
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime()))
      parts.push(
        `cd_max:${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`,
      );
  }
  return parts.length > 1 ? parts.join(",") : null;
};

const _resolveHref = (href) => {
  if (!href.startsWith("/url?")) return href;
  try {
    const parsed = new URL(href, "https://www.google.com");
    return (
      parsed.searchParams.get("q") || parsed.searchParams.get("url") || href
    );
  } catch {
    return href;
  }
};

const MUTANT_SIGNATURES = [
  "/httpservice/retry/enablejs",
  'Please click <a href="/httpservice',
  "unusual traffic from your computer network",
  "/sorry/index?continue=",
];

const _isInterstitial = (html) => {
  const head = html.slice(0, 4000);
  return MUTANT_SIGNATURES.some((m) => head.includes(m));
};

export default class GoogleEngine {
  isClientExposed = false;
  name = "Google";
  bangShortcut = "g";
  safeSearch = "off";
  minDegoogVersion = "0.19.0";
  settingsSchema = [
    {
      key: "outgoingTransport",
      label: "Outgoing HTTP client transport",
      type: "select",
      options: ["fetch", "curl", "curl-fallback"],
      default: "curl",
      advanced: true,
    },
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "on"],
      description: "Filter explicit content from search results.",
    },
  ];

  configure(settings) {
    if (typeof settings.safeSearch === "string")
      this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const start = (page - 1) * 10;
    const lang = context?.lang || "en";
    const params = new URLSearchParams({
      q: query,
      hl: lang,
      lr: `lang_${lang}`,
      ie: "utf8",
      oe: "utf8",
      start: String(start),
      filter: "0",
    });

    const tbs =
      timeFilter === "custom"
        ? _resolveCustomTbs(context?.dateFrom, context?.dateTo)
        : _resolveTbs(timeFilter);
    if (tbs) params.set("tbs", tbs);
    if (this.safeSearch === "on") params.set("safe", "active");

    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(
      `https://www.google.com/search?${params.toString()}`,
      {
        headers: {
          "User-Agent": _gsaAgent(),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language":
            context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
          Cookie: "CONSENT=YES+",
        },
        redirect: "follow",
      },
    );

    context?.sentinel?.(response, this.name);
    const html = await response.text();

    if (_isInterstitial(html)) {
      if (context?.engineError) {
        throw context.engineError(
          "interstitial",
          `${this.name} returned a JavaScript/consent interstitial`,
          { engine: this.name },
        );
      }
      throw new Error(
        `${this.name} returned a JavaScript/consent interstitial`,
      );
    }

    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();

    const pushResult = (title, href, snippet) => {
      const url = _resolveHref(href);
      if (
        title &&
        url &&
        url.startsWith("http") &&
        !url.includes("google.com/search")
      ) {
        results.push({ title, url, snippet, source: this.name });
        return true;
      }
      return false;
    };

    $('a[href^="/url?q="]').each((_, el) => {
      const linkEl = $(el);
      const title =
        linkEl.find("h3").first().text().trim() ||
        linkEl.find("span").first().text().trim();
      const href = linkEl.attr("href") || "";
      const hveidBlock = linkEl.closest("[data-hveid]");
      const snippet =
        hveidBlock.find("[data-sncf]").first().text().trim() ||
        hveidBlock.find("div").last().text().trim() ||
        linkEl.parent().next("div").text().trim();
      const dedupKey = href.split("&")[0];
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);
      pushResult(title, href, snippet);
    });

    if (results.length === 0) {
      $("[data-hveid] a[href]").each((_, el) => {
        const linkEl = $(el);
        const title =
          linkEl.find("h3").first().text().trim() ||
          linkEl
            .closest("[data-hveid]")
            .find("[role='link']")
            .first()
            .text()
            .trim() ||
          linkEl.find("span").first().text().trim();
        const href = linkEl.attr("href") || "";
        const snippet = linkEl
          .closest("[data-hveid]")
          .find("[data-sncf]")
          .first()
          .text()
          .trim();
        pushResult(title, href, snippet);
      });
    }

    return results;
  }
}
