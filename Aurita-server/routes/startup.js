import { Router } from 'express';
import { getDb, formatTrack, formatArtist } from '../db.js';
import { jellyfinRequest } from '../jellyfin-api.js';

const router = Router();

// Caché en memoria del servidor. Se invalida en cada sync.
// Clave: userId, valor: { data, fetchedAt }
const startupCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export function invalidateStartupCache() {
  startupCache.clear();
}

function authHeaders(req) {
  return {
    token:  req.headers['x-jellyfin-token'],
    userId: req.headers['x-jellyfin-userid'],
  };
}

/**
 * GET /startup
 * Devuelve en una sola respuesta todo lo que la app necesita al arrancar:
 *  - playlists recientes (home)
 *  - géneros disponibles
 *  - artistas más escuchados
 *  - favoritos del usuario
 * Así el cliente hace 1 petición en vez de 4-5, y reduce el tiempo de carga
 * inicial de ~2s a <500ms en redes normales.
 */
// GET /startup — devuelve todo en una petición al arrancar
router.get('/startup', async (req, res) => {
  const { token, userId } = authHeaders(req);
  if (!token || !userId) return res.status(401).json({ error: 'Sin credenciales' });

  const cacheKey = userId;
  const cached = startupCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    res.set('Cache-Control', 'private, max-age=300');
    res.set('X-Cache', 'HIT');
    return res.json(cached.data);
  }

  try {
    const db = getDb();

    // Todo en paralelo — antes eran 4-5 peticiones secuenciales desde el cliente
    const [playlistsData, favoritesData] = await Promise.all([
      jellyfinRequest(`/Users/${userId}/Items`, {
        query: {
          IncludeItemTypes: 'Playlist',
          SortBy: 'DateCreated',
          SortOrder: 'Descending',
          Limit: 8,
          Recursive: true,
          Fields: 'PrimaryImageAspectRatio',
        },
        token,
      }),
      jellyfinRequest(`/Users/${userId}/Items`, {
        query: {
          Filters: 'IsFavorite',
          IncludeItemTypes: 'Audio',
          Recursive: true,
          Limit: 100,
          Fields: 'Genres,AlbumArtist,ArtistItems',
          SortBy: 'DatePlayed',
          SortOrder: 'Descending',
        },
        token,
      }),
    ]);

    // Géneros y artistas vienen de la BD local (ya sincronizados) — sin red
    const genres = db.prepare(
      'SELECT id, name FROM genres ORDER BY name LIMIT 50'
    ).all();

    const artists = db.prepare(
      'SELECT id, name, image_tag FROM artists ORDER BY name LIMIT 200'
    ).all();

    const data = {
      playlists:  playlistsData,
      favorites:  favoritesData,
      genres:     genres.map((g) => ({ Id: g.id, Name: g.name, Type: 'MusicGenre' })),
      artists:    artists.map(formatArtist),
    };

    startupCache.set(cacheKey, { data, fetchedAt: Date.now() });

    res.set('Cache-Control', 'private, max-age=300');
    res.set('X-Cache', 'MISS');
    res.json(data);
  } catch (err) {
    console.error('[Route] Error en /startup:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /startup/invalidate
// El cliente lo llama tras crear/borrar playlists para que el servidor
// limpie su caché en memoria y la próxima petición traiga datos frescos.
router.post('/startup/invalidate', (req, res) => {
  invalidateStartupCache();
  res.json({ ok: true });
});

export default router;
