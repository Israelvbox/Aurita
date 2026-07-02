import { cacheStore } from '../db/storage.js';
import { service } from '../api/service.js';

const INDEX_TTL = 24 * 60 * 60 * 1000;

function normalize(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function getAllAlbumGenres() {
  const all = await service.getAllAlbumsGenres(3000);
  return all.Items || [];
}

async function getGenreIndex() {
  const cached = await cacheStore.get('genre-index', 'all');
  if (cached) return cached;

  const items = await getAllAlbumGenres();
  const index = {};
  for (const item of items) {
    const genres = item.Genres || [];
    for (const g of genres) {
      const key = normalize(g);
      if (!index[key]) index[key] = { name: g, count: 0 };
      index[key].count++;
    }
  }
  cacheStore.set('genre-index', 'all', index, INDEX_TTL);
  return index;
}

export function warmGenreIndex() {
  getGenreIndex().catch((err) =>
    console.warn('[Aurita] No se pudo precargar el índice de géneros:', err)
  );
}

export async function getSongsForGenre(genreName) {
  const res = await service.getItemsByGenre(genreName, 200);
  return res.Items || [];
}

export async function getEffectiveGenres(item) {
  if (item.Genres?.length) return item.Genres;
  return [];
}
