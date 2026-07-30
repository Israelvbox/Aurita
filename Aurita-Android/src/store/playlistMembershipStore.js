import { create } from 'zustand';
import { service } from '../api/service.js';

export const usePlaylistMembershipStore = create((set, get) => ({
  ids: new Set(),
  loaded: false,

  async hydrate() {
    if (get().loaded) return;
    try {
      const playlistsRes = await service.getUserPlaylists();
      const playlists = playlistsRes.Items || [];
      const playlistIds = playlists.map((p) => p.Id);
      if (playlistIds.length === 0) { set({ ids: new Set(), loaded: true }); return; }
      const res = await service.getAllPlaylistItems(playlistIds);
      const ids = new Set((res.Items || []).map((i) => i.Id));
      set({ ids, loaded: true });
    } catch (err) {
      console.warn('[Aurita] No se pudo comprobar en qué playlists están tus canciones:', err);
    }
  },

  isInAnyPlaylist(id) {
    return get().ids.has(id);
  },

  // Tras añadir/quitar una canción de cualquier playlist, se vuelve a
  // comprobar todo de golpe. Con el número de playlists típico de un uso
  // personal esto es barato y evita tener que rastrear a mano en qué otras
  // playlists podría seguir estando la canción.
  refresh() {
    set({ loaded: false });
    return get().hydrate();
  },
}));
