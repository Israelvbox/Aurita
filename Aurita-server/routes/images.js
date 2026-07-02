import { Router } from 'express';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JELLYFIN_URL } from '../config.js';
import { getSyncMeta } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache', 'images');

if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

const router = Router();

router.get('/images/:itemId/:type', async (req, res) => {
  const { itemId, type } = req.params;
  const maxSize = parseInt(req.query.maxSize || '300');
  const quality = parseInt(req.query.quality || '85');
  const tag = req.query.tag || '';

  const safeId = itemId.replace(/[^a-fA-F0-9-]/g, '');
  const cacheKey = `${safeId}_${type}_${maxSize}${tag ? `_${tag}` : ''}`;
  const cachePath = join(CACHE_DIR, cacheKey);

  if (existsSync(cachePath)) {
    res.set('Cache-Control', 'public, max-age=31536000');
    res.set('X-Cache', 'HIT');
    return res.sendFile(cachePath);
  }

  try {
    const token = req.headers['x-jellyfin-token'] || getSyncMeta('serverToken') || '';
    const baseUrl = JELLYFIN_URL || process.env.JELLYFIN_URL || 'http://localhost:8096';
    const url = `${baseUrl}/Items/${itemId}/Images/${type}?maxWidth=${maxSize}&maxHeight=${maxSize}&quality=${quality}${tag ? `&tag=${tag}` : ''}`;
    const response = await fetch(url, {
      headers: { 'X-Emby-Token': token },
    });

    if (!response.ok) {
      return res.status(response.status).end();
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    writeFile(cachePath, buffer).catch(() => {});
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.set('Cache-Control', 'public, max-age=31536000');
    res.set('X-Cache', 'MISS');
    res.contentType(contentType);
    res.send(buffer);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
