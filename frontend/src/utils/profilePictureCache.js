import { api } from '../api';

const pictureUrls = new Map();
const MAX_CACHED_PICTURES = 96;

export function loadProfilePicture(userId, filename) {
  if (!userId || !filename) return Promise.resolve(null);
  const key = `${userId}:${filename}`;
  const existing = pictureUrls.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.promise;
  }

  const entry = { url: null, lastUsed: Date.now(), promise: null };
  entry.promise = api.getProfilePicture(userId, filename)
    .then((blob) => {
      if (pictureUrls.get(key) !== entry) return null;
      entry.url = URL.createObjectURL(blob);
      entry.lastUsed = Date.now();
      trimPictureCache();
      return entry.url;
    })
    .catch((error) => {
      pictureUrls.delete(key);
      throw error;
    });
  pictureUrls.set(key, entry);
  return entry.promise;
}

function trimPictureCache() {
  if (pictureUrls.size <= MAX_CACHED_PICTURES) return;
  const oldest = [...pictureUrls.entries()]
    .filter(([, entry]) => entry.url)
    .sort((left, right) => left[1].lastUsed - right[1].lastUsed)
    .slice(0, pictureUrls.size - MAX_CACHED_PICTURES);
  oldest.forEach(([key, entry]) => {
    URL.revokeObjectURL(entry.url);
    pictureUrls.delete(key);
  });
}

export function clearProfilePictureCache() {
  pictureUrls.forEach(({ url }) => {
    if (url) URL.revokeObjectURL(url);
  });
  pictureUrls.clear();
}
