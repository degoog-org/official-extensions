(function () {
  function _onKeydown(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest(".weather-week-row");
    if (!row) return;
    e.preventDefault();
    handleDayClick(row);
  }

  function _onClick(e) {
    const row = e.target.closest(".weather-week-row");
    if (!row) return;
    handleDayClick(row);
  }

  const _escapeHtml = (s) => {
    if (s == null) return "";
    const el = document.createElement("span");
    el.textContent = s;

    return el.innerHTML;
  };
  

  function handleDayClick(row) {
    const container = row.closest(".weather-result");

    if (!container) return;

    const raw = container.getAttribute("data-hourly");

    if (!raw) return;

    const jsonStr = raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    let hourlyByDay;

    try {
      hourlyByDay = JSON.parse(jsonStr);
    } catch {
      return;
    }

    const dayIndex = parseInt(row.getAttribute("data-day-index"), 10);
    if (dayIndex < 0 || !Array.isArray(hourlyByDay[dayIndex])) return;
    const next = row.nextElementSibling;

    if (next && next.classList.contains("weather-hourly-row")) {
      next.remove();
      row.classList.remove("weather-row-expanded");
      return;
    }

    const hours = hourlyByDay[dayIndex];
    const scrollWrap = document.createElement("div");
    scrollWrap.className = "weather-hourly-scroll";
    const strip = document.createElement("div");
    strip.className = "weather-hourly-strip";
    strip.setAttribute("role", "region");
    strip.setAttribute("aria-label", t("weather-command.script.hourlyAria"));

    for (let i = 0; i < hours.length; i++) {
      const h = hours[i];
      const card = document.createElement("div");
      card.className = "weather-hour-card";
      const precip = (h.precip && h.precip !== "—") ? "<span class=\"weather-hour-precip\">" + _escapeHtml(h.precip) + " " + _escapeHtml(t("weather-command.script.mmSuffix")) + "</span>" : "";
      card.innerHTML = "<span class=\"weather-hour-time\">" + _escapeHtml(h.time) + "</span><i class=\"ti fa-solid " + _escapeHtml(h.icon || "fa-cloud") + " weather-hour-icon\"></i><span class=\"weather-hour-temp\">" + _escapeHtml(h.temp) + "°</span>" + precip;
      strip.appendChild(card);
    }

    scrollWrap.appendChild(strip);
    const cell = document.createElement("td");
    cell.className = "weather-hourly-cell";
    cell.colSpan = 4;
    cell.appendChild(scrollWrap);
    const tr = document.createElement("tr");
    tr.className = "weather-hourly-row";
    tr.appendChild(cell);

    row.parentNode.insertBefore(tr, row.nextSibling);
    row.classList.add("weather-row-expanded");
  }

  document.addEventListener("click", _onClick);
  document.addEventListener("keydown", _onKeydown);
})();
