import { Router } from 'express';
import { getDb, getSyncMeta } from '../db.js';

const router = Router();

/**
 * GET /index
 *
 * Exporta la biblioteca completa en formato ligero para que el cliente
 * la indexe localmente con flexsearch. Esto permite búsqueda, navegación
 * por artistas y álbumes completamente sin red (<1ms en el dispositivo).
 *
 * El cliente envía su versión actual en X-Index-Version.
 * Si coincide con la del servidor, responde 304 (sin cuerpo) — coste 0.
 *
 * Tamaño aproximado: ~800KB sin comprimir, ~200KB gzip para 8000 ítems.
 * Solo se descarga cuando hay cambios (después de una sync con Jellyfin).
 */
router.get('/index', (req, res) => {
  const db = getDb();
  const version = getSyncMeta('lastSync') || '0';

  // Si el cliente ya tiene esta versión, no enviamos nada
  if (req.headers['x-index-version'] === version) {
    return res.status(304).end();
  }

  // Solo los campos necesarios para búsqueda y navegación —
  // no incluimos géneros, duration_s etc. para mantener el payload mínimo
  const tracks = db.prepare(`
    SELECT id, name, artist, artist_id, album_name AS album, album_id, year, image_tag
    FROM tracks ORDER BY name
  `).all();

  const artists = db.prepare(`
    SELECT id, name, image_tag FROM artists ORDER BY name
  `).all();

  const albums = db.prepare(`
    SELECT id, name, artist, artist_id, year, image_tag FROM albums ORDER BY name
  `).all();

  const genres = db.prepare(`
    SELECT id, name FROM genres ORDER BY name
  `).all();

  res.set('Cache-Control', 'private, max-age=3600');
  res.set('X-Index-Version', version);
  res.json({ tracks, artists, albums, genres, version });
});

export default router;
