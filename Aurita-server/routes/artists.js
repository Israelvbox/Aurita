import { Router } from 'express';
import { getDb, formatAlbum, formatTrack } from '../db.js';

const router = Router();

// Devuelve las filas de tracks que pertenecen a un artista, usando el
// artist_id si coincide, y si no encuentra nada, cae a comparar por nombre
// (case-insensitive). Esto cubre el caso en que ArtistItems[0] de una
// pista no coincide exactamente con el artista principal del álbum.
function tracksForArtist(db, artistId, limit) {
  let rows = db.prepare(`
    SELECT * FROM tracks WHERE artist_id = ?
    ORDER BY year DESC, RANDOM()
    LIMIT ?
  `).all(artistId, limit);

  if (rows.length === 0) {
    const artist = db.prepare('SELECT name FROM artists WHERE id = ?').get(artistId);
    if (artist) {
      rows = db.prepare(`
        SELECT * FROM tracks WHERE lower(artist) = lower(?)
        ORDER BY year DESC, RANDOM()
        LIMIT ?
      `).all(artist.name, limit);
    }
  }
  return rows;
}

// GET /artists/:id/albums?limit=30
router.get('/artists/:id/albums', (req, res) => {
  const { id } = req.params;
  const limit  = Math.min(parseInt(req.query.limit || '30'), 100);
  const db = getDb();

  let rows = db.prepare(`
    SELECT * FROM albums WHERE artist_id = ? ORDER BY year DESC, name LIMIT ?
  `).all(id, limit);

  if (rows.length === 0) {
    const artist = db.prepare('SELECT name FROM artists WHERE id = ?').get(id);
    if (artist) {
      rows = db.prepare(`
        SELECT * FROM albums WHERE lower(artist) = lower(?) ORDER BY year DESC, name LIMIT ?
      `).all(artist.name, limit);
    }
  }

  res.json({ Items: rows.map(formatAlbum), TotalRecordCount: rows.length });
});

// GET /artists/:id/topsongs?limit=10
router.get('/artists/:id/topsongs', (req, res) => {
  const { id } = req.params;
  const limit  = Math.min(parseInt(req.query.limit || '10'), 50);
  const rows   = tracksForArtist(getDb(), id, limit);
  res.json({ Items: rows.map(formatTrack), TotalRecordCount: rows.length });
});

export default router;
