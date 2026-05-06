const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
loadLocalEnv();

const PORT = process.env.PORT || 8080;
const HARVARD_API_KEY = process.env.HARVARD_API_KEY || "";

app.use(express.static("public"));
app.use(express.json());

const MUSEUM_COORDS = {
  met: {
    lat: 40.7794,
    lng: -73.9632,
    name: "The Metropolitan Museum of Art",
    address: "1000 Fifth Avenue, New York, NY 10028"
  },
  harvard: {
    lat: 42.3744,
    lng: -71.1143,
    name: "Harvard Art Museums",
    address: "32 Quincy Street, Cambridge, MA 02138"
  }
};
const responseCache = new Map();

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach(function (line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separator = trimmed.indexOf("=");
    if (separator === -1) return;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

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
    museumAddress: MUSEUM_COORDS.met.address,
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
    museumAddress: MUSEUM_COORDS.harvard.address,
    museumUrl: safeString(record.url),
    lat: MUSEUM_COORDS.harvard.lat,
    lng: MUSEUM_COORDS.harvard.lng
  };
}

function hasArtworkImage(item) {
  return Boolean(item && item.image && String(item.image).trim());
}

function matchesImagePreference(item, hasImage) {
  return hasArtworkImage(item) === hasImage;
}

function artistSearchTerms(name) {
  const cleaned = safeString(name)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter(Boolean);
  const lastName = parts.length ? parts[parts.length - 1] : cleaned;

  return {
    fullName: cleaned.toLowerCase(),
    lastName: lastName.toLowerCase()
  };
}

function artistMatches(item, terms) {
  const artist = safeString(item.artist).toLowerCase();
  if (!artist || artist === "unknown artist") return false;
  return Boolean(
    (terms.fullName && artist.includes(terms.fullName)) ||
      (terms.lastName && artist.includes(terms.lastName))
  );
}

function searchRelevanceScore(item, query) {
  const q = safeString(query).toLowerCase();
  const title = safeString(item.title).toLowerCase();
  const artist = safeString(item.artist).toLowerCase();
  const queryTerms = q.split(/\s+/).filter(Boolean);
  const lastQueryTerm = queryTerms.length ? queryTerms[queryTerms.length - 1] : q;

  if (artist === q) return 0;
  if (artist.endsWith(" " + q) || artist === lastQueryTerm || artist.endsWith(" " + lastQueryTerm)) return 1;
  if (artist.startsWith(q)) return 2;
  if (artist.includes(q)) return 3;
  if (lastQueryTerm && artist.includes(lastQueryTerm)) return 4;
  if (title === q) return 5;
  if (title.startsWith(q)) return 6;
  if (title.includes(q)) return 7;
  return 8;
}

function matchesQueryText(item, query) {
  const q = safeString(query).toLowerCase().trim();
  if (!q) return false;

  const title = safeString(item.title).toLowerCase();
  const artist = safeString(item.artist).toLowerCase();
  if (!title && !artist) return false;

  const queryTerms = q.split(/\s+/).filter(Boolean);
  if (!queryTerms.length) return false;

  const artistLastName =
    artist && artist !== "unknown artist" ? artistSearchTerms(item.artist).lastName : "";

  return queryTerms.some(function (term) {
    if (term.length <= 4) {
      return (artist && artist.includes(term)) || (artistLastName && artistLastName.startsWith(term));
    }
    return (title && title.includes(term)) || (artist && artist.includes(term));
  });
}

function matchesQueryStrict(item, query) {
  const q = safeString(query).toLowerCase().trim();
  if (!q) return false;
  const title = safeString(item.title).toLowerCase();
  const artist = safeString(item.artist).toLowerCase();
  if (!title && !artist) return false;
  const queryTerms = q.split(/\s+/).filter(Boolean);
  if (!queryTerms.length) return false;
  return queryTerms.some(function (term) {
    return (title && title.includes(term)) || (artist && artist.includes(term));
  });
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function shouldRetryStatus(status) {
  return status === 403 || status === 429 || status >= 500;
}

async function fetchJson(url, options) {
  const retryCount = options && Number.isInteger(options.retries) ? options.retries : 2;
  const retryDelay = options && Number.isInteger(options.retryDelay) ? options.retryDelay : 350;
  const cacheMs = options && Number.isInteger(options.cacheMs) ? options.cacheMs : 0;
  const cached = responseCache.get(url);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let lastStatus = 0;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ArtExplorer/1.0)",
        "Accept": "application/json"
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (cacheMs > 0) {
        responseCache.set(url, {
          expiresAt: Date.now() + cacheMs,
          data: data
        });
      }
      return data;
    }

    lastStatus = response.status;
    if (!shouldRetryStatus(response.status) || attempt === retryCount) break;
    await sleep(retryDelay * (attempt + 1));
  }

  throw new Error("Request failed with status " + lastStatus);
}

async function fetchJsonList(urls) {
  const results = [];
  const batchSize = 5;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async function (url) {
        try {
          return await fetchJson(url, { retries: 2, retryDelay: 500, cacheMs: 60 * 60 * 1000 });
        } catch (err) {
          return null;
        }
      })
    );
    results.push.apply(results, batchResults);
  }

  return results;
}

async function fetchMetSearch(query, hasImage) {
  const baseUrl =
    "https://collectionapi.metmuseum.org/public/collection/v1/search?q=" +
    encodeURIComponent(query);

  if (!hasImage) {
    return fetchJson(baseUrl, { retries: 4, retryDelay: 1000, cacheMs: 5 * 60 * 1000 });
  }

  try {
    return await fetchJson(baseUrl + "&hasImages=true", { retries: 4, retryDelay: 1000, cacheMs: 5 * 60 * 1000 });
  } catch (err) {
    return fetchJson(baseUrl, { retries: 4, retryDelay: 1000, cacheMs: 5 * 60 * 1000 });
  }
}

async function fetchMetCandidates(query, hasImage, maxCount) {
  const searchData = await fetchMetSearch(query, hasImage);
  const ids = Array.isArray(searchData.objectIDs) ? searchData.objectIDs.slice(0, maxCount) : [];
  if (ids.length === 0) return [];

  const detailUrls = ids.map(function (id) {
    return "https://collectionapi.metmuseum.org/public/collection/v1/objects/" + encodeURIComponent(String(id));
  });
  const details = await fetchJsonList(detailUrls);
  const normalized = details.map(function (obj) {
    return obj ? normalizeMet(obj) : null;
  });

  return normalized.filter(Boolean).filter(function (item) {
    return matchesImagePreference(item, hasImage);
  });
}

async function fetchHarvardJson(url) {
  return fetchJson(url, { retries: 1, retryDelay: 250 });
}

async function fetchWikidataSuggestion(query) {
  const url =
    "https://www.wikidata.org/w/api.php?action=wbsearchentities&language=en&format=json&limit=5&search=" +
    encodeURIComponent(query);
  const data = await fetchJson(url, { retries: 1, retryDelay: 200, cacheMs: 5 * 60 * 1000 });
  const results = data && Array.isArray(data.search) ? data.search : [];
  if (!results.length) return "";

  const lowerQuery = safeString(query).toLowerCase();
  const personLike = results.find(function (item) {
    const label = safeString(item && item.label).toLowerCase();
    const desc = safeString(item && item.description).toLowerCase();
    const parts = label.split(/\s+/).filter(Boolean);
    const lastName = parts.length ? parts[parts.length - 1] : "";
    if (parts.length < 2) return false;
    if (!lastName.startsWith(lowerQuery)) return false;
    return desc.includes("artist") || desc.includes("painter") || desc.includes("sculptor");
  });

  if (personLike && personLike.label) return safeString(personLike.label);
  return "";
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

  const data = await fetchHarvardJson(url);
  const records = Array.isArray(data.records) ? data.records : [];
  const normalized = records.map(normalizeHarvard);

  return normalized.filter(function (item) {
    return matchesImagePreference(item, hasImage);
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
    let failed = 0;
    const warnings = [];

    if (source === "met" || source === "both") {
      attempted += 1;
      try {
        const metResults = await fetchMetCandidates(q, hasImage, maxCandidatesPerSource);
        results = results.concat(metResults);
      } catch (err) {
        failed += 1;
        warnings.push("MET failed: " + (err.message || "unknown error"));
      }
    }

    if (source === "both" && !HARVARD_API_KEY) {
      warnings.push("HARVARD skipped: HARVARD_API_KEY is missing on server");
    } else if (source === "harvard" || source === "both") {
      attempted += 1;
      try {
        const harvardResults = await fetchHarvardCandidates(q, hasImage, maxCandidatesPerSource);
        results = results.concat(harvardResults);
      } catch (err) {
        failed += 1;
        warnings.push("HARVARD failed: " + (err.message || "unknown error"));
      }
    }

    // If all attempted sources failed, return an error.
    if (attempted > 0 && failed === attempted) {
      return res.status(502).json({
        error: "All sources failed",
        details: warnings
      });
    }

    results = results.filter(function (item) {
      return matchesImagePreference(item, hasImage);
    });

    let filteredResults = results.filter(function (item) {
      return matchesQueryText(item, q);
    });

    const strictResults = results.filter(function (item) {
      return matchesQueryStrict(item, q);
    });
    if ((q.length > 4 || /\d/.test(q)) && strictResults.length === 0) {
      filteredResults = [];
    }

    if (q.length <= 4) {
      try {
        const suggestion = await fetchWikidataSuggestion(q);
        const suggestedQuery =
          suggestion && suggestion.toLowerCase() !== q.toLowerCase() ? suggestion : "";
        if (suggestedQuery) {
          const suggestedLastName = artistSearchTerms(suggestedQuery).lastName;
          if (!suggestedLastName || !suggestedLastName.startsWith(q.toLowerCase())) {
            results = filteredResults;
          } else {
          let suggestedResults = [];
          if (source === "met" || source === "both") {
            suggestedResults = suggestedResults.concat(
              await fetchMetCandidates(suggestedQuery, hasImage, maxCandidatesPerSource)
            );
          }
          if (source === "harvard" || source === "both") {
            suggestedResults = suggestedResults.concat(
              await fetchHarvardCandidates(suggestedQuery, hasImage, maxCandidatesPerSource)
            );
          }

          suggestedResults = suggestedResults.filter(function (item) {
            return matchesImagePreference(item, hasImage) && matchesQueryText(item, suggestedQuery);
          });

            if (suggestedResults.length > 0) {
              filteredResults = suggestedResults;
              warnings.push("Used suggestion: " + suggestedQuery);
            }
          }
        }
      } catch (err) {
        warnings.push("Suggestion lookup failed: " + (err.message || "unknown error"));
      }
    }

    results = filteredResults;

    results.sort(function (a, b) {
      const aScore = searchRelevanceScore(a, q);
      const bScore = searchRelevanceScore(b, q);
      if (aScore !== bScore) return aScore - bScore;

      const aTitle = (a.title || "").toLowerCase();
      const bTitle = (b.title || "").toLowerCase();
      const aArtist = (a.artist || "").toLowerCase();
      const bArtist = (b.artist || "").toLowerCase();

      if (aArtist !== bArtist) return aArtist.localeCompare(bArtist);
      return aTitle.localeCompare(bTitle);
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
      image:
        data && data.thumbnail && data.thumbnail.source
          ? safeString(data.thumbnail.source)
          : "",
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
      image: "",
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
    const terms = artistSearchTerms(name);
    const searchName = terms.fullName || name;

    if (source === "met" || source === "both") {
      const metPool = await fetchMetCandidates(searchName, true, 80);
      const filtered = metPool.filter(function (item) {
        return artistMatches(item, terms);
      });
      works = works.concat(filtered);
    }

    if (source === "harvard" || source === "both") {
      if (HARVARD_API_KEY) {
        const harvardPool = await fetchHarvardCandidates(searchName, true, 80);
        works = works.concat(harvardPool.filter(function (item) {
          return artistMatches(item, terms);
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
