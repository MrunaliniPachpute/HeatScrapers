const map = L.map("map").setView([20.5937, 78.9629], 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

let marker = L.marker([20.5937, 78.9629]).addTo(map);

document.getElementById("searchForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const place = document.getElementById("searchedPlace").value;

  const response = await fetch("/home/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ searchedPlace: place })
  });

  const data = await response.json();


  if (data.lat && data.lon) {
    const formattedPlace = place.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    if (marker) map.removeLayer(marker);
    marker = L.marker([data.lat, data.lon]).addTo(map);
    map.setView([data.lat, data.lon], 12);
    marker.bindPopup(`<b>${formattedPlace}</b>`).openPopup();
  } else {
    alert("Place not found!");
  }
});
