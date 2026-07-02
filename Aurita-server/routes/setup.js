import { Router } from 'express';
import { getSyncStatus, syncNow } from '../sync.js';
import { JELLYFIN_EXTERNAL_URL } from '../config.js';

const router = Router();

// GET /status — estado del servidor
router.get('/status', (_req, res) => {
  const { lastSync, counts, syncing } = getSyncStatus();
  res.json({
    configured:          true,   // siempre true: config es por env vars
    version:             '1.0.0',
    syncing,
    lastSync,
    counts,
    jellyfinExternalUrl: JELLYFIN_EXTERNAL_URL || null,
  });
});

// POST /sync — forzar re-sync manual desde ajustes del cliente
router.post('/sync', (_req, res) => {
  syncNow();
  res.json({ ok: true, message: 'Sincronización iniciada.' });
});

export default router;
