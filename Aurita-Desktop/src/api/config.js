// ============================================================
//  Aurita Desktop — modo de conexión
// ============================================================
//
//  El usuario elige en el login si habla con Jellyfin directamente
//  o con el servidor intermediario de Aurita:
//
//  Modo 'direct':   URL → Jellyfin:8096  (sin intermediario)
//  Modo 'service':  URL → aurita-server:3000 → Jellyfin interno
//
//  getServiceUrl() devuelve:
//    null             → service.js delega en jellyfin.js (modo direct)
//    jellyfin.baseUrl → service.js llama al intermediario (modo service)

import { jellyfin } from './jellyfin.js';

export function getServiceUrl() {
  return jellyfin.connectionMode === 'service' ? jellyfin.baseUrl : null;
}

export const SERVICE_TIMEOUT_MS = 8000;
