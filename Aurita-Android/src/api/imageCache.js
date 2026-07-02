const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const IMAGE_DB = 'aurita_images';
const STORE = 'images';
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IMAGE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function getCached(key) {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      const entry = req.result;
      if (!entry) return resolve(null);
      if (entry.expiresAt < Date.now()) {
        tx.objectStore(STORE).delete(key);
        return resolve(null);
      }
      resolve(entry.blob);
    };
    req.onerror = () => resolve(null);
  });
}

function putCache(key, blob) {
  openDb().then((db) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ blob, expiresAt: Date.now() + CACHE_TTL }, key);
  }).catch(() => {});
}

export async function fetchCachedImage(url) {
  if (!url) return null;
  const key = url.split('?')[0];
  const cached = await getCached(key);
  if (cached) return URL.createObjectURL(cached);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    putCache(key, blob);
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function pruneExpired() {
  openDb().then((db) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.expiresAt < Date.now()) cursor.delete();
        cursor.continue();
      }
    };
  }).catch(() => {});
}
