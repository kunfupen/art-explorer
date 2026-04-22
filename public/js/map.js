let currentMap = null;

function clearMuseumMap() {
  if (currentMap) {
    currentMap.remove();
    currentMap = null;
  }
}

function renderMuseumMap(containerId, lat, lng, label) {
  clearMuseumMap();

  currentMap = L.map(containerId, {
    zoomControl: true
  }).setView([lat, lng], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(currentMap);

  L.marker([lat, lng]).addTo(currentMap).bindPopup(label || "Museum").openPopup();

  setTimeout(function () {
    if (currentMap) currentMap.invalidateSize();
  }, 0);
}