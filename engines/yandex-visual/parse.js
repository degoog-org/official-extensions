import * as cheerio from "cheerio";
import { Include, NAME } from "./const/visual.js";

const _abs = (url, host) => {
  if (typeof url !== "string" || !url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${host}${url}`;
  return url;
};

export const parseCbirId = (text) => {
  try {
    return JSON.parse(text)?.blocks?.[0]?.params?.cbirId ?? "";
  } catch {
    return "";
  }
};

export const initialState = (html) => {
  const $ = cheerio.load(html);
  let found = null;
  $("[data-state]").each((_, el) => {
    if (found) return;
    const raw = $(el).attr("data-state") ?? "";
    if (!raw.includes("cbirSites") && !raw.includes("cbirSimilar")) return;
    try {
      found = JSON.parse(raw).initialState ?? null;
    } catch {}
  });
  return found;
};

const _pages = (state, host) =>
  (state?.cbirSites?.sites ?? [])
    .filter(
      (site) => typeof site?.url === "string" && site.url.startsWith("http"),
    )
    .map((site) => ({
      title: site.title || site.domain || "",
      url: site.url,
      snippet: site.description || "",
      source: NAME,
      thumbnail:
        _abs(site.thumb?.url, host) || _abs(site.originalImage?.url, host),
      imageUrl: _abs(site.originalImage?.url, host) || undefined,
    }));

const _imgUrlOf = (link) => {
  try {
    return (
      new URL(link, "https://yandex.com").searchParams.get("img_url") ?? ""
    );
  } catch {
    return "";
  }
};

const _similar = (state, host) =>
  (state?.cbirSimilar?.thumbs ?? [])
    .filter((thumb) => typeof thumb?.imageUrl === "string")
    .map((thumb) => {
      const original = _imgUrlOf(thumb.linkUrl);
      return {
        title: thumb.title || "",
        url: original || _abs(thumb.linkUrl, host),
        snippet: "",
        source: NAME,
        thumbnail: _abs(thumb.imageUrl, host),
        imageUrl: original || undefined,
      };
    });

export const parseResults = (state, host, include) => {
  const results = [
    ...(include === Include.Similar ? [] : _pages(state, host)),
    ...(include === Include.Pages ? [] : _similar(state, host)),
  ];
  const seen = new Set();
  return results.filter((r) => {
    if (!r.thumbnail || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
};
