const FAVORITES_KEY = "artExplorerFavorites";

function readFavorites() {
  try {
    const value = localStorage.getItem(FAVORITES_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeFavorites(items) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
}

function favoriteKey(item) {
  return String(item.source) + ":" + String(item.id);
}

function isFavorite(item) {
  const key = favoriteKey(item);
  return readFavorites().some(function (entry) {
    return favoriteKey(entry) === key;
  });
}

function addFavorite(item) {
  const list = readFavorites();
  if (!isFavorite(item)) {
    list.push(item);
    writeFavorites(list);
  }
}

function removeFavorite(item) {
  const key = favoriteKey(item);
  const filtered = readFavorites().filter(function (entry) {
    return favoriteKey(entry) !== key;
  });
  writeFavorites(filtered);
}

function toggleFavorite(item) {
  if (isFavorite(item)) {
    removeFavorite(item);
    return false;
  }
  addFavorite(item);
  return true;
}