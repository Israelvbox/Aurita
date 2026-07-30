import { service } from './service.js';
import { cacheStore } from '../db/storage.js';
import { registerInvalidator, onPlaylistTracksChanged } from './cacheManager.js';

const TTL = 10 * 60 * 1000;

const _memCache = new Map();
const _pendingFetches = new Map();

const PAGE_SIZE = 200;

async function fetchAllPlaylistItems(id) {
  let allItems = [];
  let startIndex = 0;
  let total = null;
  while (true) {
    const res = await service.getPlaylistItems(id, startIndex, PAGE_SIZE);
    const items = res.Items || [];
    allItems = allItems.concat(items);
    if (total === null) total = res.TotalRecordCount || items.length;
    startIndex += PAGE_SIZE;
    if (startIndex >= total || items.length < PAGE_SIZE) break;
  }
  return allItems;
}

async function _fetchAndCache(id) {
  const cached = await cacheStore.get('detail', id);
  if (cached) { _memCache.set(id, cached); return cached; }
  const [itemInfo, playlistItems] = await Promise.all([
    service.getItemInfo(id),
    fetchAllPlaylistItems(id).catch(() => null),
  ]);
  let tracks = playlistItems;
  if (!tracks && itemInfo?.Type === 'MusicAlbum') {
    const albumRes = await service.getAlbumItems(id);
    tracks = albumRes.Items || [];
  }
  const data = { info: itemInfo, tracks: tracks || [] };
  _memCache.set(id, data);
  cacheStore.set('detail', id, data, TTL).catch(() => {});
  return data;
}

export async function fetchDetail(id) {
  if (_pendingFetches.has(id)) return _pendingFetches.get(id);
  const promise = _fetchAndCache(id);
  _pendingFetches.set(id, promise);
  try {
    return await promise;
  } finally {
    _pendingFetches.delete(id);
  }
}

export function getCachedDetailSync(id) {
  return _memCache.get(id) ?? null;
}

export async function getCachedDetail(id) {
  if (_memCache.has(id)) return _memCache.get(id);
  if (_pendingFetches.has(id)) return _pendingFetches.get(id);
  return cacheStore.get('detail', id);
}

export async function prefetchDetail(id) {
  if (_memCache.has(id)) return;
  if (_pendingFetches.has(id)) return _pendingFetches.get(id);
  const promise = _fetchAndCache(id);
  _pendingFetches.set(id, promise);
  try {
    return await promise;
  } finally {
    _pendingFetches.delete(id);
  }
}

export async function prefetchDetails(ids) {
  await Promise.allSettled(ids.map(prefetchDetail));
}

export async function setDetailCache(id, data) {
  _memCache.set(id, data);
  registerInvalidator(`detail:${id}`, () => {
    _memCache.delete(id);
    cacheStore.delete('detail', id);
  });
  return cacheStore.set('detail', id, data, TTL);
}

export function invalidateDetail(id) {
  _memCache.delete(id);
  cacheStore.delete('detail', id);
  if (id) onPlaylistTracksChanged(id);
}
