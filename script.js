
    // ---------- 1. Weather codes ----------
    const W = {
      0:  ["Clear", "☀️", "🌙", "clear"], 1: ["Mostly clear", "🌤️", "🌙", "clear"],
      2:  ["Partly cloudy", "⛅", "☁️", "cloud"], 3: ["Cloudy", "☁️", "☁️", "cloud"],
      45: ["Fog", "🌫️", "🌫️", "fog"], 48: ["Fog", "🌫️", "🌫️", "fog"],
      51: ["Light drizzle", "🌦️", "🌧️", "rain"], 53: ["Drizzle", "🌦️", "🌧️", "rain"], 55: ["Heavy drizzle", "🌧️", "🌧️", "rain"],
      61: ["Light rain", "🌧️", "🌧️", "rain"], 63: ["Rain", "🌧️", "🌧️", "rain"], 65: ["Heavy rain", "🌧️", "🌧️", "rain"],
      71: ["Light snow", "🌨️", "🌨️", "cloud"], 73: ["Snow", "❄️", "❄️", "cloud"], 75: ["Heavy snow", "❄️", "❄️", "cloud"],
      80: ["Showers", "🌦️", "🌧️", "rain"], 81: ["Showers", "🌧️", "🌧️", "rain"], 82: ["Heavy showers", "⛈️", "⛈️", "storm"],
      95: ["Thunderstorm", "⛈️", "⛈️", "storm"], 96: ["Thunderstorm", "⛈️", "⛈️", "storm"], 99: ["Thunderstorm", "⛈️", "⛈️", "storm"]
    };
    const wx = (code) => W[code] || ["Unknown", "❓", "❓", "cloud"];
    const icon = (code, isDay) => (isDay ? wx(code)[1] : wx(code)[2]);

    const THEMES = {
      "clear-day": ["#2f80ed", "#6dc5f7"], "clear-night": ["#0b1d3a", "#26457a"],
      "cloud-day": ["#5f7387", "#9db0c0"], "cloud-night": ["#232b36", "#3d4a5a"],
      "rain-day":  ["#3d5266", "#6a8399"], "rain-night":  ["#1c2631", "#35485a"],
      "storm-day": ["#2e3350", "#5a5380"], "storm-night": ["#15182a", "#2f2d4d"],
      "fog-day":   ["#7d8b92", "#b0bcc0"], "fog-night":   ["#2f3639", "#4b5558"]
    };
    function setTheme(code, isDay) {
      const [a, b] = THEMES[wx(code)[3] + (isDay ? "-day" : "-night")];
      document.body.style.background = `linear-gradient(180deg, ${a}, ${b}) fixed`;
    }

    // ---------- 2. Helpers ----------
    const $ = (id) => document.getElementById(id);
    const deg = (n) => Math.round(n) + "°";
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const key = (p) => p.lat.toFixed(2) + "," + p.lon.toFixed(2);
    function hour12(iso) { const h = +iso.slice(11, 13); return (h % 12 || 12) + " " + (h >= 12 ? "PM" : "AM"); }
    function time12(iso) { const h = +iso.slice(11, 13); return (h % 12 || 12) + ":" + iso.slice(14, 16) + " " + (h >= 12 ? "PM" : "AM"); }
    const uvText = (u) => u < 3 ? "Low" : u < 6 ? "Moderate" : u < 8 ? "High" : u < 11 ? "Very high" : "Extreme";

    // ---------- 3. APIs ----------
    async function searchPlaces(q, count) {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=en`);
      const d = await r.json();
      return (d.results || []).map((x) => ({
        name: x.name,
        sub: [x.admin2, x.admin1, x.country].filter(Boolean).join(", "),
        lat: x.latitude, lon: x.longitude
      }));
    }
    async function getWeather(lat, lon) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m` +
        `&hourly=temperature_2m,weather_code,precipitation_probability,is_day,visibility` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max` +
        `&timezone=auto&forecast_days=7`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("Weather server error");
      return await r.json();
    }
    // Turn any latitude/longitude into a readable area name
    async function nameFor(lat, lon) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lon}`);
        const a = (await r.json()).address || {};
        const name = a.suburb || a.village || a.town || a.city_district || a.city || a.county;
        if (name) return { name, sub: [a.county || a.state_district, a.state].filter(Boolean).join(", ") };
      } catch (e) { /* fall through */ }
      return { name: lat.toFixed(2) + ", " + lon.toFixed(2), sub: "" };
    }

    // ---------- 4. Saved areas ----------
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem("places") || "[]"); } catch (e) { saved = []; }
    const isSaved = (p) => saved.some((s) => key(s) === key(p));
    function toggleSave() {
      if (!place) return;
      saved = isSaved(place) ? saved.filter((s) => key(s) !== key(place)) : [...saved, place];
      localStorage.setItem("places", JSON.stringify(saved));
      renderChips(); renderStar(); loadOverview();
    }
    function renderStar() { const s = document.querySelector(".star"); if (s) s.textContent = isSaved(place) ? "★" : "☆"; }
    function renderChips() {
      $("chips").innerHTML = saved.map((s, i) =>
        `<button class="chip ${place && key(s) === key(place) ? "on" : ""}" data-i="${i}">${esc(s.name)}</button>`).join("");
      $("chips").querySelectorAll(".chip").forEach((b) => (b.onclick = () => load(saved[+b.dataset.i])));
    }
    // One API call for ALL saved areas (comma-separated coordinates)
    async function loadOverview() {
      $("areas").hidden = saved.length === 0;
      if (!saved.length) return;
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${saved.map((s) => s.lat).join(",")}` +
          `&longitude=${saved.map((s) => s.lon).join(",")}&current=temperature_2m,weather_code,is_day&timezone=auto`;
        const data = await (await fetch(url)).json();
        const list = Array.isArray(data) ? data : [data];
        $("areaList").innerHTML = list.map((d, i) =>
          `<div class="areaRow" data-i="${i}"><span>${esc(saved[i].name)}<small>${esc(wx(d.current.weather_code)[0])}</small></span>
           <span>${icon(d.current.weather_code, d.current.is_day === 1)} ${deg(d.current.temperature_2m)}</span></div>`).join("");
        $("areaList").querySelectorAll(".areaRow").forEach((r) => (r.onclick = () => load(saved[+r.dataset.i])));
      } catch (e) { /* overview is optional */ }
    }

    // ---------- 5. Draw the page ----------
    function render(p, w) {
      const c = w.current, d = w.daily, h = w.hourly, isDay = c.is_day === 1;
      setTheme(c.weather_code, isDay);

      $("hero").innerHTML = `
        <button class="star" onclick="toggleSave()" title="Save this area"></button>
        <div class="city">${esc(p.name)}</div>
        <div class="area">${esc(p.sub)}</div>
        <div class="temp">${deg(c.temperature_2m)}</div>
        <div class="cond">${icon(c.weather_code, isDay)} ${wx(c.weather_code)[0]}</div>
        <div class="hl">H:${deg(d.temperature_2m_max[0])} &nbsp; L:${deg(d.temperature_2m_min[0])}</div>`;
      renderStar();

      const now = h.time.findIndex((t) => t.slice(0, 13) === c.time.slice(0, 13));
      let hh = "";
      for (let i = now; i < now + 24 && i < h.time.length; i++) {
        const pr = h.precipitation_probability[i];
        hh += `<div class="hour"><div class="t">${i === now ? "Now" : hour12(h.time[i])}</div>
          <div class="i">${icon(h.weather_code[i], h.is_day[i] === 1)}</div>
          <div class="p">${pr >= 20 ? pr + "%" : ""}</div><div class="d">${deg(h.temperature_2m[i])}</div></div>`;
      }
      $("hourly").innerHTML = hh;

      const wkMin = Math.min(...d.temperature_2m_min), wkMax = Math.max(...d.temperature_2m_max), span = (wkMax - wkMin) || 1;
      $("daily").innerHTML = d.time.map((date, i) => {
        const name = i === 0 ? "Today" : new Date(date + "T00:00").toLocaleDateString("en-US", { weekday: "short" });
        const left = ((d.temperature_2m_min[i] - wkMin) / span) * 100;
        const width = ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / span) * 100;
        return `<div class="day"><span class="n">${name}</span><span class="i">${icon(d.weather_code[i], true)}</span>
          <span class="lo">${deg(d.temperature_2m_min[i])}</span>
          <div class="bar"><span style="left:${left}%;width:${Math.max(width, 6)}%"></span></div>
          <span class="hi">${deg(d.temperature_2m_max[i])}</span></div>`;
      }).join("");

      const vis = Math.round(h.visibility[now] / 1000), uv = Math.round(d.uv_index_max[0]);
      const box = (t, big, sub) => `<div class="card"><h4>${t}</h4><div class="big">${big}</div><div class="sub">${sub}</div></div>`;
      $("details").innerHTML =
        box("🌡️ Feels like", deg(c.apparent_temperature), "Humidity " + c.relative_humidity_2m + "%") +
        box("💨 Wind", c.wind_speed_10m + " km/h", "Current speed") +
        box("☀️ UV index", uv, uvText(uv)) +
        box("💧 Rain now", c.precipitation + " mm", "Chance next hour " + (h.precipitation_probability[now + 1] ?? 0) + "%") +
        box("👁️ Visibility", vis + " km", vis >= 10 ? "Clear view" : "Reduced") +
        box("⏲️ Pressure", Math.round(c.pressure_msl) + " hPa", "Sea level") +
        box("🌅 Sunrise", time12(d.sunrise[0]), "") + box("🌇 Sunset", time12(d.sunset[0]), "");
      $("status").textContent = "Updated " + new Date().toLocaleTimeString();
    }

    // ---------- 6. Load / refresh ----------
    let place = null;
    async function load(p) {
      try {
        $("status").textContent = "Loading...";
        place = p;
        render(p, await getWeather(p.lat, p.lon));
        localStorage.setItem("lastPlace", JSON.stringify(p));
        renderChips(); loadOverview();
      } catch (e) { $("status").textContent = "Error: " + e.message; }
    }

    // ---------- 7. Search with suggestions ----------
    let timer, results = [];
    function hideSug() { $("sug").style.display = "none"; }
    async function showSuggestions(q) {
      try {
        results = await searchPlaces(q, 8);
        if (!results.length) { $("sug").innerHTML = "<div>No match. Try the 🗺️ map.</div>"; $("sug").style.display = "block"; return; }
        $("sug").innerHTML = results.map((r, i) => `<div data-i="${i}">${esc(r.name)}<small>${esc(r.sub)}</small></div>`).join("");
        $("sug").style.display = "block";
        $("sug").querySelectorAll("div[data-i]").forEach((el) => (el.onclick = () => {
          hideSug(); $("cityInput").value = ""; load(results[+el.dataset.i]);
        }));
      } catch (e) { hideSug(); }
    }
    $("cityInput").addEventListener("input", (e) => {
      clearTimeout(timer);
      const q = e.target.value.trim();
      if (q.length < 2) return hideSug();
      timer = setTimeout(() => showSuggestions(q), 300);   // wait 300 ms after typing stops
    });
    $("cityInput").addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      const q = e.target.value.trim(); if (!q) return;
      const r = await searchPlaces(q, 1);
      hideSug();
      if (r.length) { e.target.value = ""; load(r[0]); } else $("status").textContent = "Area not found. Try the 🗺️ map.";
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".sw")) hideSug(); });

    // ---------- 8. My location ----------
    $("gpsBtn").onclick = () => {
      if (!navigator.geolocation) return ($("status").textContent = "Location not supported");
      $("status").textContent = "Finding your location...";
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        load({ ...(await nameFor(lat, lon)), lat, lon });
      }, (err) => { $("status").textContent = err && err.code === 1 ? "Location permission denied. Allow location access in your browser settings." : "Could not get your location. Check GPS/location settings and try again."; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    };

    // ---------- 9. Map picker: any spot on Earth ----------
    let map, marker, picked = null;

    function showMapStatus(message) {
      $("status").textContent = message;
    }

    $("mapBtn").onclick = () => {
      if (typeof L === "undefined") {
        showMapStatus("Map library did not load. Check your internet connection and refresh.");
        return;
      }

      $("mapWrap").style.display = "flex";

      if (!map) {
        const initialLat = place && Number.isFinite(place.lat) ? place.lat : 17.385;
        const initialLon = place && Number.isFinite(place.lon) ? place.lon : 78.4867;

        map = L.map("map", { tap: true }).setView([initialLat, initialLon], 10);

        const CARTO_API_KEY = "cb1_4xnl_1_811296b84319b782e0a901e8";

L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=" + CARTO_API_KEY,
  {
    subdomains: "abcd",
    maxZoom: 20,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO'
  }
).addTo(map);

        map.on("click", (e) => {
          picked = e.latlng;
          if (marker) {
            marker.setLatLng(picked);
          } else {
            marker = L.marker(picked).addTo(map);
          }
          $("pickBtn").disabled = false;
          $("pickBtn").textContent = "Get weather here";
          showMapStatus("Location selected. Press “Get weather here”.");
        });

        map.on("tileerror", () => {
          showMapStatus("Map tiles are blocked or unavailable. Check your internet connection, or try again later.");
        });
      } else {
        const center = place && Number.isFinite(place.lat) && Number.isFinite(place.lon)
          ? [place.lat, place.lon] : [17.385, 78.4867];
        map.setView(center, Math.max(map.getZoom(), 10));
      }

      picked = null;
      $("pickBtn").disabled = true;
      $("pickBtn").textContent = "Select a spot first";
      setTimeout(() => map.invalidateSize(true), 150);
    };

    $("mapClose").onclick = () => {
      $("mapWrap").style.display = "none";
      picked = null;
      $("pickBtn").disabled = true;
      $("pickBtn").textContent = "Select a spot first";
    };

    $("pickBtn").onclick = async () => {
      if (!picked) {
        showMapStatus("Tap a location on the map first.");
        return;
      }

      const selected = { lat: picked.lat, lon: picked.lng };
      $("mapWrap").style.display = "none";
      showMapStatus("Finding the selected area and loading weather...");

      try {
        const named = await nameFor(selected.lat, selected.lon);
        await load({ ...named, ...selected });
      } catch (err) {
        showMapStatus("Could not load weather for this spot. Check your internet connection and try again.");
      }
    };

    // ---------- 10. Real time + start ----------
    setInterval(() => place && load(place), 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && place) load(place); });

    let start = { name: "Hyderabad", sub: "Telangana, India", lat: 17.385, lon: 78.4867 };
    try { start = JSON.parse(localStorage.getItem("lastPlace")) || start; } catch (e) { /* use default */ }
    renderChips();
    load(start);