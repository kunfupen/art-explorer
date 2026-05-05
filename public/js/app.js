const state = {
  view: "search",
  query: "",
  source: "both",
  hasImage: true,
  page: 1,
  totalPages: 1,
  total: 0,
  results: [],
  selectedArtwork: null,
  bioLoadedFor: "",
  worksLoadedFor: "",
  debounceTimer: null,
  searchRequestId: 0,
  searchAbortController: null
};

const el = {
  navSearch: document.getElementById("navSearch"),
  navFavorites: document.getElementById("navFavorites"),
  brandLink: document.getElementById("brandLink"),

  searchView: document.getElementById("searchView"),
  detailView: document.getElementById("detailView"),
  favoritesView: document.getElementById("favoritesView"),

  queryInput: document.getElementById("queryInput"),
  sourceSelect: document.getElementById("sourceSelect"),
  hasImageCheck: document.getElementById("hasImageCheck"),
  imageFilterLabel: document.getElementById("imageFilterLabel"),
  searchBtn: document.getElementById("searchBtn"),

  resultCountText: document.getElementById("resultCountText"),
  loadingSkeleton: document.getElementById("loadingSkeleton"),
  resultsGrid: document.getElementById("resultsGrid"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  pageInfo: document.getElementById("pageInfo"),

  backBtn: document.getElementById("backBtn"),
  detailImage: document.getElementById("detailImage"),
  detailTitle: document.getElementById("detailTitle"),
  detailArtist: document.getElementById("detailArtist"),
  favoriteBtn: document.getElementById("favoriteBtn"),
  overviewContent: document.getElementById("overviewContent"),
  bioContent: document.getElementById("bioContent"),
  worksContent: document.getElementById("worksContent"),
  mapInfo: document.getElementById("mapInfo"),

  favoritesGrid: document.getElementById("favoritesGrid"),
  favoritesEmpty: document.getElementById("favoritesEmpty"),
  favoritesCountBadge: document.getElementById("favoritesCountBadge"),
  searchError: document.getElementById("searchError")
};

function escapeHtml(value) {
  const text = String(value || "");
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sourceBadgeClass(source) {
  return source === "harvard" ? "source-harvard" : "source-met";
}

function sourceLabel(source) {
  return source === "harvard" ? "HARVARD" : "MET";
}

function toCardHtml(item) {
  const image = item.image
    ? '<img class="art-image" src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.title) + '">'
    : '<div class="art-image d-flex align-items-center justify-content-center text-muted fs-4">No Image</div>';

  return (
    '<div class="col">' +
      '<div class="card art-card h-100" data-source="' + escapeHtml(item.source) + '" data-id="' + escapeHtml(item.id) + '">' +
        '<div class="position-relative">' +
          image +
          '<span class="source-badge ' + sourceBadgeClass(item.source) + '">' + sourceLabel(item.source) + "</span>" +
        "</div>" +
        '<div class="card-body">' +
          '<h5 class="card-title fw-bold">' + escapeHtml(item.title) + "</h5>" +
          '<p class="card-text text-muted mb-2 fs-4">' + escapeHtml(item.artist || "Unknown Artist") + "</p>" +
          '<p class="card-text text-muted fs-5 mb-0">' + escapeHtml(item.date || "Unknown Date") + "</p>" +
        "</div>" +
      "</div>" +
    "</div>"
  );
}

function toRelatedWorkHtml(item) {
  const image = item.image
    ? '<img class="related-work-image" src="' + escapeHtml(item.image) + '" alt="">'
    : '<div class="related-work-image related-work-placeholder d-flex align-items-center justify-content-center text-muted">No Image</div>';

  return (
    '<div class="related-work-item" role="button" tabindex="0" title="' + escapeHtml(item.title || "Related artwork") + '" aria-label="' + escapeHtml(item.title || "Related artwork") + '" data-source="' + escapeHtml(item.source) + '" data-id="' + escapeHtml(item.id) + '">' +
      image +
    "</div>"
  );
}

function showView(name) {
  state.view = name;
  el.searchView.classList.toggle("d-none", name !== "search");
  el.detailView.classList.toggle("d-none", name !== "detail");
  el.favoritesView.classList.toggle("d-none", name !== "favorites");

  el.navSearch.classList.toggle("active", name !== "favorites");
  el.navFavorites.classList.toggle("active", name === "favorites");
}

function renderSkeletons() {
  const count = 8;
  let html = "";
  for (let i = 0; i < count; i += 1) {
    html += '<div class="col"><div class="skeleton-card"></div></div>';
  }
  el.loadingSkeleton.innerHTML = html;
}

function setLoading(isLoading) {
  el.loadingSkeleton.classList.toggle("d-none", !isLoading);
  if (isLoading) {
    renderSkeletons();
    el.resultsGrid.innerHTML = "";
  }
}

function renderPagination() {
  el.pageInfo.textContent = "Page " + state.page + " of " + state.totalPages;
  el.prevBtn.disabled = state.page <= 1;
  el.nextBtn.disabled = state.page >= state.totalPages;
}

function syncImageFilterLabel() {
  el.imageFilterLabel.textContent = el.hasImageCheck.checked ? "Has Image" : "No Image";
}

function renderResults() {
  if (!state.results.length) {
    el.resultCountText.textContent = "";
    el.resultsGrid.innerHTML =
      '<div class="empty-results-col">' +
        '<div class="empty-results">' +
          '<div class="empty-results-icon">🎨</div>' +
          '<div class="empty-results-text">No artworks found. Try a different search term.</div>' +
        "</div>" +
      "</div>";
    renderPagination();
    return;
  }

  el.resultCountText.textContent = state.total + " results found";
  el.resultsGrid.innerHTML = state.results.map(toCardHtml).join("");
  renderPagination();

  const cards = el.resultsGrid.querySelectorAll(".art-card");
  cards.forEach(function (card) {
    card.addEventListener("click", function () {
      const source = card.getAttribute("data-source");
      const id = card.getAttribute("data-id");
      openArtworkDetail(source, id);
    });
  });
}

function overviewRow(label, value) {
  return (
    '<div class="meta-row">' +
      '<div class="meta-label">' + escapeHtml(label) + "</div>" +
      "<div>" + escapeHtml(value || "-") + "</div>" +
    "</div>"
  );
}

function renderOverview(art) {
  const websiteButton = art.museumUrl
    ? '<a href="' + escapeHtml(art.museumUrl) + '" target="_blank" class="btn btn-primary btn-lg mt-2">View on Museum Website</a>'
    : "";

  el.overviewContent.innerHTML =
    overviewRow("Date", art.date) +
    overviewRow("Medium", art.medium) +
    overviewRow("Dimensions", art.dimensions) +
    overviewRow("Department", art.department) +
    overviewRow("Museum", art.museum) +
    websiteButton;
}

function renderFavoriteButton() {
  if (!state.selectedArtwork) return;
  const favored = isFavorite(state.selectedArtwork);
  el.favoriteBtn.className = favored ? "btn btn-danger btn-lg w-100 mt-3" : "btn btn-outline-danger btn-lg w-100 mt-3";
  el.favoriteBtn.textContent = favored ? "♥ Remove from Favorites" : "♡ Add to Favorites";
}

function renderFavoritesCount() {
  const count = readFavorites().length;
  el.favoritesCountBadge.textContent = String(count);
  el.favoritesCountBadge.classList.toggle("d-none", count === 0);
}

async function renderBiographyIfNeeded() {
  if (!state.selectedArtwork) return;
  const artist = (state.selectedArtwork.artist || "").trim();
  if (!artist || artist.toLowerCase() === "unknown artist") {
    el.bioContent.innerHTML = '<div class="alert alert-secondary">No artist biography available.</div>';
    return;
  }

  const key = state.selectedArtwork.source + ":" + state.selectedArtwork.id;
  if (state.bioLoadedFor === key) return;

  el.bioContent.innerHTML = "Loading biography...";
  try {
    const bio = await getArtistBio(artist);
    const image = bio.image
      ? '<img class="bio-image" src="' + escapeHtml(bio.image) + '" alt="' + escapeHtml(bio.title || artist) + '">'
      : '<div class="bio-image bio-image-placeholder d-flex align-items-center justify-content-center text-muted">No Image</div>';
    const linkButton = bio.url
      ? '<a href="' + escapeHtml(bio.url) + '" target="_blank" class="btn btn-outline-secondary btn-lg">View on Wikipedia</a>'
      : "";
    el.bioContent.innerHTML =
      '<div class="bio-panel">' +
        '<div class="bio-header">' +
          image +
          '<div class="bio-heading">' +
            '<h3>' + escapeHtml(bio.title || artist) + "</h3>" +
            linkButton +
          "</div>" +
        "</div>" +
        '<p class="bio-extract">' + escapeHtml(bio.extract || "No biography available.") + "</p>" +
      "</div>";
    state.bioLoadedFor = key;
  } catch (err) {
    el.bioContent.innerHTML = '<div class="alert alert-warning">Failed to load biography.</div>';
  }
}

async function renderRelatedWorksIfNeeded() {
  if (!state.selectedArtwork) return;
  const artist = (state.selectedArtwork.artist || "").trim();
  if (!artist || artist.toLowerCase() === "unknown artist") {
    el.worksContent.innerHTML = '<div class="alert alert-secondary">No related works available.</div>';
    return;
  }

  const key = state.selectedArtwork.source + ":" + state.selectedArtwork.id;
  if (state.worksLoadedFor === key) return;

  el.worksContent.innerHTML = "Loading related works...";
  try {
    const data = await getArtistWorks(artist, "both");
    const works = (Array.isArray(data.results) ? data.results : [])
      .filter(function (item) {
        return item.id !== state.selectedArtwork.id || item.source !== state.selectedArtwork.source;
      })
      .slice(0, 8);

    if (!works.length) {
      el.worksContent.innerHTML = '<div class="alert alert-secondary">No related works found.</div>';
    } else {
      el.worksContent.innerHTML = '<div class="related-works-grid">' + works.map(toRelatedWorkHtml).join("") + "</div>";
      const items = el.worksContent.querySelectorAll(".related-work-item");
      items.forEach(function (item) {
        item.addEventListener("click", function () {
          const source = item.getAttribute("data-source");
          const id = item.getAttribute("data-id");
          openArtworkDetail(source, id);
        });
        item.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const source = item.getAttribute("data-source");
            const id = item.getAttribute("data-id");
            openArtworkDetail(source, id);
          }
        });
      });
    }

    state.worksLoadedFor = key;
  } catch (err) {
    el.worksContent.innerHTML = '<div class="alert alert-warning">Failed to load related works.</div>';
  }
}

function renderMapIfNeeded() {
  if (!state.selectedArtwork) return;
  const museum = state.selectedArtwork.museum || "Museum";
  const address = state.selectedArtwork.museumAddress || "";
  el.mapInfo.innerHTML =
    '<h3>' + escapeHtml(museum) + "</h3>" +
    (address ? '<p>' + escapeHtml(address) + "</p>" : "");
  renderMuseumMap("mapContainer", state.selectedArtwork.lat, state.selectedArtwork.lng, museum, address);
}

async function openArtworkDetail(source, id) {
  try {
    const art = await getArtworkDetails(source, id);
    state.selectedArtwork = art;
    state.bioLoadedFor = "";
    state.worksLoadedFor = "";

    el.detailImage.src = art.image || "";
    el.detailImage.alt = art.title || "Artwork image";
    el.detailTitle.textContent = art.title || "Untitled";
    el.detailArtist.textContent = art.artist || "Unknown Artist";

    renderOverview(art);
    renderFavoriteButton();

    el.bioContent.textContent = "Loading biography...";
    el.worksContent.textContent = "Loading related works...";
    el.mapInfo.innerHTML = "";
    clearMuseumMap();

    showView("detail");

    renderBiographyIfNeeded();

    const firstTab = document.querySelector('button[data-bs-target="#tabOverview"]');
    if (firstTab) {
      const instance = bootstrap.Tab.getOrCreateInstance(firstTab);
      instance.show();
    }
  } catch (err) {
    alert("Failed to load artwork details.");
  }
}

async function runSearch(page, showEmptyError) {
  const q = el.queryInput.value.trim();

  if (!q) {
    if (showEmptyError) setSearchError("Please enter a search term");
    state.results = [];
    state.total = 0;
    state.totalPages = 1;
    state.page = 1;
    el.resultCountText.textContent = "";
    el.resultsGrid.innerHTML = "";
    el.pageInfo.textContent = "Page 1 of 1";
    return;
  }

  setSearchError("");

  state.query = q;
  state.source = el.sourceSelect.value;
  state.hasImage = el.hasImageCheck.checked;
  state.page = page || 1;
  state.searchRequestId += 1;
  const requestId = state.searchRequestId;
  if (state.searchAbortController) {
    state.searchAbortController.abort();
  }
  state.searchAbortController = new AbortController();

  setLoading(true);

  try {
    const data = await searchArtworks({
      q: state.query,
      page: state.page,
      source: state.source,
      hasImage: state.hasImage,
      signal: state.searchAbortController.signal
    });

    if (requestId !== state.searchRequestId) return;

    state.results = Array.isArray(data.results) ? data.results : [];
    state.total = Number(data.total || 0);
    state.totalPages = Number(data.totalPages || 1);
    state.page = Number(data.page || 1);

    setLoading(false);
    renderResults();
  } catch (err) {
    if (requestId !== state.searchRequestId) return;
    if (err && err.name === "AbortError") return;

    setLoading(false);
    el.resultCountText.textContent = "";
    const message = err && err.message ? err.message : "Search failed. Check server and API key.";
    el.resultsGrid.innerHTML =
      '<div class="col"><div class="alert alert-danger">' + escapeHtml(message) + "</div></div>";
    el.pageInfo.textContent = "";
  }
}

function renderFavorites() {
  const list = readFavorites();
  renderFavoritesCount();
  el.favoritesEmpty.classList.toggle("d-none", list.length > 0);

  if (!list.length) {
    el.favoritesGrid.innerHTML = "";
    return;
  }

  el.favoritesGrid.innerHTML = list.map(function (item) {
    return (
      '<div class="favorite-card" data-source="' + escapeHtml(item.source) + '" data-id="' + escapeHtml(item.id) + '">' +
        '<div class="favorite-image-wrap">' +
          (item.image
            ? '<img class="favorite-image" src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.title) + '">'
            : '<div class="favorite-image d-flex align-items-center justify-content-center text-muted fs-4">No Image</div>') +
          '<span class="source-badge ' + sourceBadgeClass(item.source) + '">' + sourceLabel(item.source) + "</span>" +
          '<button class="remove-fav-btn favorite-remove-btn" type="button" aria-label="Remove from favorites" data-source="' + escapeHtml(item.source) + '" data-id="' + escapeHtml(item.id) + '">×</button>' +
        "</div>" +
        '<div class="favorite-body">' +
          '<h3>' + escapeHtml(item.title) + "</h3>" +
          '<p class="favorite-artist">' + escapeHtml(item.artist || "Unknown Artist") + "</p>" +
          '<p class="favorite-date">' + escapeHtml(item.date || "Unknown Date") + "</p>" +
        "</div>" +
      "</div>"
    );
  }).join("");

  const removeButtons = el.favoritesGrid.querySelectorAll(".remove-fav-btn");
  removeButtons.forEach(function (btn) {
    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      const source = btn.getAttribute("data-source");
      const id = btn.getAttribute("data-id");
      removeFavorite({ source: source, id: id });
      renderFavorites();
      renderFavoriteButton();
    });
  });

  const cards = el.favoritesGrid.querySelectorAll(".favorite-card");
  cards.forEach(function (card) {
    card.addEventListener("click", function () {
      const source = card.getAttribute("data-source");
      const id = card.getAttribute("data-id");
      openArtworkDetail(source, id);
    });
  });
}

function bindEvents() {
  el.searchBtn.addEventListener("click", function () {
    runSearch(1, true);
  });

  el.queryInput.addEventListener("input", function () {
    clearTimeout(state.debounceTimer);
    const q = el.queryInput.value.trim();

    if (!q) {
      setSearchError("");
      return;
    }

    state.debounceTimer = setTimeout(function () {
      runSearch(1, false);
    }, 300);
  });

  el.queryInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch(1, true);
    }
  });

  el.sourceSelect.addEventListener("change", function () {
    if (el.queryInput.value.trim()) runSearch(1, false);
  });

  el.hasImageCheck.addEventListener("change", function () {
    syncImageFilterLabel();
    if (el.queryInput.value.trim()) runSearch(1, false);
  });

  el.prevBtn.addEventListener("click", function () {
    if (state.page > 1) runSearch(state.page - 1, false);
  });

  el.nextBtn.addEventListener("click", function () {
    if (state.page < state.totalPages) runSearch(state.page + 1, false);
  });

  el.backBtn.addEventListener("click", function () {
    clearMuseumMap();
    showView("search");
  });

  el.favoriteBtn.addEventListener("click", function () {
    if (!state.selectedArtwork) return;
    const added = toggleFavorite(state.selectedArtwork);
    renderFavoriteButton();
    renderFavoritesCount();
    renderFavorites();
    if (!added && state.view === "favorites") renderFavorites();
  });

  el.navSearch.addEventListener("click", function (event) {
    event.preventDefault();
    clearMuseumMap();
    showView("search");
  });

  el.navFavorites.addEventListener("click", function (event) {
    event.preventDefault();
    clearMuseumMap();
    showView("favorites");
    renderFavorites();
  });

  el.brandLink.addEventListener("click", function (event) {
    event.preventDefault();
    clearMuseumMap();
    showView("search");
  });

  const bioTab = document.querySelector('button[data-bs-target="#tabBio"]');
  const worksTab = document.querySelector('button[data-bs-target="#tabWorks"]');
  const mapTab = document.querySelector('button[data-bs-target="#tabMap"]');

  if (bioTab) {
    bioTab.addEventListener("shown.bs.tab", function () {
      renderBiographyIfNeeded();
    });
  }

  if (worksTab) {
    worksTab.addEventListener("shown.bs.tab", function () {
      renderRelatedWorksIfNeeded();
    });
  }

  if (mapTab) {
    mapTab.addEventListener("shown.bs.tab", function () {
      renderMapIfNeeded();
    });
  }
}

function init() {
  syncImageFilterLabel();
  bindEvents();
  renderFavoritesCount();
  renderFavorites();
  showView("search");
  el.pageInfo.textContent = "Page 1 of 1";
}

init();

function setSearchError(message) {
  if (!el.searchError) return;
  if (message) {
    el.searchError.textContent = message;
    el.searchError.classList.remove("d-none");
  } else {
    el.searchError.textContent = "";
    el.searchError.classList.add("d-none");
  }
}
