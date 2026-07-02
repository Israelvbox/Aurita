// Capa de almacenamiento unificada. En Electron usa SQLite (vía window.aurita,
// expuesto por preload.js). En navegador / Android (Capacitor) usa IndexedDB.
// La interfaz pública es la misma para el resto de la app.

const isElectron = typeof window !== 'undefined' && window.aurita?.isElectron;

const DB_NAME = 'aurita';
const DB_VERSION = 1;
let idbPromise = null;

function openIdb() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('secure_kv')) db.createObjectStore('secure_kv');
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
      if (!db.objectStoreNames.contains('listen_history')) {
        const store = db.createObjectStore('listen_history', { keyPath: 'id', autoIncrement: true });
        store.createIndex('played_at', 'played_at');
        store.createIndex('item_id', 'item_id');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}

async function idbGet(store, key) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(store, key, value) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearStore(store) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export const secureStore = {
  async set(key, value) {
    if (isElectron) return window.aurita.secure.set(key, value);
    return idbSet('secure_kv', key, value); // En web no hay cifrado nativo; aceptable para uso local
  },
  async get(key) {
    if (isElectron) return window.aurita.secure.get(key);
    return idbGet('secure_kv', key);
  },
  async clear() {
    if (isElectron) return window.aurita.secure.clear();
    return idbClearStore('secure_kv');
  },
};

export const cacheStore = {
  async set(scope, key, value, ttlMs) {
    const json = JSON.stringify(value);
    if (isElectron) return window.aurita.cache.set(scope, key, json, ttlMs);
    return idbSet('cache', `${scope}::${key}`, { json, expiresAt: ttlMs ? Date.now() + ttlMs : null });
  },
  async get(scope, key) {
    if (isElectron) {
      const json = await window.aurita.cache.get(scope, key);
      return json ? JSON.parse(json) : null;
    }
    const row = await idbGet('cache', `${scope}::${key}`);
    if (!row) return null;
    if (row.expiresAt && row.expiresAt < Date.now()) return null;
    return JSON.parse(row.json);
  },
  async delete(scope, key) {
    if (isElectron) return window.aurita.cache.delete(scope, key);
    return idbSet('cache', `${scope}::${key}`, { json: 'null', expiresAt: 1 }); // expira ya
  },
};

export const historyStore = {
  async add(entry) {
    if (isElectron) return window.aurita.history.add(entry);
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('listen_history', 'readwrite');
      tx.objectStore('listen_history').add({ ...entry, played_at: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },
  async recentGenres(sinceDays = 7) {
    if (isElectron) return window.aurita.history.recentGenres(sinceDays);
    const db = await openIdb();
    const since = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('listen_history', 'readonly');
      const idx = tx.objectStore('listen_history').index('played_at');
      const range = IDBKeyRange.lowerBound(since);
      const counts = {};
      idx.openCursor(range).onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          for (const g of cursor.value.genres || []) counts[g] = (counts[g] || 0) + 1;
          cursor.continue();
        } else resolve(counts);
      };
      tx.onerror = () => reject(tx.error);
    });
  },
  async topItemsByGenre(genre, limit = 30) {
    if (isElectron) return window.aurita.history.topItemsByGenre(genre, limit);
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('listen_history', 'readonly');
      const items = {};
      tx.objectStore('listen_history').openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const v = cursor.value;
          if ((v.genres || []).includes(genre)) {
            items[v.item_id] = items[v.item_id] || { ...v, plays: 0 };
            items[v.item_id].plays += 1;
          }
          cursor.continue();
        } else {
          resolve(Object.values(items).sort((a, b) => b.plays - a.plays).slice(0, limit));
        }
      };
      tx.onerror = () => reject(tx.error);
    });
  },
};
