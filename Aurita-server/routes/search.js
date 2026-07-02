import { Router } from 'express';
import { getDb, formatTrack, formatArtist } from '../db.js';

const router = Router();

function sanitizeFts(term) {
  return term.replace(/[-"*^()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

// GET /search?q=término&limit=40
// La búsqueda va contra SQLite local (FTS5) — sin red, sin Jellyfin.
// Responde en <10ms en cualquier biblioteca.
router.get('/search', (req, res) => {
  const term  = (req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '40'), 200);

  if (!term) return res.json({ Items: [], TotalRecordCount: 0 });

  const db = getDb();
  const safe = sanitizeFts(term);

  let tracks = [];
  try {
    // FTS5 con búsqueda explícita en las columnas indexadas
    tracks = db.prepare(`
      SELECT t.* FROM tracks t
      WHERE t.rowid IN (
        SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH ?
      )
      LIMIT ?
    `).all(`${safe}*`, Math.ceil(limit * 0.7));
  } catch {
    // Fallback LIKE si FTS5 falla (BD recién creada, trigrams no listas, etc.)
    tracks = [];
  }
  // Si FTS5 no devuelve nada, usar LIKE como segundo fallback
  if (tracks.length === 0) {
    tracks = db.prepare(`
      SELECT * FROM tracks
      WHERE lower(name) LIKE lower(?)
         OR lower(artist) LIKE lower(?)
         OR lower(album_name) LIKE lower(?)
      LIMIT ?
    `).all(`%${term}%`, `%${term}%`, `%${term}%`, Math.ceil(limit * 0.7));
  }

  let artists = [];
  try {
    artists = db.prepare(`
      SELECT a.* FROM artists a
      WHERE a.rowid IN (
        SELECT rowid FROM artists_fts WHERE artists_fts MATCH ?
      )
      LIMIT ?
    `).all(`${safe}*`, Math.floor(limit * 0.3));
  } catch {
    artists = [];
  }
  if (artists.length === 0) {
    artists = db.prepare(`
      SELECT * FROM artists WHERE lower(name) LIKE lower(?) LIMIT ?
    `).all(`%${term}%`, Math.floor(limit * 0.3));
  }

  const items = [
    ...artists.map(formatArtist),
    ...tracks.map(formatTrack),
  ];

  // La BD local no cambia hasta la próxima sync — podemos cachear agresivamente
  res.set('Cache-Control', 'private, max-age=300');
  res.json({ Items: items, TotalRecordCount: items.length });
});

export default router;
