import { service } from './service.js';
import { cacheStore } from '../db/storage.js';
import { registerInvalidator, onPlaylistTracksChanged } from './cacheManager.js';

const TTL = 10 * 60 * 1000;

// Caché en memoria (módulo): acceso síncrono e instantáneo.
const _memCache = new Map();

export async function fetchDetail(id) {
  const itemInfo = await service.getItemInfo(id);
  const isAlbum = itemInfo.Type === 'MusicAlbum';
  const itemsRes = isAlbum ? await service.getAlbumItems(id) : await service.getPlaylistItems(id);
  return { info: itemInfo, tracks: itemsRes.Items || [] };
}

export function getCachedDetailSync(id) {
  return _memCache.get(id) ?? null;
}

export async function getCachedDetail(id) {
  if (_memCache.has(id)) return _memCache.get(id);
  return cacheStore.get('detail', id);
}

export async function prefetchDetail(id) {
  if (_memCache.has(id)) return;
  const cached = await cacheStore.get('detail', id);
  if (cached) { _memCache.set(id, cached); return; }
  const data = await fetchDetail(id);
  _memCache.set(id, data);
  cacheStore.set('detail', id, data, TTL);
}

export async function setDetailCache(id, data) {
  _memCache.set(id, data);
  // Registrar invalidador para este ID específico (llamado desde cacheManager)
  registerInvalidator(`detail:${id}`, () => {
    _memCache.delete(id);
    cacheStore.delete('detail', id);
  });
  return cacheStore.set('detail', id, data, TTL);
}

/** Llamado cuando el usuario añade/quita canciones de una playlist */
export function invalidateDetail(id) {
  _memCache.delete(id);
  cacheStore.delete('detail', id);
  if (id) onPlaylistTracksChanged(id);
}
