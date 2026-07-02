import { create } from 'zustand';
import { jellyfin } from '../api/jellyfin.js';
import { service } from '../api/service.js';
import { registerInvalidator } from '../api/cacheManager.js';

let _itemsCache = [];

// Registrar revalidación silenciosa al volver al primer plano
// (puede haber dado like desde otro dispositivo mientras la app estaba en fondo)
registerInvalidator('favorites_revalidate', () => {
  // No limpiamos el caché, solo lo marcamos como stale para que el próximo
  // visit() o revalidate() lo actualice. Llamamos revalidate directamente.
  useFavoritesStore.getState().revalidate();
});

export const useFavoritesStore = create((set, get) => ({
  ids:    new Set(),
  loaded: false,

  async hydrate() {
    if (get().loaded) return;
    try {
      const res = await service.getFavoriteSongs();
      _itemsCache = res.Items || [];
      set({ ids: new Set(_itemsCache.map(i => i.Id)), loaded: true });
    } catch (err) {
      console.warn('[Aurita] No se pudieron cargar tus favoritos:', err);
    }
  },

  // Llamado desde App.jsx cuando el startup ya trae los favoritos:
  // evita una petición de red extra al arrancar.
  setFromStartup(ids, items) {
    if (get().loaded) return; // ya teníamos datos, no pisamos
    _itemsCache = items || [];
    set({ ids, loaded: true });
  },

  // Para que Favorites.jsx pueda obtener los ítems sin nueva petición
  getCachedItems() { return _itemsCache; },

  isFavorite(id) { return get().ids.has(id); },

  async toggle(id) {
    const wasFav = get().ids.has(id);

    // Actualización optimista: UI instantánea antes de confirmar red
    set((s) => {
      const next = new Set(s.ids);
      if (wasFav) next.delete(id); else next.add(id);
      return { ids: next };
    });
    // Actualizar también la caché de ítems
    if (wasFav) {
      _itemsCache = _itemsCache.filter(i => i.Id !== id);
    }

    try {
      await jellyfin.setFavorite(id, !wasFav);
    } catch (err) {
      // Revertir si falla
      set((s) => {
        const next = new Set(s.ids);
        if (wasFav) next.add(id); else next.delete(id);
        return { ids: next };
      });
      console.warn('[Aurita] No se pudo cambiar favorito:', err);
    }
  },

  // Revalidación en segundo plano: actualiza la caché sin bloquear la UI.
  // Se llama cuando el usuario abre "Me gusta" si ya tenemos datos previos.
  async revalidate() {
    try {
      const res = await service.getFavoriteSongs();
      _itemsCache = res.Items || [];
      set({ ids: new Set(_itemsCache.map(i => i.Id)) });
    } catch { /* silencioso */ }
  },
}));

export function getFavoriteItemsCache() { return _itemsCache; }
