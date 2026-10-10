let defaultCity = "";
let useFahrenheit = false;
let template = "";

const WEATHER_CODES = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle",
  56: "Freezing Drizzle", 57: "Freezing Drizzle", 61: "Rain", 63: "Rain",
  65: "Heavy Rain", 66: "Freezing Rain", 67: "Freezing Rain",
  71: "Snow", 73: "Snow", 75: "Heavy Snow", 77: "Snow Grains",
  80: "Rain Showers", 81: "Rain Showers", 82: "Heavy Rain Showers",
  85: "Snow Showers", 86: "Heavy Snow Showers", 95: "Thunderstorm",
  96: "Thunderstorm with Hail", 99: "Thunderstorm with Hail"
};

const WIND_DIRECTIONS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

const _weatherIcon = (code) => {
  if (code == null) return "fa-cloud";
  const c = Number(code);
  if (c <= 1) return "fa-sun";
  if (c === 2) return "fa-cloud";
  if (c === 3 || c === 45 || c === 48) return "fa-cloud";
  if (c >= 51 && c <= 57) return "fa-droplet";
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return "fa-cloud-rain";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "fa-snowflake";
  if (c >= 95) return "fa-cloud-bolt";

  return "fa-cloud";
};

const _windDirection = (deg) => {
  if (deg == null || isNaN(deg)) return "";
  const i = Math.round(((deg % 360) / 22.5)) % 16;

  return WIND_DIRECTIONS[i];
};

const _formatDay = (dateStr) => {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
};

const _formatTime = (isoStr) => {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false });
};  

const _render = (data) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");
};

export default {
  isClientExposed: false,
  name: "Weather",
  description: "Shows weather information using Open-Meteo",
  trigger: "weather",
  aliases: ["wttr", "forecast"],
  naturalLanguagePhrases: ["what's the weather", "weather for", "weather"],

  settingsSchema: [
    {
      key: "defaultCity",
      label: "Default City",
      type: "text",
      placeholder: "London",
      description: "City to use when !weather is run without an argument",
    },
    {
      key: "fahrenheit",
      label: "Use Fahrenheit",
      type: "toggle",
      description: "Display temperature in °F instead of °C",
    },
  ],

  init(ctx) {
    template = ctx.template;
  },

  configure(settings) {
    defaultCity = settings.defaultCity || "";
    useFahrenheit = settings.fahrenheit === true || settings.fahrenheit === "true";
  },

  async isConfigured() {
    return true;
  },

  async execute(args, context) {
    const fetchFn = context?.fetch || fetch;
    const query = args.trim() || defaultCity;
    const t = this.t;
    const trCode = (code) => {
      if (code == null || code === "") return "—";
      const k = `weather-command.codes.${code}`;
      if (!t) return WEATHER_CODES[code] || "—";
      const v = t(k);
      if (v !== k) return v;
      return WEATHER_CODES[code] || t("weather-command.codes.unknown") || "—";
    };

    if (!query) {
      return {
        title: "Weather",
        html: `<div class="command-result">
          <p>{{ t:weather-command.usage.needCityLine1 }}</p>
          <p>{{ t:weather-command.usage.needCityLine2 }}</p>
        </div>`,
      };
    }

    try {
      const geoRes = await fetchFn(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
      if (!geoRes.ok) throw new Error(`Geocoding HTTP ${geoRes.status}`);
      const geoData = await geoRes.json();

      if (!geoData.results || geoData.results.length === 0) {
        const q = String(query).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        return {
          title: "Weather Error",
          html: `<div class="command-result"><p>{{ t:weather-command.usage.notFoundBefore }} <strong>${q}</strong></p></div>`,
        };
      }

      const location = geoData.results[0];
      const locationName = `${location.name}, ${location.country}`;

      const tempUnit = useFahrenheit ? "fahrenheit" : "celsius";
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,uv_index_max,wind_speed_10m_max&hourly=temperature_2m,weather_code,precipitation_probability,precipitation&temperature_unit=${tempUnit}&timezone=auto&forecast_days=7`;

      const weatherRes = await fetchFn(weatherUrl);
      if (!weatherRes.ok) throw new Error(`Weather HTTP ${weatherRes.status}`);
      const weatherData = await weatherRes.json();

      const current = weatherData.current;
      const daily = weatherData.daily;
      const curUnits = weatherData.current_units || {};
      const dailyUnits = weatherData.daily_units || {};

      const windDir = _windDirection(current.wind_direction_10m);
      const windStr = `${Math.round(current.wind_speed_10m)} ${curUnits.wind_speed_10m || "km/h"} ${windDir}`;
      const visibilityKm = current.visibility != null ? (current.visibility >= 1000 ? `${(current.visibility / 1000).toFixed(1)} km` : `${Math.round(current.visibility)} m`) : "—";

      const hourly = weatherData.hourly || {};
      const hourlyTimes = hourly.time || [];
      const hourlyTemp = hourly.temperature_2m || [];
      const hourlyCode = hourly.weather_code || [];
      const hourlyPrecipPct = hourly.precipitation_probability || [];
      const hourlyPrecip = hourly.precipitation || [];
      const dailyDates = daily.time || [];
      const hourlyByDay = [];
      for (let d = 0; d < dailyDates.length; d++) {
        const dateStr = dailyDates[d];
        const dayHours = [];
        for (let h = 0; h < hourlyTimes.length; h++) {
          const t = hourlyTimes[h];
          if (typeof t !== "string" || t.slice(0, 10) !== dateStr) continue;
          const timeLabel = _formatTime(t);
          const temp = hourlyTemp[h] != null ? `${Math.round(hourlyTemp[h])}` : "—";
          const code = hourlyCode[h];
          const desc = trCode(code);
          const precipPct = hourlyPrecipPct[h] != null ? `${Math.round(hourlyPrecipPct[h])}%` : "—";
          const precip = hourlyPrecip[h] != null && hourlyPrecip[h] > 0 ? `${hourlyPrecip[h].toFixed(1)}` : "—";
          dayHours.push({ time: timeLabel, temp, desc, precipPct, precip, icon: _weatherIcon(code) });
        }
        hourlyByDay.push(dayHours);
      }
      const hourlyJson = JSON.stringify(hourlyByDay).replace(/"/g, "&quot;").replace(/&/g, "&amp;");

      const mainIcon = _weatherIcon(current.weather_code);
      let weekRows = "";
      for (let i = 0; i < dailyDates.length; i++) {
        const dayName = _formatDay(dailyDates[i]);
        const code = daily.weather_code?.[i];
        const iconClass = _weatherIcon(code);
        const high = daily.temperature_2m_max?.[i] != null ? `${Math.round(daily.temperature_2m_max[i])}${dailyUnits.temperature_2m_max || "°"}` : "—";
        const low = daily.temperature_2m_min?.[i] != null ? `${Math.round(daily.temperature_2m_min[i])}${dailyUnits.temperature_2m_min || "°"}` : "—";
        const precipPct = daily.precipitation_probability_max?.[i] != null ? `${Math.round(daily.precipitation_probability_max[i])}%` : "—";
        weekRows += `<tr class="weather-week-row" data-day-index="${i}" role="button" tabindex="0"><td class="weather-day">${dayName}</td><td class="weather-day-icon"><i class="ti fa-solid ${iconClass}"></i></td><td class="weather-day-temps">${high} / ${low}</td><td class="weather-day-precip"><i class="ti fa-solid fa-droplet"></i> ${precipPct}</td></tr>`;
      }

      const todaySunrise = _formatTime(daily.sunrise?.[0]);
      const todaySunset = _formatTime(daily.sunset?.[0]);

      return {
        title: `Weather — ${locationName}`,
        html: _render({
          locationName,
          mainIcon,
          temp: `${Math.round(current.temperature_2m)}${curUnits.temperature_2m || "°C"}`,
          desc: trCode(current.weather_code),
          feels: `${Math.round(current.apparent_temperature)}${curUnits.apparent_temperature || "°C"}`,
          high: daily.temperature_2m_max?.[0] != null ? `${Math.round(daily.temperature_2m_max[0])}${dailyUnits.temperature_2m_max || "°"}` : "—",
          low: daily.temperature_2m_min?.[0] != null ? `${Math.round(daily.temperature_2m_min[0])}${dailyUnits.temperature_2m_min || "°"}` : "—",
          humidity: `${current.relative_humidity_2m}${curUnits.relative_humidity_2m || "%"}`,
          wind: windStr,
          pressure: `${Math.round(current.surface_pressure)} ${curUnits.surface_pressure || "hPa"}`,
          cloudCover: `${Math.round(current.cloud_cover)}${curUnits.cloud_cover || "%"}`,
          visibility: visibilityKm,
          uv: daily.uv_index_max?.[0] != null ? daily.uv_index_max[0].toFixed(1) : "—",
          todaySunrise: todaySunrise,
          todaySunset: todaySunset,
          weekRows,
          hourlyJson,
        }),
      };

    } catch (error) {
      const errMessage = error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error));
      const q = String(query).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const em = String(errMessage || "Unknown Network Error").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      return {
        title: "Weather Error",
        html: `<div class="command-result">
          <p>{{ t:weather-command.usage.fetchErrorBefore }} <strong>${q}</strong>.</p>
          <p>{{ t:weather-command.usage.errorDetails }} <code>${em}</code></p>
        </div>`,
      };
    }
  },
};
