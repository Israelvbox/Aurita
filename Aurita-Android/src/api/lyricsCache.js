import { cacheStore } from '../db/storage.js';

const LYRICS_TTL = 365 * 24 * 60 * 60 * 1000;

export async function getCachedLyrics(trackId) {
  try {
    return await cacheStore.get('lyrics', trackId);
  } catch {
    return null;
  }
}

export async function setCachedLyrics(trackId, data) {
  try {
    await cacheStore.set('lyrics', trackId, data, LYRICS_TTL);
  } catch {}
}

export async function prefetchLyrics(jellyfinId, trackName, artistName) {
  if (!jellyfinId || !trackName || !artistName) return;
  try {
    const params = new URLSearchParams({ artist_name: artistName, track_name: trackName });
    const base = window.location.origin;
    let data = null;

    try {
      const proxyRes = await fetch(`${base}/lyrics?${params}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (proxyRes.ok) data = await proxyRes.json();
    } catch {}

    if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
      const q = `${encodeURIComponent(artistName)} ${encodeURIComponent(trackName)}`;
      const searchRes = await fetch(`https://lrclib.net/api/search?q=${q}`, {
        headers: { 'User-Agent': 'Aurita/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!searchRes.ok) return;
      const results = await searchRes.json();
      if (!results?.length) return;
      const best = results[0];
      const lrcRes = await fetch(`https://lrclib.net/api/get/${best.id}`, {
        headers: { 'User-Agent': 'Aurita/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!lrcRes.ok) return;
      data = await lrcRes.json();
    }

    const synced = data.syncedLyrics || data.plainLyrics || '';
    if (!synced) return;
    await setCachedLyrics(jellyfinId, {
      syncedLyrics: data.syncedLyrics || null,
      plainLyrics: data.plainLyrics || null,
    });
  } catch {}
}
