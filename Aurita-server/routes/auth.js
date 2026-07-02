import { Router } from 'express';
import { JELLYFIN_URL, JELLYFIN_EXTERNAL_URL } from '../config.js';
import { setSyncMeta, getSyncMeta } from '../db.js';
import { syncNow, startSync, didLastSyncFailAuth } from '../sync.js';

const DEVICE_NAME = 'AuritaServer';
const DEVICE_ID   = 'aurita-server-1';
const APP_VERSION = '1.0.0';

const router = Router();

// Proxy del login de Jellyfin.
// El cliente manda usuario+contraseña igual que si hablara con Jellyfin
// directamente — no sabe ni le importa que hay un intermediario.
router.post('/Users/AuthenticateByName', async (req, res) => {
  const username = req.body?.Username || '(desconocido)';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    const jellyfinRes = await fetch(`${JELLYFIN_URL}/Users/AuthenticateByName`, {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'X-Emby-Authorization': `MediaBrowser Client="${DEVICE_NAME}", Device="${DEVICE_NAME}", DeviceId="${DEVICE_ID}", Version="${APP_VERSION}"`,
        ...(req.headers['x-emby-authorization']
          ? { 'X-Emby-Authorization': req.headers['x-emby-authorization'] }
          : {}),
      },
      body: JSON.stringify(req.body),
    });

    if (!jellyfinRes.ok) {
      console.log(`[Auth] Login FALLIDO de "${username}" desde ${ip} — HTTP ${jellyfinRes.status}`);
      const err = await jellyfinRes.text().catch(() => '');
      return res.status(jellyfinRes.status).send(err || 'Error de autenticación');
    }

    const data = await jellyfinRes.json();
    console.log(`[Auth] Login OK de "${username}" (userId ${data.User.Id}) desde ${ip}`);

    // Guardamos/renovamos el token en cada login exitoso para que la sync
    // siga funcionando aunque Jellyfin invalide el token anterior.
    const hadTokenBefore = !!getSyncMeta('serverToken');
    setSyncMeta('serverToken', data.AccessToken);

    if (!hadTokenBefore) {
      console.log('[Auth] Primer login. Iniciando sincronización inicial…');
      syncNow().then(() => startSync());
    } else if (didLastSyncFailAuth()) {
      console.log('[Auth] Token caducado. Reintentando sync con token renovado…');
      syncNow();
    }

    if (JELLYFIN_EXTERNAL_URL) data.AuritaJellyfinUrl = JELLYFIN_EXTERNAL_URL;

    res.json(data);
  } catch (err) {
    console.error(`[Auth] Error de conexión durante login de "${username}":`, err.message);
    res.status(502).json({ error: 'No se pudo conectar con Jellyfin.' });
  }
});

export default router;
