// Configuración 100% por variables de entorno.
// El admin las pone UNA VEZ en el servicio de systemd.
// Los usuarios nunca ven nada de esto.

export const JELLYFIN_URL          = (process.env.JELLYFIN_URL          || 'http://localhost:8096').replace(/\/+$/, '');
export const JELLYFIN_EXTERNAL_URL = (process.env.JELLYFIN_EXTERNAL_URL || '').replace(/\/+$/, '');
export const PORT                  = parseInt(process.env.PORT || '3000');
export const SYNC_INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES || '5');
