import { Router } from 'express';
import { getDb, formatTrack } from '../db.js';

const router = Router();

// GET /items/:id/instantmix?limit=20
// Genera una lista de canciones similares a partir del género de la canción.
// Al estar todo en SQLite, es instantáneo y no hay round-trip a Jellyfin.
router.get('/items/:id/instantmix', (req, res) => {
  const { id }  = req.params;
  const limit   = Math.min(parseInt(req.query.limit || '20'), 100);
  const db      = getDb();

  const source = db.prepare('SELECT genres FROM tracks WHERE id = ?').get(id);
  const genres = source ? JSON.parse(source.genres || '[]') : [];

  let rows = [];

  if (genres.length > 0) {
    // Canciones que comparten al menos un género, excluyendo la fuente
    const placeholders = genres.map(() => '?').join(', ');
    rows = db.prepare(`
      SELECT DISTINCT t.* FROM tracks t, json_each(t.genres) g
      WHERE g.value IN (${placeholders})
        AND t.id != ?
      ORDER BY RANDOM()
      LIMIT ?
    `).all(...genres, id, limit);
  }

  // Si hay pocas canciones relacionadas, completamos con canciones al azar
  if (rows.length < limit) {
    const existingIds = new Set([id, ...rows.map((r) => r.id)]);
    const fill = db.prepare(`
      SELECT * FROM tracks WHERE id NOT IN (${[...existingIds].map(() => '?').join(',')})
      ORDER BY RANDOM()
      LIMIT ?
    `).all(...existingIds, limit - rows.length);
    rows = [...rows, ...fill];
  }

  res.json({ Items: rows.map(formatTrack), TotalRecordCount: rows.length });
});

export default router;
