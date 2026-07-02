import { jellyfin } from './jellyfin.js';
import { getServiceUrl, SERVICE_TIMEOUT_MS } from './config.js';
import { searchLocal, isIndexReady, loadLocalIndex, getGenresLocal } from './localIndex.js';

let _notifiedUnauthorized = false;
function notifyUnauthorized() {
  if (_notifiedUnauthorized) return;
  _notifiedUnauthorized = true;
  window.dispatchEvent(new CustomEvent('aurita:unauthorized'));
  setTimeout(() => { _notifiedUnauthorized = false; }, 5000);
}

async function serviceRequest(path, query = {}) {
  const url = new URL(`${getServiceUrl()}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVICE_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'X-Jellyfin-Token':  jellyfin.token  || '',
        'X-Jellyfin-UserId': jellyfin.userId || '',
        'X-Jellyfin-Url':    jellyfin.baseUrl || '',
      },
    });
    if (!res.ok) {
      if (res.status === 401) notifyUnauthorized();
      throw new Error(`Aurita ${path}: HTTP ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export const service = {

  async getStartupData() {
    try { return await serviceRequest('/startup'); }
    catch { return null; }
  },

  async refreshLocalIndex() {
    return loadLocalIndex();
  },

  searchItems(term, limit = 40) {
    const local = searchLocal(term, limit);
    if (local) {
      loadLocalIndex().catch(() => {});
      return Promise.resolve(local);
    }
    if (getServiceUrl()) {
      return serviceRequest('/search', { q: term, limit }).then(res => {
        if ((res.Items?.length ?? 0) === 0) return jellyfin.searchItems(term, limit);
        return res;
      });
    }
    return jellyfin.searchItems(term, limit);
  },

  getGenres() {
    const local = getGenresLocal();
    if (local) return Promise.resolve(local);
    return serviceRequest('/genres');
  },

  getAllAudio(limit = 5000) {
    if (isIndexReady()) return Promise.resolve({ Items: [] });
    return jellyfin.getAllAudio(limit);
  },

  getAllAlbumsGenres(limit = 3000) {
    if (isIndexReady()) return Promise.resolve({ Items: [] });
    return jellyfin.getAllAlbumsGenres(limit);
  },

  getItemsByGenre(genre, limit = 50) {
    return serviceRequest('/genres/songs', { genre, limit });
  },

  getInstantMix(itemId, limit = 20) {
    return serviceRequest(`/items/${itemId}/instantmix`, { limit });
  },

  getRecentPlaylists(limit = 4) {
    return serviceRequest('/home/playlists', { limit });
  },

  getItemInfo(itemId) {
    return serviceRequest(`/items/${itemId}`);
  },

  getAlbumItems(albumId) {
    return serviceRequest(`/albums/${albumId}/items`);
  },

  getPlaylistItems(playlistId) {
    return serviceRequest(`/playlists/${playlistId}/items`);
  },

  getArtistAlbums(artistId, limit = 30) {
    return serviceRequest(`/artists/${artistId}/albums`, { limit });
  },

  getArtistTopSongs(artistId, limit = 10) {
    return serviceRequest(`/artists/${artistId}/topsongs`, { limit });
  },

  getUserPlaylists() {
    return serviceRequest('/playlists');
  },

  getFavoriteSongs(limit = 500) {
    return serviceRequest('/favorites', { limit });
  },
};
