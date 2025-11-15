const heading = document.querySelector(".animated-heading");
const text = heading.textContent;
heading.textContent = "";
let currentCity = "Delhi";

let i = 0;
function typeLetter() {
  if (i < text.length) {
    heading.textContent += text[i];
    i++;
    setTimeout(typeLetter, 50);
  }
}
typeLetter();

const map = L.map("Heatmap").setView([28.7041, 77.1025], 3);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
}).addTo(map);

let heat = L.heatLayer([], {
  radius: 100,
  blur: 10,
  maxZoom: 17,
  gradient: { 0.2: "blue", 0.4: "lime", 0.6: "orange", 1: "red" },
}).addTo(map);

async function getAzureKey() {
  try {
    const response = await fetch("/api/azureKey");
    const data = await response.json();
    return data.key;
  } catch (err) {
    console.error("Failed to fetch Azure Key:", err);
    return null;
  }
}

async function getCoordinates(place) {
  const AZURE_KEY = await getAzureKey();
  if (!AZURE_KEY) return null;

  try {
    const res = await fetch(
      `https://atlas.microsoft.com/search/address/json?subscription-key=${AZURE_KEY}&api-version=1.0&query=${encodeURIComponent(
        place
      )}`
    );
    const data = await res.json();

    if (data && data.results && data.results.length > 0) {
      const pos = data.results[0].position;
      return [pos.lat, pos.lon];
    } else {
      alert("Place not found!");
      return null;
    }
  } catch (err) {
    console.error("Error fetching coordinates from Azure:", err);
    alert("Failed to fetch coordinates!");
    return null;
  }
}

async function getCityHeatpoints(place) {
  try {
    console.log("Fetching heatpoints...");
    const response = await fetch(
      `/api/heatpoints?place=${encodeURIComponent(place)}`
    );
    if (!response.ok) {
      const text = await response.text();
      console.error("Server returned an error:", response.status, text);
      return [];
    }
    const data = await response.json();
    console.log("Heatpoints received:", data.points?.length || 0);
    return data.points || [];
  } catch (err) {
    console.error("Error fetching heatpoints:", err);
    return [];
  }
}

async function getPlaceStats(place) {
  const coords = await getCoordinates(place);
  if (!coords) return null;

  const AZURE_KEY = await getAzureKey();
  const lat = coords[0];
  const lon = coords[1];

  try {
    const res = await fetch(
      `https://atlas.microsoft.com/weather/currentConditions/json?api-version=1.0&query=${lat},${lon}&subscription-key=${AZURE_KEY}`
    );
    const data = await res.json();
    console.log("Azure Weather Response:", data);
    return data;
  } catch (err) {
    console.error("Error fetching weather stats:", err);
    return null;
  }
}

function displayStats(data) {
  if (!data || !data.results || data.results.length === 0) {
    document.getElementById("placeStats").innerHTML =
      "No stats found for this place.";
    return;
  }

  const stats = data.results[0];

  document.getElementById("placeStats").innerHTML = `
  <div class="uhc-stats-card">
    <h4 class="uhc-stats-title">Heat Pulse Snapshot</h4>
    <div class="uhc-stats-grid">
      <div class="uhc-stat-box">
        <p class="uhc-stat-label">Temperature</p>
        <p class="uhc-stat-value">${stats.temperature?.value ?? "N/A"} °C</p>
      </div>
      <div class="uhc-stat-box">
        <p class="uhc-stat-label">Humidity</p>
        <p class="uhc-stat-value">${stats.relativeHumidity ?? "N/A"} %</p>
      </div>
      <div class="uhc-stat-box">
        <p class="uhc-stat-label">Real Feel</p>
        <p class="uhc-stat-value">${
          stats.realFeelTemperature?.value ?? "N/A"
        } °C</p>
      </div>
      <div class="uhc-stat-box">
        <p class="uhc-stat-label">Weather</p>
        <p class="uhc-stat-value">${stats.phrase ?? "N/A"}</p>
      </div>
      <div class="uhc-stat-box">
        <p class="uhc-stat-label">Wind Speed</p>
        <p class="uhc-stat-value">${stats.wind?.speed?.value ?? "N/A"} km/h</p>
      </div>
    </div>
  </div>
`;
}

document
  .getElementById("searchViewHeatMapForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const place = document.getElementById("viewHeatMapPlace").value.trim();
    if (!place) return;

    currentCity = place;

    const stats = await getPlaceStats(place);
    displayStats(stats);

    const coords = await getCoordinates(place);
    if (!coords) return;

    const lat = coords[0];
    const lon = coords[1];
    map.setView([lat, lon], 12);

    const heatPoints = await getCityHeatpoints(place);
    if (!heatPoints.length) {
      alert("No heatpoints available for this location.");
      return;
    }

    const formattedPoints = heatPoints.map((p) => [p.lat, p.lon, p.intensity]);
    heat.setLatLngs(formattedPoints);
  });

const legend = document.getElementById("HeatmapLegend");
legend.innerHTML = `
  <div class="legend-title">Heat Intensity</div>
  <div class="legend-scale"></div>
  <div class="legend-labels">
    <span>Low</span>
    <span>High</span>
  </div>
`;

// CALENDER
document.addEventListener("DOMContentLoaded", () => {
  if (typeof CalHeatmap === "undefined") {
    console.error("CalHeatmap library not loaded yet!");
    return;
  }

  const cal = new CalHeatmap();
  const yearSlider = document.getElementById("yearSlider");
  const yearValue = document.getElementById("yearValue");

  async function fetchYearHeatData(city, year) {
    try {
      const res = await fetch(`/api/yearlyHeat?place=${city}&year=${year}`);
      const data = await res.json();

      return Object.fromEntries(
        Object.entries(data).map(([date, temp]) => [
          new Date(date).getTime() / 1000,
          temp,
        ])
      );
    } catch (err) {
      console.error("Error fetching year heat data:", err);
      return {};
    }
  }

  async function renderCalendar(year) {
  const city = currentCity || "Delhi";
  const data = await fetchYearHeatData(city, year);

  console.log("📅 Calendar data for", year, data);

  cal.destroy();
  await cal.paint(
    {
      itemSelector: "#heatCalendar",
      data: {
        source: Object.entries(data).map(([timestamp, value]) => ({
          date: new Date(timestamp * 1000),
          value: Number(value),
        })),
        x: "date",
        y: "value",
      },
      date: {
        start: new Date(`${year}-01-01`),
        min: new Date(`${year}-01-01`),
        max: new Date(`${year}-12-31`),
      },
      range: 12,
      domain: { type: "month", gutter: 5 },
      subDomain: {
        type: "day",
        radius: 3,
        width: 15,
        height: 15,
        label: () => "",
      },
      scale: {
        color: {
          type: "threshold",
          domain:[20, 28, 33, 37, 40],
          range:[
      "#05ff82ff", // Cool green — mild
      "#f6f94fff", // Sunny yellow — warm
      "#ff5804ff", // Orange — hotter
      "#e05515ff", // Deep orange — very hot
      "#d00000", // Intense red — extreme heat
    ],
        },
      },
      Legend: {
        show: true,
        position: "bottom",
        label: "Daily Avg Temperature (°C)",
        width : 100,
      },
    },
  );
}


  yearSlider.addEventListener("input", async (e) => {
    const year = e.target.value;
    yearValue.textContent = year;
    await renderCalendar(year);
  });

  renderCalendar(yearSlider.value);
});
