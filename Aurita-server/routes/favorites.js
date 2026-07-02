import { Router } from 'express';
import { jellyfinRequest } from '../jellyfin-api.js';

const router = Router();

// GET /favorites?limit=500
router.get('/favorites', async (req, res) => {
  const token  = req.headers['x-jellyfin-token'];
  const userId = req.headers['x-jellyfin-userid'];
  const limit  = Math.min(parseInt(req.query.limit || '500'), 2000);

  try {
    const data = await jellyfinRequest(`/Users/${userId}/Items`, {
      query: {
        IncludeItemTypes: 'Audio',
        Filters: 'IsFavorite',
        Recursive: true,
        Limit: limit,
        Fields: 'Genres,AlbumArtist,ArtistItems,UserData',
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
