/**
 * service.js — capa de servicio de Aurita
 *
 * Decide en cada llamada qué fuente usar:
 *   1. Índice local (sin red, <1ms)       — búsqueda, artistas, géneros
 *   2. Servidor intermediario (<50ms LAN) — playlists, favoritos, startup
 *   3. Jellyfin directo                   — fallback y modo sin servidor
 *
 * El audio y las imágenes SIEMPRE van directo a Jellyfin: añadir un proxy
 * solo añadiría latencia sin ningún beneficio.
 */

import { jellyfin } from './jellyfin.js';
import { getServiceUrl, SERVICE_TIMEOUT_MS } from './config.js';
import { searchLocal, isIndexReady, loadLocalIndex, getGenresLocal } from './localIndex.js';

// ── 401 global: si el servidor dice sesión inválida, mandamos al login ──
let _notifiedUnauthorized = false;
function notifyUnauthorized() {
  if (_notifiedUnauthorized) return;
  _notifiedUnauthorized = true;
  window.dispatchEvent(new CustomEvent('aurita:unauthorized'));
  setTimeout(() => { _notifiedUnauthorized = false; }, 5000);
}

// ── HTTP helper ──────────────────────────────────────────────────────
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

// ── API pública ──────────────────────────────────────────────────────
export const service = {

  // ── Startup: todo en una petición ─────────────────────────────────
  async getStartupData() {
    if (!getServiceUrl()) return null;
    try { return await serviceRequest('/startup'); }
    catch { return null; }
  },

  // ── Índice local: descarga la biblioteca para uso offline ──────────
  async refreshLocalIndex() {
    return loadLocalIndex();
  },

  // ── Búsqueda ───────────────────────────────────────────────────────
  // Prioridad: índice local → servidor → Jellyfin
  // En índice local la respuesta es instantánea (<1ms).
  // En paralelo, si hay índice nuevo disponible en el servidor, lo baja
  // en segundo plano para la próxima búsqueda.
  searchItems(term, limit = 40) {
    // 1. Índice local (instantáneo)
    const local = searchLocal(term, limit);
    if (local) {
      // Revalidar el índice en segundo plano (detecta nuevas syncs)
      loadLocalIndex().catch(() => {});
      return Promise.resolve(local);
    }
    // 2. Servidor intermediario (con fallback a Jellyfin si BD vacía)
    if (getServiceUrl()) {
      return serviceRequest('/search', { q: term, limit }).then(res => {
        if ((res.Items?.length ?? 0) === 0) return jellyfin.searchItems(term, limit);
        return res;
      });
    }
    // 3. Jellyfin directo
    return jellyfin.searchItems(term, limit);
  },

  // ── Géneros ────────────────────────────────────────────────────────
  getGenres() {
    const local = getGenresLocal();
    if (local) return Promise.resolve(local);
    if (getServiceUrl()) return serviceRequest('/genres');
    return jellyfin.getGenres();
  },

  getAllAudio(limit = 5000) {
    if (getServiceUrl() || isIndexReady()) return Promise.resolve({ Items: [] });
    return jellyfin.getAllAudio(limit);
  },

  getAllAlbumsGenres(limit = 3000) {
    if (getServiceUrl() || isIndexReady()) return Promise.resolve({ Items: [] });
    return jellyfin.getAllAlbumsGenres(limit);
  },

  getItemsByGenre(genre, limit = 50) {
    if (getServiceUrl()) return serviceRequest('/genres/songs', { genre, limit });
    return jellyfin.getItemsByGenre(genre, limit);
  },

  // ── Cola automática (instant mix) ─────────────────────────────────
  getInstantMix(itemId, limit = 20) {
    if (getServiceUrl()) return serviceRequest(`/items/${itemId}/instantmix`, { limit });
    return jellyfin.getInstantMix(itemId, limit);
  },

  // ── Home: playlists recientes ──────────────────────────────────────
  getRecentPlaylists(limit = 4) {
    if (getServiceUrl()) return serviceRequest('/home/playlists', { limit });
    return jellyfin.getRecentPlaylists(limit);
  },

  // ── Detalle ────────────────────────────────────────────────────────
  getItemInfo(itemId) {
    if (getServiceUrl()) return serviceRequest(`/items/${itemId}`);
    return jellyfin.getItemInfo(itemId);
  },

  getAlbumItems(albumId) {
    if (getServiceUrl()) return serviceRequest(`/albums/${albumId}/items`);
    return jellyfin.getAlbumItems(albumId);
  },

  getPlaylistItems(playlistId) {
    if (getServiceUrl()) return serviceRequest(`/playlists/${playlistId}/items`);
    return jellyfin.getPlaylistItems(playlistId);
  },

  // ── Artistas ───────────────────────────────────────────────────────
  getArtistAlbums(artistId, limit = 30) {
    if (getServiceUrl()) return serviceRequest(`/artists/${artistId}/albums`, { limit });
    return jellyfin.getArtistAlbums(artistId, limit);
  },

  getArtistTopSongs(artistId, limit = 10) {
    if (getServiceUrl()) return serviceRequest(`/artists/${artistId}/topsongs`, { limit });
    return jellyfin.getArtistTopSongs(artistId, limit);
  },

  // ── Biblioteca ─────────────────────────────────────────────────────
  getUserPlaylists() {
    if (getServiceUrl()) return serviceRequest('/playlists');
    return jellyfin.getUserPlaylists();
  },

  getFavoriteSongs(limit = 500) {
    if (getServiceUrl()) return serviceRequest('/favorites', { limit });
    return jellyfin.getFavoriteSongs(limit);
  },
};
