import { Router } from 'express';
import { JELLYFIN_URL } from '../config.js';
import { getSyncMeta } from '../db.js';
import { Readable } from 'node:stream';

const PROXY_TIMEOUT_MS = 15_000;
const SLOW_LOG_MS = 5_000;

const router = Router();

router.all('*', async (req, res) => {
  const start = Date.now();
  const token = req.headers['x-jellyfin-token'] || req.headers['x-emby-token'] || getSyncMeta('serverToken');
  const targetUrl = `${JELLYFIN_URL}${req.originalUrl}`.replace(/[?]$/, '');

  try {
    const headers = {
      'X-Emby-Token': token,
      'Content-Type': req.headers['content-type'] || 'application/json',
    };
    if (req.headers['x-emby-authorization']) {
      headers['X-Emby-Authorization'] = req.headers['x-emby-authorization'];
    }

    const options = {
      method: req.method,
      headers,
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    };
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      options.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(targetUrl, options);
    res.status(upstream.status);

    const skip = new Set(['transfer-encoding', 'connection', 'keep-alive', 'content-encoding']);
    upstream.headers.forEach((v, k) => { if (!skip.has(k.toLowerCase())) res.set(k, v); });

    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }

    const elapsed = Date.now() - start;
    if (elapsed > SLOW_LOG_MS) {
      console.log(`[Proxy] LENTO (${elapsed}ms): ${req.method} ${targetUrl.replace(/[?&]api_key=[^&]+/g, '')}`);
    }
  } catch (err) {
    if (!res.headersSent) {
      if (err.name === 'TimeoutError') {
        res.status(504).json({ error: 'Jellyfin no respondió a tiempo' });
      } else {
        res.status(502).json({ error: 'Error al conectar con Jellyfin' });
      }
    }
  }
});

export default router;
