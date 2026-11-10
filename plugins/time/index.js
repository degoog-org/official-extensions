const TZ_MAP = {
  tokyo: "Asia/Tokyo",
  japan: "Asia/Tokyo",
  london: "Europe/London",
  uk: "Europe/London",
  "new york": "America/New_York",
  nyc: "America/New_York",
  "los angeles": "America/Los_Angeles",
  la: "America/Los_Angeles",
  chicago: "America/Chicago",
  paris: "Europe/Paris",
  berlin: "Europe/Berlin",
  sydney: "Australia/Sydney",
  dubai: "Asia/Dubai",
  singapore: "Asia/Singapore",
  mumbai: "Asia/Kolkata",
  india: "Asia/Kolkata",
  "hong kong": "Asia/Hong_Kong",
  beijing: "Asia/Shanghai",
  shanghai: "Asia/Shanghai",
  utc: "UTC",
  gmt: "UTC",
};

const _esc = (s) => {
  if (typeof s !== "string") return "";

  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const GEOCODE_TTL_MS = 12 * 60 * 60 * 1000;
const GEOCODE_MISS_TTL_MS = 60 * 60 * 1000;
const MAX_PLACE_LENGTH = 100;

let _fetch = (url, init) => fetch(url, init);
let _places = null;

const _canonicalZone = (tz) => {
  if (typeof tz !== "string" || !tz) return null;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
};

const _resolveTimeZone = (input) => {
  const key = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (TZ_MAP[key]) return TZ_MAP[key];

  return _canonicalZone(key.replace(/\s+/g, "_"));
};

const _lang = (locale) => {
  const lang = String(locale || "").split("-")[0].toLowerCase();

  return /^[a-z]{2,3}$/.test(lang) ? lang : "en";
};

const _geocode = async (place, lang) => {
  const key = `${lang}:${place.toLowerCase().replace(/\s+/g, " ")}`;
  const cached = _places ? await _places.get(key) : null;
  if (cached) return cached.tz ? cached : null;

  const url = `${GEOCODE_URL}?name=${encodeURIComponent(place)}&count=1&language=${lang}&format=json`;
  const res = await _fetch(url);
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const data = await res.json();
  const hit = Array.isArray(data?.results) ? data.results[0] : null;
  const tz = (hit && _canonicalZone(hit.timezone)) || "";
  const label = tz ? [...new Set([hit.name, hit.admin1, hit.country].filter(Boolean))].join(", ") : "";
  const entry = { tz, label };
  if (_places) await _places.set(key, entry, tz ? GEOCODE_TTL_MS : GEOCODE_MISS_TTL_MS);

  return tz ? entry : null;
};

const _message = (title, key, place) => ({
  title,
  html: `<div class="command-result"><p>{{ t:time-command.errors.${key} }} <strong>${_esc(place)}</strong></p></div>`,
});

export default {
  isClientExposed: false,
  name: "Time",
  description: "Show current time in a timezone or city. Places it does not know are looked up with Open-Meteo geocoding.",
  trigger: "time",
  aliases: ["tz", "clock"],
  naturalLanguagePhrases: ["what time is it in", "time in", "current time in", "what's the time in"],

  respectRateLimiting: true,

  settingsSchema: [],

  init(ctx) {
    if (typeof ctx?.fetch === "function") _fetch = ctx.fetch;
    if (typeof ctx?.useCache === "function") {
      _places = ctx.useCache(`ext:${ctx.pluginId || "time"}:places`, GEOCODE_TTL_MS);
    }
  },

  async execute(args, context) {
    const title = this.t?.("time-command.title", undefined, context?.locale) ?? "Time";
    const place = args.trim().replace(/[?.,!]+$/, "").trim();
    if (!place) {
      return {
        title,
        html: `<div class="command-result"><p>{{ t:time-command.usage.label }} <code>!time &lt;city or timezone&gt;</code></p><p>{{ t:time-command.usage.examples }} <code>!time Tokyo</code>, <code>!time America/New_York</code></p></div>`,
      };
    }
    let tz = _resolveTimeZone(place);
    let placeLabel = "";
    if (!tz) {
      if (place.length > MAX_PLACE_LENGTH) return _message(title, "unknown", place);
      try {
        const found = await _geocode(place, _lang(context?.locale));
        if (!found) return _message(title, "unknown", place);
        tz = found.tz;
        placeLabel = found.label;
      } catch {
        return _message(title, "lookupFailed", place);
      }
    }
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const dateStr = now.toLocaleDateString("en-GB", {
      timeZone: tz,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const zoneLabel = tz.replace(/_/g, " ");
    const label = placeLabel || zoneLabel;
    const zoneLine = placeLabel ? `<p class="time-zone">${_esc(zoneLabel)}</p>` : "";
    const html = `<div class="command-result time-result"><h3 class="time-place">${_esc(label)}</h3><p class="time-time">${_esc(timeStr)}</p><p class="time-date">${_esc(dateStr)}</p>${zoneLine}</div>`;
    return { title: `${title}: ${label}`, html };
  },
};
