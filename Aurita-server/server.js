import express    from 'express';
import cors       from 'cors';
import compression from 'compression';
import { PORT, JELLYFIN_URL, JELLYFIN_EXTERNAL_URL } from './config.js';
import { initDb, getSyncMeta } from './db.js';
import { startSync } from './sync.js';

import setupRoutes      from './routes/setup.js';
import authRoutes       from './routes/auth.js';
import searchRoutes     from './routes/search.js';
import genresRoutes     from './routes/genres.js';
import itemsRoutes      from './routes/items.js';
import artistsRoutes    from './routes/artists.js';
import playlistsRoutes  from './routes/playlists.js';
import favoritesRoutes  from './routes/favorites.js';
import instantmixRoutes from './routes/instantmix.js';
import startupRoutes    from './routes/startup.js';
import localIndexRoutes from './routes/localindex.js';
import syncStatusRoutes from './routes/syncstatus.js';
import imagesRoutes     from './routes/images.js';
import { rateLimit }    from './middleware/rateLimit.js';

const app = express();

// ── Middleware ──────────────────────────────────────────────────────
// Compresión gzip: reduce el tamaño de todos los JSON un 70-80%.
// Una respuesta de 200KB pasa a ~40KB → 5x más rápido de transferir.
// threshold=512: no comprime respuestas pequeñas donde el overhead
// de compresión supera el ahorro.
app.use(compression({ threshold: 512 }));

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(rateLimit);

// ── Rutas ───────────────────────────────────────────────────────────
app.use(setupRoutes);
app.use(authRoutes);
app.use(syncStatusRoutes);   // /sync/status y /sync/ping
app.use(startupRoutes);
app.use(localIndexRoutes);
app.use(searchRoutes);
app.use(genresRoutes);
app.use(itemsRoutes);
app.use(artistsRoutes);
app.use(playlistsRoutes);
app.use(favoritesRoutes);
app.use(instantmixRoutes);
app.use(imagesRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════╗
║       Aurita Server v2.0.0           ║
║       Puerto: ${String(PORT).padEnd(24)}║
╚══════════════════════════════════════╝
  Jellyfin interno:  ${JELLYFIN_URL}
  Jellyfin externo:  ${JELLYFIN_EXTERNAL_URL || '(no configurado)'}
  Compresión gzip:   activada
`);

  initDb();

  const token = getSyncMeta('serverToken');
  if (token) {
    console.log('[Server] Token encontrado, iniciando sync automática…');
    startSync();
  } else {
    console.log('[Server] Esperando primer login para iniciar sync…');
  }
});
