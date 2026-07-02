import { Router } from 'express';
import { getDb, formatTrack } from '../db.js';

const router = Router();

// GET /genres  — lista de géneros ordenados
router.get('/genres', (req, res) => {
  const genres = getDb()
    .prepare('SELECT * FROM genres ORDER BY sort_name')
    .all();

  res.json({
    Items: genres.map((g) => ({ Id: g.id, Name: g.name, SortName: g.sort_name })),
    TotalRecordCount: genres.length,
  });
});

// GET /genres/songs?genre=Rap&limit=60
// Canciones de un género, con herencia ya resuelta en la sync.
// Mucho más rápido que dejar que Jellyfin filtre dinámicamente.
router.get('/genres/songs', (req, res) => {
  const genre = (req.query.genre || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '60'), 500);

  if (!genre) return res.json({ Items: [], TotalRecordCount: 0 });

  // Usamos json_each para buscar dentro del array JSON de géneros
  // sin necesidad de una tabla separada de relaciones.
  const rows = getDb().prepare(`
    SELECT t.* FROM tracks t, json_each(t.genres) g
    WHERE lower(g.value) = lower(?)
    ORDER BY RANDOM()
    LIMIT ?
  `).all(genre, limit);

  res.json({ Items: rows.map(formatTrack), TotalRecordCount: rows.length });
});

export default router;
