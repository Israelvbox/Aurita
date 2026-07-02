import { Router } from 'express';
import { getDb, formatTrack, formatAlbum } from '../db.js';
import { jellyfinRequest } from '../jellyfin-api.js';

const router = Router();

// GET /items/:id  — info de cualquier ítem
// Intentamos desde SQLite primero; si no está (p.ej. playlists), proxy a Jellyfin.
router.get('/items/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.headers['x-jellyfin-userid'];
  const token  = req.headers['x-jellyfin-token'];
  const db = getDb();

  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id);
  if (track) return res.json(formatTrack(track));

  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(id);
  if (album) return res.json(formatAlbum(album));

  // Fallback a Jellyfin para playlists y otros tipos
  try {
    const data = await jellyfinRequest(`/Users/${userId}/Items/${id}`, { token });
    res.json(data);
  } catch (err) {
    console.error(`[Route] Error en ${req.path}:`, err.message);
    res.status(err.status && err.status < 500 ? err.status : 502).json({ error: err.message });
  }
});

// GET /albums/:id/items  — pistas de un álbum
router.get('/albums/:id/items', (req, res) => {
  const { id } = req.params;
  const rows = getDb().prepare(`
    SELECT * FROM tracks WHERE album_id = ? ORDER BY name
  `).all(id);

  // Si no tenemos las pistas en SQLite todavía, el cliente obtendrá lista vacía
  // y usará el fallback de Jellyfin en la siguiente sync.
  res.json({ Items: rows.map(formatTrack), TotalRecordCount: rows.length });
});

export default router;
