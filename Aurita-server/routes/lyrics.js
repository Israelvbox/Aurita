import { Router } from 'express';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'cache', 'lyrics');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function getCached(key) {
  const fp = path.join(CACHE_DIR, `${key}.json`);
  try {
    const raw = await readFile(fp, 'utf8');
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  } catch {}
  return null;
}

async function setCache(key, data) {
  if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true });
  const fp = path.join(CACHE_DIR, `${key}.json`);
  await writeFile(fp, JSON.stringify({ ts: Date.now(), data }), 'utf8');
}

const router = Router();

router.get('/lyrics', async (req, res) => {
  const { artist_name, track_name } = req.query;
  if (!artist_name || !track_name) {
    return res.status(400).json({ error: 'artist_name and track_name required' });
  }

  const cacheKey = `${artist_name.toLowerCase().trim()}|${track_name.toLowerCase().trim()}`.replace(/[^a-z0-9|]/g, '_');

  const cached = await getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const params = new URLSearchParams({ artist_name, track_name });
    let response = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { 'User-Agent': 'Aurita/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const q = `${encodeURIComponent(artist_name)} ${encodeURIComponent(track_name)}`;
      response = await fetch(`https://lrclib.net/api/search?q=${q}`, {
        headers: { 'User-Agent': 'Aurita/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return res.json({ syncedLyrics: null, plainLyrics: null });
      const results = await response.json();
      if (!results?.length) return res.json({ syncedLyrics: null, plainLyrics: null });
      const best = results[0];
      response = await fetch(`https://lrclib.net/api/get/${best.id}`, {
        headers: { 'User-Agent': 'Aurita/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return res.json({ syncedLyrics: null, plainLyrics: null });
    }

    const data = await response.json();
    const result = {
      syncedLyrics: data.syncedLyrics || null,
      plainLyrics: data.plainLyrics || null,
    };
    await setCache(cacheKey, result);
    res.json(result);
  } catch {
    res.json({ syncedLyrics: null, plainLyrics: null });
  }
});

export default router;
