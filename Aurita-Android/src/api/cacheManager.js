import { jellyfin } from './jellyfin.js';

const _invalidators = {};

export function registerInvalidator(name, fn) {
  _invalidators[name] = fn;
}

function run(...names) {
  names.forEach(n => _invalidators[n]?.());
}

export function onPlaylistCreated() {
  run('home', 'library');
  pingServer();
}

export function onPlaylistDeleted(id) {
  run('home', 'library');
  if (id) run(`detail:${id}`);
  pingServer();
}

export function onPlaylistTracksChanged(playlistId) {
  if (playlistId) run(`detail:${playlistId}`);
}

export function onServerSyncCompleted() {
  run('home', 'library', 'genres', 'localindex');
}

export function onAppResumed() {
  run('favorites_revalidate');
  checkSyncVersion();
}

let _knownSyncVersion = -1;
let _syncCheckTimer   = null;

export function startSyncPolling() {
  stopSyncPolling();
  checkSyncVersion();
  _syncCheckTimer = setInterval(checkSyncVersion, 30_000);
}

export function stopSyncPolling() {
  if (_syncCheckTimer) { clearInterval(_syncCheckTimer); _syncCheckTimer = null; }
}

async function checkSyncVersion() {
  const { getServiceUrl } = await import('./config.js');
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
      _knownSyncVersion = data.version;
      return;
    }

    if (data.version > _knownSyncVersion) {
      console.log(`[CacheManager] Nueva sync detectada (v${data.version}). Refrescando cachés…`);
      _knownSyncVersion = data.version;
      onServerSyncCompleted();
    }
  } catch {}
}

function pingServer() {
  fetch(`${jellyfin.baseUrl}/startup/invalidate`, {
    method: 'POST',
    headers: {
      'X-Jellyfin-Token':  jellyfin.token  || '',
      'X-Jellyfin-UserId': jellyfin.userId || '',
    },
  }).catch(() => {});
}
