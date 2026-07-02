/**
 * cacheManager.js — Gestor central de invalidación de cachés
 *
 * Problema que resuelve: la app tiene cachés en múltiples capas
 * (módulos JS, Zustand stores, IndexedDB) que necesitan coordinarse
 * cuando el usuario hace una acción o cuando el servidor sincroniza
 * datos nuevos de Jellyfin.
 *
 * Patrón: cada módulo con caché se registra aquí con una función de
 * invalidación. Los callers no necesitan saber qué cachés existen,
 * solo qué tipo de evento ocurrió.
 */

import { getServiceUrl } from './config.js';
import { jellyfin } from './jellyfin.js';

// ── Registro de invalidadores ────────────────────────────────────────
// Cada módulo llama a register() en su propio fichero para apuntarse.
const _invalidators = {};

export function registerInvalidator(name, fn) {
  _invalidators[name] = fn;
}

function run(...names) {
  names.forEach(n => _invalidators[n]?.());
}

// ── Eventos de invalidación por tipo de acción ──────────────────────

/** El usuario creó o renombró una playlist */
export function onPlaylistCreated() {
  run('home', 'library');
  pingServer(); // para que el servidor invalide su startup cache
}

/** El usuario eliminó una playlist */
export function onPlaylistDeleted(id) {
  run('home', 'library');
  if (id) run(`detail:${id}`);
  pingServer();
}

/** El usuario añadió/quitó canciones de una playlist */
export function onPlaylistTracksChanged(playlistId) {
  if (playlistId) run(`detail:${playlistId}`);
}

/** La sync del servidor completó (datos nuevos de Jellyfin) */
export function onServerSyncCompleted() {
  run('home', 'library', 'genres');
  // Re-descargar el índice local con los datos nuevos.
  // Importante: hacerlo en segundo plano sin bloquear nada.
  import('./localIndex.js').then(({ loadLocalIndex }) => {
    loadLocalIndex().catch(() => {});
  });
}

/** La app volvió al primer plano */
export function onAppResumed() {
  run('favorites_revalidate');
  checkSyncVersion(); // comprueba si hubo sync nueva mientras estaba en fondo
}

// ── Detección de sync nueva ──────────────────────────────────────────

let _knownSyncVersion = parseInt(localStorage.getItem('aurita_sync_version') || '-1', 10);
let _syncCheckTimer   = null;

/** Inicia el polling de /sync/status (cada 30s en primer plano) */
export function startSyncPolling() {
  if (!getServiceUrl()) return;
  stopSyncPolling();
  checkSyncVersion();
  _syncCheckTimer = setInterval(checkSyncVersion, 30_000);
}

export function stopSyncPolling() {
  if (_syncCheckTimer) { clearInterval(_syncCheckTimer); _syncCheckTimer = null; }
}

async function checkSyncVersion() {
  const serviceUrl = getServiceUrl();
  if (!serviceUrl) return;
  try {
    const res = await fetch(`${serviceUrl}/sync/status`, {
      headers: {
        'X-Jellyfin-Token':  jellyfin.token  || '',
        'X-Jellyfin-UserId': jellyfin.userId || '',
      },
    });
    if (!res.ok) return;
    const data = await res.json();

    if (_knownSyncVersion === -1) {
      // Primera comprobación de esta sesión: guardamos la versión actual
      // como referencia para detectar cambios futuros.
      _knownSyncVersion = data.version;
      localStorage.setItem('aurita_sync_version', String(data.version));
      return;
    }

    if (data.version !== _knownSyncVersion) {
      console.log(`[CacheManager] Nueva sync detectada (v${data.version}). Refrescando cachés…`);
      _knownSyncVersion = data.version;
      localStorage.setItem('aurita_sync_version', String(data.version));
      onServerSyncCompleted();
    }
  } catch { /* silencioso */ }
}

// ── Invalidación en el servidor ──────────────────────────────────────
// Cuando el cliente hace una mutación (crear/borrar playlist etc.),
// el servidor necesita limpiar su caché de /startup para que la próxima
// petición devuelva datos frescos.
function pingServer() {
  const serviceUrl = getServiceUrl();
  if (!serviceUrl) return;
  fetch(`${serviceUrl}/startup/invalidate`, {
    method: 'POST',
    headers: {
      'X-Jellyfin-Token':  jellyfin.token  || '',
      'X-Jellyfin-UserId': jellyfin.userId || '',
    },
  }).catch(() => {});
}
