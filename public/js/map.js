let currentMap = null;

function clearMuseumMap() {
  if (currentMap) {
    currentMap.remove();
    currentMap = null;
  }
}

function escapeMapHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMuseumMap(containerId, lat, lng, label, address) {
  clearMuseumMap();

  currentMap = L.map(containerId, {
    zoomControl: true
  }).setView([lat, lng], 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(currentMap);

  const popup =
    '<div class="map-popup-title">' + escapeMapHtml(label || "Museum") + "</div>" +
    (address ? '<div class="map-popup-address">' + escapeMapHtml(address) + "</div>" : "");

  L.marker([lat, lng]).addTo(currentMap).bindPopup(popup, {
    closeButton: true,
    maxWidth: 420
  }).openPopup();

  setTimeout(function () {
    if (currentMap) currentMap.invalidateSize();
  }, 0);
}
