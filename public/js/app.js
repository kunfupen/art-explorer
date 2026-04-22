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
  debounceTimer: null
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

  favoritesGrid: document.getElementById("favoritesGrid"),
  favoritesEmpty: document.getElementById("favoritesEmpty"),
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

function renderResults() {
  el.resultCountText.textContent = state.total + " results found";
  if (!state.results.length) {
    el.resultsGrid.innerHTML = '<div class="col"><div class="alert alert-secondary">No results found.</div></div>';
    renderPagination();
    return;
  }

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
    const link = bio.url
      ? '<a href="' + escapeHtml(bio.url) + '" target="_blank">Read full article on Wikipedia</a>'
      : "";
    el.bioContent.innerHTML =
      '<h4 class="fw-bold mb-3">' + escapeHtml(bio.title || artist) + "</h4>" +
      '<p class="fs-5">' + escapeHtml(bio.extract || "No biography available.") + "</p>" +
      link;
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
    const data = await getArtistWorks(artist, state.selectedArtwork.source);
    const works = (Array.isArray(data.results) ? data.results : [])
      .filter(function (item) {
        return item.id !== state.selectedArtwork.id || item.source !== state.selectedArtwork.source;
      })
      .slice(0, 8);

    if (!works.length) {
      el.worksContent.innerHTML = '<div class="alert alert-secondary">No related works found.</div>';
    } else {
      el.worksContent.innerHTML = '<div class="row row-cols-1 row-cols-md-2 g-3">' + works.map(toCardHtml).join("") + "</div>";
      const cards = el.worksContent.querySelectorAll(".art-card");
      cards.forEach(function (card) {
        card.addEventListener("click", function () {
          const source = card.getAttribute("data-source");
          const id = card.getAttribute("data-id");
          openArtworkDetail(source, id);
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
  renderMuseumMap("mapContainer", state.selectedArtwork.lat, state.selectedArtwork.lng, state.selectedArtwork.museum);
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

  setLoading(true);

  try {
    const data = await searchArtworks({
      q: state.query,
      page: state.page,
      source: state.source,
      hasImage: state.hasImage
    });

    state.results = Array.isArray(data.results) ? data.results : [];
    state.total = Number(data.total || 0);
    state.totalPages = Number(data.totalPages || 1);
    state.page = Number(data.page || 1);

    setLoading(false);
    renderResults();
  } catch (err) {
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
  el.favoritesEmpty.classList.toggle("d-none", list.length > 0);

  if (!list.length) {
    el.favoritesGrid.innerHTML = "";
    return;
  }

  el.favoritesGrid.innerHTML = list.map(function (item) {
    return (
      '<div class="col">' +
        '<div class="card art-card h-100" data-source="' + escapeHtml(item.source) + '" data-id="' + escapeHtml(item.id) + '">' +
          '<div class="position-relative">' +
            (item.image
              ? '<img class="art-image" src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.title) + '">'
              : '<div class="art-image d-flex align-items-center justify-content-center text-muted fs-4">No Image</div>') +
            '<span class="source-badge ' + sourceBadgeClass(item.source) + '">' + sourceLabel(item.source) + "</span>" +
          "</div>" +
          '<div class="card-body">' +
            '<h5 class="card-title fw-bold">' + escapeHtml(item.title) + "</h5>" +
            '<p class="card-text text-muted mb-2 fs-4">' + escapeHtml(item.artist || "Unknown Artist") + "</p>" +
            '<button class="btn btn-danger w-100 remove-fav-btn" data-source="' + escapeHtml(item.source) + '" data-id="' + escapeHtml(item.id) + '">Remove from Favorites</button>' +
          "</div>" +
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

  const cards = el.favoritesGrid.querySelectorAll(".art-card");
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
  bindEvents();
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