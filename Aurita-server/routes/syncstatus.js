import { Router } from 'express';
import { getSyncStatus, getSyncVersion, syncNow, startSync } from '../sync.js';
import { getSyncMeta, setSyncMeta } from '../db.js';

const router = Router();

/**
 * POST /sync/trigger
 * Fuerza una resincronización inmediata con Jellyfin sin borrar la BD.
 * Los datos existentes se actualizan (upsert), los nuevos se añaden.
 * Uso: curl -X POST http://localhost:3000/sync/trigger
 */
router.post('/sync/trigger', (req, res) => {
  const { syncing } = getSyncStatus();
  if (syncing) {
    return res.json({ ok: false, message: 'Ya hay una sincronización en curso.' });
  }
  console.log('[Sync] Resync manual disparada desde /sync/trigger');
  syncNow();
  res.json({ ok: true, message: 'Sincronización iniciada. Comprueba el estado en /sync/status.' });
});
router.get('/sync/status', (req, res) => {
  const { lastSync, counts, syncing } = getSyncStatus();
  res.set('Cache-Control', 'no-store');
  res.json({
    version: getSyncVersion(),
    syncing,
    lastSync,
    counts:  counts || {},
  });
});

/**
 * POST /sync/ping
 * El cliente lo llama al restaurar sesión (no pasa por /Users/AuthenticateByName).
 * Guarda el token y lanza sync si la BD está vacía.
 */
router.post('/sync/ping', (req, res) => {
  const token  = req.headers['x-jellyfin-token'];
  const userId = req.headers['x-jellyfin-userid'];
  if (!token || !userId) return res.status(400).json({ ok: false });

  const hadToken  = !!getSyncMeta('serverToken');
  const { syncing, counts } = getSyncStatus();
  const hasTracks = (counts?.tracks || 0) > 0;

  setSyncMeta('serverToken', token);

  if (!hadToken || !hasTracks) {
    console.log('[Sync] /sync/ping: BD vacía o sin token. Lanzando sync…');
    if (!syncing) syncNow().then(() => { if (!hadToken) startSync(); });
  }

  res.json({ ok: true, syncing: syncing || !hasTracks, tracks: counts?.tracks || 0 });
});

export default router;
