import { service } from './service.js';
import { getServiceUrl } from './config.js';
import { cacheStore } from '../db/storage.js';

const INDEX_TTL = 24 * 60 * 60 * 1000; // 1 día

function normalize(str = '') {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Una sola petición de álbumes compartida entre buildIndex y getEffectiveGenres,
// para no hacer dos llamadas HTTP iguales en la misma sesión.
let _albumGenresPromise = null;

function getAlbumGenresMap() {
  if (!_albumGenresPromise) {
    _albumGenresPromise = service.getAllAlbumsGenres().then((res) => {
      const map = {};
      for (const album of res.Items || []) {
        if (album.Genres?.length) map[album.Id] = album.Genres;
      }
      return map;
    });
  }
  return _albumGenresPromise;
}

// Una sola petición de audio compartida.
let _buildPromise = null;

async function buildIndex() {
  const [audioRes, albumGenres] = await Promise.all([
    service.getAllAudio(),
    getAlbumGenresMap(),
  ]);

  const items = audioRes.Items || [];
  const index = {};
  for (const item of items) {
    const genres = item.Genres?.length ? item.Genres : albumGenres[item.AlbumId] || [];
    for (const genre of genres) {
      const key = normalize(genre);
      if (!key) continue;
      if (!index[key]) index[key] = [];
      index[key].push(item);
    }
  }
  return index;
}

export async function getGenreIndex({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = await cacheStore.get('genre-index', 'all');
    if (cached) return cached;
  }
  if (!_buildPromise) {
    _buildPromise = buildIndex().finally(() => { _buildPromise = null; });
  }
  const index = await _buildPromise;
  cacheStore.set('genre-index', 'all', index, INDEX_TTL);
  return index;
}

// Lanza la construcción en segundo plano sin bloquear nada.
// En modo servicio no hace falta: el servidor ya resuelve los géneros.
export function warmGenreIndex() {
  if (getServiceUrl()) return;
  getGenreIndex().catch((err) =>
    console.warn('[Aurita] No se pudo precargar el índice de géneros:', err)
  );
}

export async function getSongsForGenre(genreName) {
  // En modo servicio, el servidor ya tiene el índice de géneros resuelto
  // (incluida la herencia álbum→pista); pedírselo a él es directo y rápido.
  // El índice local solo se construye en modo directo, donde no hay servidor
  // que lo precalcule.
  if (getServiceUrl()) {
    const res = await service.getItemsByGenre(genreName, 200);
    return res.Items || [];
  }
  const index = await getGenreIndex();
  return index[normalize(genreName)] || [];
}

// Devuelve los géneros "reales" de una canción: los propios, o los del álbum.
export async function getEffectiveGenres(item) {
  if (item.Genres?.length) return item.Genres;
  // En modo servicio, el servidor ya resuelve la herencia álbum→pista al
  // sincronizar; si item.Genres viene vacío es que de verdad no tiene género.
  if (getServiceUrl()) return [];
  if (!item.AlbumId) return [];
  const map = await getAlbumGenresMap();
  return map[item.AlbumId] || [];
}
