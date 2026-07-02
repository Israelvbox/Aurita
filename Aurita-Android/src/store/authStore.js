import { create } from 'zustand';
import { jellyfin } from '../api/jellyfin.js';

export const useAuthStore = create((set) => ({
  user:   null,
  status: 'idle', // idle | checking | authenticated | unauthenticated
  error:  null,

  async restore() {
    set({ status: 'checking' });
    const ok = await jellyfin.restoreSession();
    if (ok) {
      // Cargar perfil del usuario para tener el nombre disponible en la UI
      try {
        const userData = await jellyfin.request(`/Users/${jellyfin.userId}`);
        set({ user: userData, status: 'authenticated' });
      } catch {
        set({ status: 'authenticated' });
      }
      // Notificar al servidor que hay sesión activa para que sincronice
      // si aún no lo ha hecho (pasa cuando el cliente restaura sesión
      // directamente desde Jellyfin sin pasar por /Users/AuthenticateByName)
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

  // mode: 'direct' (Jellyfin) | 'service' (intermediario Aurita)
  async login(serverUrl, username, password, mode = 'direct') {
    set({ status: 'checking', error: null });
    try {
      const user = await jellyfin.login(serverUrl, username, password, mode);
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
    set({ user: null, status: 'unauthenticated' });
  },
}));
