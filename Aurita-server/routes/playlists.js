import { Router } from 'express';
import { jellyfinRequest } from '../jellyfin-api.js';

const router = Router();

function authHeaders(req) {
  return {
    token:  req.headers['x-jellyfin-token'],
    userId: req.headers['x-jellyfin-userid'],
  };
}

// GET /playlists  — playlists del usuario
router.get('/playlists', async (req, res) => {
  const { token, userId } = authHeaders(req);
  try {
    const data = await jellyfinRequest(`/Users/${userId}/Items`, {
      query: { IncludeItemTypes: 'Playlist', Recursive: true, Limit: 100 },
      token,
    });
    res.json(data);
  } catch (err) {
    console.error(`[Route] Error en ${req.path}:`, err.message);
    res.status(err.status && err.status < 500 ? err.status : 502).json({ error: err.message });
  }
});

// GET /playlists/:id/items  — canciones de una playlist
router.get('/playlists/:id/items', async (req, res) => {
  const { id } = req.params;
  const { token, userId } = authHeaders(req);
  try {
    const data = await jellyfinRequest(`/Playlists/${id}/Items`, {
      query: { UserId: userId, Fields: 'Genres,AlbumArtist,ArtistItems,UserData' },
      token,
    });
    res.json(data);
  } catch (err) {
    console.error(`[Route] Error en ${req.path}:`, err.message);
    res.status(err.status && err.status < 500 ? err.status : 502).json({ error: err.message });
  }
});

// GET /home/playlists?limit=4  — playlists recientes para el inicio
router.get('/home/playlists', async (req, res) => {
  const { token, userId } = authHeaders(req);
  const limit = parseInt(req.query.limit || '4');
  try {
    const data = await jellyfinRequest(`/Users/${userId}/Items`, {
      query: {
        IncludeItemTypes: 'Playlist',
        SortBy: 'DateCreated',
        SortOrder: 'Descending',
        Limit: limit,
        Recursive: true,
        Fields: 'PrimaryImageAspectRatio',
      },
      token,
    });
    res.json(data);
  } catch (err) {
    console.error(`[Route] Error en ${req.path}:`, err.message);
    res.status(err.status && err.status < 500 ? err.status : 502).json({ error: err.message });
  }
});

export default router;
