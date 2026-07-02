import { jellyfinGetAll } from './jellyfin-api.js';
import { getDb, upsertTrack, upsertAlbum, upsertArtist, upsertGenre, deleteWhereNotIn, setSyncMeta, getSyncMeta } from './db.js';
import { SYNC_INTERVAL_MINUTES } from './config.js';
import { invalidateStartupCache } from './routes/startup.js';

let _syncTimer = null;
let _syncing   = false;
let _lastSyncFailedAuth = false;
let _syncVersion = 0; // se carga desde la BD la primera vez que se necesita

function getSyncVersionFromDb() {
  try { return getSyncMeta('syncVersion') || 0; } catch { return 0; }
}

export function didLastSyncFailAuth() { return _lastSyncFailedAuth; }
export function getSyncVersion() { return _syncVersion; }

export async function syncNow() {
  if (_syncing) {
    console.log('[Sync] Ya hay una sincronización en curso, saltando');
    return;
  }
  _syncing = true;
  const start = Date.now();
  console.log('[Sync] Iniciando sincronización con Jellyfin…');

  try {
    // 1. Géneros
    console.log('[Sync] Descargando géneros…');
    const genresData = await jellyfinGetAll('/MusicGenres', { SortBy: 'SortName' });
    const genreIds = new Set(genresData.map(g => g.Id));
    const genreInsert = getDb().transaction((genres) => {
      for (const g of genres) {
        upsertGenre({ id: g.Id, name: g.Name, sort_name: g.SortName || g.Name });
      }
    });
    genreInsert(genresData);
    deleteWhereNotIn('genres', genreIds);
    console.log(`[Sync] ${genresData.length} géneros`);

    // 2. Álbumes (necesarios antes de las pistas para heredar géneros)
    console.log('[Sync] Descargando álbumes…');
    const albumsData = await jellyfinGetAll('/Items', {
      IncludeItemTypes: 'MusicAlbum',
      Recursive: true,
      Fields: 'Genres,ArtistItems',
    });
    const albumIds = new Set(albumsData.map(a => a.Id));

    const albumGenres = {};
    const albumInsert = getDb().transaction((albums) => {
      for (const a of albums) {
        const genres = a.Genres || [];
        albumGenres[a.Id] = genres;
        const artist = a.ArtistItems?.[0];
        upsertAlbum({
          id:        a.Id,
          name:      a.Name,
          artist:    a.AlbumArtist || artist?.Name || null,
          artist_id: artist?.Id || null,
          genres:    JSON.stringify(genres),
          year:      a.ProductionYear || null,
          image_tag: a.ImageTags?.Primary || null,
        });
      }
    });
    albumInsert(albumsData);
    deleteWhereNotIn('albums', albumIds);
    console.log(`[Sync] ${albumsData.length} álbumes`);

    // 3. Artistas
    console.log('[Sync] Descargando artistas…');
    const artistsData = await jellyfinGetAll('/Items', {
      IncludeItemTypes: 'MusicArtist',
      Recursive: true,
      Fields: 'PrimaryImageAspectRatio',
    });
    const artistIds = new Set(artistsData.map(a => a.Id));
    const artistInsert = getDb().transaction((artists) => {
      for (const a of artists) {
        upsertArtist({
          id:           a.Id,
          name:         a.Name,
          image_tag:    a.ImageTags?.Primary || null,
          backdrop_tag: a.BackdropImageTags?.[0] || null,
        });
      }
    });
    artistInsert(artistsData);
    deleteWhereNotIn('artists', artistIds);
    console.log(`[Sync] ${artistsData.length} artistas`);

    // 4. Pistas de audio
    console.log('[Sync] Descargando pistas de audio…');
    const tracksData = await jellyfinGetAll('/Items', {
      IncludeItemTypes: 'Audio',
      Recursive: true,
      Fields: 'Genres,AlbumArtist,ArtistItems',
    });
    const trackIds = new Set(tracksData.map(t => t.Id));

    const trackInsert = getDb().transaction((tracks) => {
      for (const t of tracks) {
        // Heredar género del álbum si la pista no tiene uno propio
        const genres = (t.Genres?.length > 0) ? t.Genres : (albumGenres[t.AlbumId] || []);
        const artist = t.ArtistItems?.[0];
        const durationS = t.RunTimeTicks ? Math.round(t.RunTimeTicks / 10_000_000) : null;
        upsertTrack({
          id:         t.Id,
          name:       t.Name,
          album_id:   t.AlbumId || null,
          album_name: t.Album   || null,
          artist_id:  artist?.Id || null,
          artist:     t.AlbumArtist || artist?.Name || null,
          genres:     JSON.stringify(genres),
          year:       t.ProductionYear || null,
          duration_s: durationS,
          image_tag:  t.ImageTags?.Primary || null,
          synced_at:  Date.now(),
        });
      }
    });
    trackInsert(tracksData);
    deleteWhereNotIn('tracks', trackIds);
    console.log(`[Sync] ${tracksData.length} pistas`);

    // Guardar timestamp y contadores. Incrementar syncVersion para que los
    // clientes detecten que hay datos nuevos en el próximo /sync/status.
    setSyncMeta('lastSync', new Date().toISOString());
    setSyncMeta('counts', {
      tracks:  tracksData.length,
      albums:  albumsData.length,
      artists: artistsData.length,
      genres:  genresData.length,
    });
    _syncVersion++;
    setSyncMeta('syncVersion', _syncVersion);
    // Limpiar la caché en memoria del /startup para que la próxima petición
    // devuelva datos frescos de la BD recién actualizada.
    invalidateStartupCache();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[Sync] Completada en ${elapsed}s`);
    _lastSyncFailedAuth = false;

  } catch (err) {
    console.error('[Sync] Error durante la sincronización:', err.message);
    // HTTP 401 significa que el token guardado caducó o fue invalidado por
    // Jellyfin. En vez de quedarse roto hasta la próxima sync programada
    // (hasta 6h después) o necesitar borrar la base de datos a mano, esto
    // se marca para que el siguiente login de cualquier usuario dispare
    // una resincronización inmediata con el token recién renovado.
    _lastSyncFailedAuth = err.message?.includes('HTTP 401') || false;
  } finally {
    _syncing = false;
  }
}

export function startSync() {
  // Cargar la versión persistida ahora que la BD ya está inicializada
  _syncVersion = getSyncVersionFromDb();
  console.log(`[Sync] syncVersion cargada: ${_syncVersion}`);
  const intervalMs = SYNC_INTERVAL_MINUTES * 60 * 1000;

  // Siempre sincronizar al arrancar (restart = sync garantizada).
  // Así un simple `sudo systemctl restart aurita-server` fuerza
  // una resync sin necesidad de borrar la BD ni llamar a ningún endpoint.
  const token = getSyncMeta('serverToken');
  if (token) {
    syncNow();
  } else {
    console.log('[Sync] Sin token guardado, esperando primer login para sincronizar.');
  }

  _syncTimer = setInterval(() => syncNow(), intervalMs);
}

export function stopSync() {
  if (_syncTimer) clearInterval(_syncTimer);
}

export function getSyncStatus() {
  const lastSync = getSyncMeta('lastSync');
  const counts   = getSyncMeta('counts') || {};
  return { lastSync, counts, syncing: _syncing };
}
