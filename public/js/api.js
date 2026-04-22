async function apiGet(url) {
  const response = await fetch(url);
  const data = await response.json().catch(function () {
    return {};
  });

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function buildSearchQuery(params) {
  const qs = new URLSearchParams();
  qs.set("q", params.q);
  qs.set("page", String(params.page));
  qs.set("source", params.source);
  qs.set("hasImage", String(params.hasImage));
  return qs.toString();
}

async function searchArtworks(params) {
  const query = buildSearchQuery(params);
  return apiGet("/api/search?" + query);
}

async function getArtworkDetails(source, id) {
  return apiGet("/api/artwork/" + encodeURIComponent(source) + "/" + encodeURIComponent(id));
}

async function getArtistBio(name) {
  return apiGet("/api/artist/" + encodeURIComponent(name));
}

async function getArtistWorks(name, source) {
  return apiGet(
    "/api/artist/" +
      encodeURIComponent(name) +
      "/works?source=" +
      encodeURIComponent(source || "both")
  );
}