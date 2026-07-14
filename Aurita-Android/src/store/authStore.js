import { create } from 'zustand';
import { jellyfin } from '../api/jellyfin.js';

export const useAuthStore = create((set) => ({
  user:   null,
  status: 'idle',
  error:  null,

  async restore() {
    set({ status: 'checking' });
    const ok = await jellyfin.restoreSession();
    if (ok) {
      try {
        const userData = await jellyfin.request(`/Users/${jellyfin.userId}`);
        set({ user: userData, status: 'authenticated' });
      } catch {
        set({ status: 'authenticated' });
      }
      const { getServiceUrl } = await import('../api/config.js');
      const serviceUrl = getServiceUrl();
      if (serviceUrl) {
        fetch(`${serviceUrl}/sync/ping`, {
          method: 'POST',
          headers: {
            'X-Jellyfin-Token':  jellyfin.token  || '',
            'X-Jellyfin-UserId': jellyfin.userId || '',
          },
        }).catch(() => {});
      }
    } else {
      set({ status: 'unauthenticated' });
    }
    return ok;
  },

  async login(serverUrl, username, password) {
    set({ status: 'checking', error: null });
    try {
      const user = await jellyfin.login(serverUrl, username, password);
      set({ user, status: 'authenticated', error: null });
    } catch (err) {
      set({ status: 'unauthenticated', error: err.message });
      throw err;
    }
  },

  async reconnect() {
    set({ status: 'checking', error: null });
    try {
      await jellyfin.restoreSession();
      await jellyfin.request(`/Users/${jellyfin.userId}`);
      set({ status: 'authenticated' });
      return true;
    } catch {
      set({ status: 'unauthenticated', error: 'No se pudo reconectar con el servidor.' });
      return false;
    }
  },

  async logout() {
    await jellyfin.logout();
    const { clearCache } = await import('../api/cacheManager.js');
    clearCache();
    const { cacheStore } = await import('../db/storage.js');
    await cacheStore.delete('player', 'player_queue');
    set({ user: null, status: 'unauthenticated' });
  },
}));
