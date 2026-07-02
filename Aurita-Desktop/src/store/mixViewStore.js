import { create } from 'zustand';

// Los "mixes" del Inicio (mix diario, recomendados) no son playlists reales
// de Jellyfin — se generan en el cliente a partir del historial de escucha.
// Este store guarda temporalmente sus canciones para que la vista de detalle
// (MixView) las pueda mostrar sin tener que recalcularlas.
export const useMixViewStore = create((set, get) => ({
  current: null, // { id, title, items }

  open(mix) {
    set({ current: mix });
  },

  get(id) {
    const c = get().current;
    return c && c.id === id ? c : null;
  },
}));
