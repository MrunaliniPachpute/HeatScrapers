// Use window.map to avoid redeclaration issues
window.map = null;
let dataSource = null;
let marker = null;

// Fetch Azure Key
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

// Initialize Map
async function initMap() {
  const key = await getAzureKey();
  if (!key) return alert("Azure Key not available!");

  window.map = new atlas.Map("map", {
    center: [77.1025, 28.7041], // Default center (India)
    zoom: 3,
    style: "satellite",
    authOptions: {
      authType: "subscriptionKey",
      subscriptionKey: key,
    },
  });

  window.map.events.add("ready", () => {
    dataSource = new atlas.source.DataSource();
    window.map.sources.add(dataSource);

    window.map.layers.add(
      new atlas.layer.SymbolLayer(dataSource, null, {
        iconOptions: {
          image: "pin-round-darkblue",
          anchor: "bottom",
          allowOverlap: true,
        },
      })
    );

    // Default marker at center
    marker = new atlas.data.Feature(new atlas.data.Point([78.9629, 20.5937]));
    dataSource.add(marker);
  });
}

// Handle search form
document.getElementById("searchForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const place = document.getElementById("searchedPlace").value.trim();
  if (!place) return alert("Enter a valid place!");

  try {
    const response = await fetch("/home/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchedPlace: place }),
    });

    const data = await response.json();

    if (data.lat && data.lon) {
      const lat = parseFloat(data.lat);
      const lon = parseFloat(data.lon);

      const formattedPlace = place
        .split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");

      // Clear previous markers
      dataSource.clear();

      const newMarker = new atlas.data.Feature(new atlas.data.Point([lon, lat]));
      dataSource.add(newMarker);

      // Center map on new location
      window.map.setCamera({ center: [lon, lat], zoom: 12 });

      // Show popup
      const popup = new atlas.Popup({
        position: [lon, lat],
        content: `<div style="padding:5px 10px;font-weight:bold;">${formattedPlace}</div>`,
      });
      popup.open(window.map);

    } else {
      alert("Place not found!");
    }
  } catch (err) {
    console.error(err);
    alert("Failed to fetch location!");
  }
});

// Initialize map
initMap();
