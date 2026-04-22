const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;
const HARVARD_API_KEY = process.env.HARVARD_API_KEY || "";

app.use(express.static("public"));
app.use(express.json());

const MUSEUM_COORDS = {
  met: { lat: 40.7794, lng: -73.9632, name: "The Metropolitan Museum of Art" },
  harvard: { lat: 42.3744, lng: -71.1143, name: "Harvard Art Museums" }
};

function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeMet(record) {
  return {
    source: "met",
    id: safeString(record.objectID),
    title: safeString(record.title) || "Untitled",
    artist: safeString(record.artistDisplayName) || "Unknown Artist",
    date: safeString(record.objectDate),
    medium: safeString(record.medium),
    dimensions: safeString(record.dimensions),
    department: safeString(record.department),
    image: safeString(record.primaryImageSmall) || safeString(record.primaryImage),
    museum: MUSEUM_COORDS.met.name,
    museumUrl: safeString(record.objectURL),
    lat: MUSEUM_COORDS.met.lat,
    lng: MUSEUM_COORDS.met.lng
  };
}

function normalizeHarvard(record) {
  const image =
    safeString(record.primaryimageurl) ||
    (Array.isArray(record.images) && record.images[0] && safeString(record.images[0].baseimageurl)) ||
    "";

  const person = Array.isArray(record.people) && record.people.length > 0 ? record.people[0] : null;
  const artist = person && person.name ? safeString(person.name) : "Unknown Artist";

  return {
    source: "harvard",
    id: safeString(record.id),
    title: safeString(record.title) || "Untitled",
    artist: artist,
    date: safeString(record.dated),
    medium: safeString(record.medium),
    dimensions: safeString(record.dimensions),
    department: safeString(record.department),
    image: image,
    museum: MUSEUM_COORDS.harvard.name,
    museumUrl: safeString(record.url),
    lat: MUSEUM_COORDS.harvard.lat,
    lng: MUSEUM_COORDS.harvard.lng
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Request failed with status " + response.status);
  }
  return response.json();
}

async function fetchMetCandidates(query, hasImage, maxCount) {
  const searchUrl =
    "https://collectionapi.metmuseum.org/public/collection/v1/search?q=" +
    encodeURIComponent(query) +
    "&hasImages=" +
    (hasImage ? "true" : "false");

  const searchData = await fetchJson(searchUrl);
  const ids = Array.isArray(searchData.objectIDs) ? searchData.objectIDs.slice(0, maxCount) : [];
  if (ids.length === 0) return [];

  const details = await Promise.all(
    ids.map(async function (id) {
      try {
        const obj = await fetchJson(
          "https://collectionapi.metmuseum.org/public/collection/v1/objects/" + encodeURIComponent(String(id))
        );
        return normalizeMet(obj);
      } catch (err) {
        return null;
      }
    })
  );

  return details.filter(Boolean).filter(function (item) {
    if (!hasImage) return true;
    return Boolean(item.image);
  });
}

async function fetchHarvardCandidates(query, hasImage, maxCount) {
  if (!HARVARD_API_KEY) {
    throw new Error("HARVARD_API_KEY is missing on server");
  }

  const size = Math.min(maxCount, 100);
  const url =
    "https://api.harvardartmuseums.org/object?keyword=" +
    encodeURIComponent(query) +
    "&size=" +
    size +
    "&page=1&apikey=" +
    encodeURIComponent(HARVARD_API_KEY);

  const data = await fetchJson(url);
  const records = Array.isArray(data.records) ? data.records : [];
  const normalized = records.map(normalizeHarvard);

  return normalized.filter(function (item) {
    if (!hasImage) return true;
    return Boolean(item.image);
  });
}

function paginate(items, page, pageSize) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  const results = items.slice(start, start + pageSize);

  return {
    total: total,
    totalPages: totalPages,
    page: currentPage,
    pageSize: pageSize,
    results: results
  };
}

app.get("/api/search", async function (req, res) {
  try {
    const q = safeString(req.query.q).trim();
    const page = Number(req.query.page || 1);
    const source = safeString(req.query.source || "both").toLowerCase();
    const hasImage = safeString(req.query.hasImage || "false").toLowerCase() === "true";

    if (!q) {
      return res.status(400).json({ error: "q query parameter is required" });
    }

    if (!["met", "harvard", "both"].includes(source)) {
      return res.status(400).json({ error: "source must be met, harvard, or both" });
    }

    const pageSize = 20;
    const maxCandidatesPerSource = 40; // reduce API pressure
    let results = [];
    let attempted = 0;
    const warnings = [];

    if (source === "met" || source === "both") {
      attempted += 1;
      try {
        const metResults = await fetchMetCandidates(q, hasImage, maxCandidatesPerSource);
        results = results.concat(metResults);
      } catch (err) {
        warnings.push("MET failed: " + (err.message || "unknown error"));
      }
    }

    if (source === "harvard" || source === "both") {
      attempted += 1;
      try {
        const harvardResults = await fetchHarvardCandidates(q, hasImage, maxCandidatesPerSource);
        results = results.concat(harvardResults);
      } catch (err) {
        warnings.push("HARVARD failed: " + (err.message || "unknown error"));
      }
    }

    // If all attempted sources failed, return an error.
    if (warnings.length === attempted) {
      return res.status(502).json({
        error: "All sources failed",
        details: warnings
      });
    }

    results.sort(function (a, b) {
      return a.title.localeCompare(b.title);
    });

    const paged = paginate(results, page, pageSize);

    return res.json({
      query: q,
      source: source,
      hasImage: hasImage,
      total: paged.total,
      totalPages: paged.totalPages,
      page: paged.page,
      pageSize: paged.pageSize,
      results: paged.results,
      warnings: warnings
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Search failed" });
  }
});

app.get("/api/artwork/:source/:id", async function (req, res) {
  try {
    const source = safeString(req.params.source).toLowerCase();
    const id = safeString(req.params.id);

    if (source === "met") {
      const data = await fetchJson(
        "https://collectionapi.metmuseum.org/public/collection/v1/objects/" + encodeURIComponent(id)
      );
      return res.json(normalizeMet(data));
    }

    if (source === "harvard") {
      if (!HARVARD_API_KEY) {
        return res.status(500).json({ error: "HARVARD_API_KEY is missing on server" });
      }
      const data = await fetchJson(
        "https://api.harvardartmuseums.org/object/" +
          encodeURIComponent(id) +
          "?apikey=" +
          encodeURIComponent(HARVARD_API_KEY)
      );
      return res.json(normalizeHarvard(data));
    }

    return res.status(400).json({ error: "Invalid source" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch artwork details" });
  }
});

app.get("/api/artist/:name", async function (req, res) {
  try {
    const name = safeString(req.params.name).trim();
    if (!name) return res.status(400).json({ error: "Artist name is required" });

    const wikiUrl = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(name);
    const data = await fetchJson(wikiUrl);

    return res.json({
      title: safeString(data.title) || name,
      extract: safeString(data.extract) || "No biography available.",
      url:
        data &&
        data.content_urls &&
        data.content_urls.desktop &&
        data.content_urls.desktop.page
          ? safeString(data.content_urls.desktop.page)
          : ""
    });
  } catch (err) {
    return res.json({
      title: safeString(req.params.name),
      extract: "No biography available.",
      url: ""
    });
  }
});

app.get("/api/artist/:name/works", async function (req, res) {
  try {
    const name = safeString(req.params.name).trim();
    const source = safeString(req.query.source || "both").toLowerCase();

    if (!name) return res.status(400).json({ error: "Artist name is required" });
    if (!["met", "harvard", "both"].includes(source)) {
      return res.status(400).json({ error: "source must be met, harvard, or both" });
    }

    let works = [];

    if (source === "met" || source === "both") {
      const metPool = await fetchMetCandidates(name, true, 80);
      const filtered = metPool.filter(function (item) {
        return item.artist.toLowerCase().includes(name.toLowerCase());
      });
      works = works.concat(filtered);
    }

    if (source === "harvard" || source === "both") {
      if (HARVARD_API_KEY) {
        const url =
          "https://api.harvardartmuseums.org/object?person=" +
          encodeURIComponent(name) +
          "&size=40&page=1&apikey=" +
          encodeURIComponent(HARVARD_API_KEY);

        const data = await fetchJson(url);
        const records = Array.isArray(data.records) ? data.records : [];
        works = works.concat(records.map(normalizeHarvard).filter(function (item) {
          return Boolean(item.image);
        }));
      }
    }

    works = works.slice(0, 20);

    return res.json({
      artist: name,
      total: works.length,
      results: works
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch related works" });
  }
});

app.get("/health", function (req, res) {
  res.json({ ok: true });
});

app.listen(PORT, function () {
  console.log("Art Explorer server running on port " + PORT);
});