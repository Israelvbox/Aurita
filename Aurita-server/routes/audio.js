import { Router } from 'express';
import { existsSync, mkdirSync, createReadStream, createWriteStream, statSync, readdirSync, unlinkSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough, Readable, Transform } from 'node:stream';
import { JELLYFIN_URL } from '../config.js';
import { getSyncMeta } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache', 'audio');
const MAX_CACHE_BYTES = 700 * 1024 * 1024;
const MAX_FILE_BYTES  = 100 * 1024 * 1024;

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const router = Router();

function cachePath(id) { return join(CACHE_DIR, id); }

function evictIfNeeded() {
  try {
    const files = readdirSync(CACHE_DIR)
      .map(f => ({ name: f, path: join(CACHE_DIR, f) }))
      .filter(f => { try { return statSync(f.path).isFile(); } catch { return false; } })
      .map(f => { const s = statSync(f.path); return { ...f, size: s.size, atime: s.atimeMs }; })
      .sort((a, b) => a.atime - b.atime);

    let total = files.reduce((s, f) => s + f.size, 0);
    for (const f of files) {
      if (total <= MAX_CACHE_BYTES) break;
      try { unlinkSync(f.path); total -= f.size; } catch {}
    }
  } catch {}
}

function parseRange(header, total) {
  if (!header) return null;
  const m = header.replace(/bytes=/, '').match(/^(\d+)-(\d*)$/);
  if (!m) return null;
  return { start: +m[1], end: m[2] ? +m[2] : total - 1 };
}

function buildUrl(base, id, query, token) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) params.set(k, String(v));
  params.set('Static', 'true');
  if (token && !params.has('api_key')) params.set('api_key', token);
  return `${base}/Audio/${id}/stream.mp3?${params}`;
}

router.get('/audio/:itemId/stream.mp3', async (req, res) => {
  const safeId = req.params.itemId.replace(/[^a-fA-F0-9-]/g, '');
  const cacheP = cachePath(safeId);
  const hasCache = existsSync(cacheP);
  const fileSize = hasCache ? statSync(cacheP).size : 0;

  const token = req.headers['x-jellyfin-token'] || getSyncMeta('serverToken');
  const baseUrl = JELLYFIN_URL || 'http://localhost:8096';

  // ── Cache HIT ──
  if (hasCache && fileSize > 0) {
    if (req.headers.range) {
      const range = parseRange(req.headers.range, fileSize);
      if (range) {
        console.log(`[Audio] HIT  ${safeId}  range ${range.start}-${range.end} / ${fileSize}`);
        res.writeHead(206, {
          'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': range.end - range.start + 1,
          'Content-Type': 'audio/mpeg',
          'X-Cache': 'HIT',
        });
        return createReadStream(cacheP, { start: range.start, end: range.end }).pipe(res);
      }
    }
    console.log(`[Audio] HIT  ${safeId}  ${(fileSize / 1024 / 1024).toFixed(1)}MB`);
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'X-Cache': 'HIT',
    });
    return createReadStream(cacheP).pipe(res);
  }

  // ── Cache MISS ──
  try {
    const upstreamUrl = buildUrl(baseUrl, safeId, req.query, token);
    const isPartialRequest = req.headers.range && !req.headers.range.startsWith('bytes=0-');

    // Partial resume: just proxy, don't cache
    if (isPartialRequest) {
      console.log(`[Audio] MISS ${safeId}  rango parcial → solo proxy`);
      const up = await fetch(upstreamUrl, { headers: { Range: req.headers.range } });
      const ct = up.headers.get('content-type') || 'audio/mpeg';
      const cl = up.headers.get('content-length');
      const cr = up.headers.get('content-range');
      if (!up.ok && up.status !== 206) return res.status(up.status).end();
      res.writeHead(up.status, {
        'Content-Range': cr, 'Accept-Ranges': 'bytes',
        'Content-Length': cl, 'Content-Type': ct,
        'X-Cache': 'MISS',
      });
      return Readable.fromWeb(up.body).pipe(res);
    }

    // Full request: proxy + cache entire file
    console.log(`[Audio] MISS ${safeId}  cacheando archivo completo...`);
    const up = await fetch(upstreamUrl);

    if (!up.ok && up.status !== 206) {
      console.log(`[Audio] ERR  ${safeId}  Jellyfin respondió ${up.status}`);
      return res.status(up.status).end();
    }

    const ct = up.headers.get('content-type') || 'audio/mpeg';
    const totalBytes = parseInt(up.headers.get('content-length') || '0', 10);
    const shouldCache = totalBytes > 0 && totalBytes <= MAX_FILE_BYTES;

    // Write response headers
    const head = { 'Content-Type': ct, 'Accept-Ranges': 'bytes', 'X-Cache': 'MISS' };
    if (totalBytes) head['Content-Length'] = totalBytes;

    if (req.headers.range) {
      // Range starting at 0 (e.g., bytes=0-65535): send 206 with content-range
      const range = parseRange(req.headers.range, totalBytes);
      if (range) {
        head['Content-Range'] = `bytes ${range.start}-${range.end}/${totalBytes}`;
        res.writeHead(206, head);
      } else {
        res.writeHead(200, head);
      }
    } else {
      res.writeHead(200, head);
    }

    if (shouldCache) {
      const tmpP = cacheP + '.tmp';
      const ws = createWriteStream(tmpP);
      const tee = new PassThrough();
      let cacheOk = true;

      tee.on('data', (chunk) => { if (cacheOk) ws.write(chunk); });
      tee.on('end', () => {
        ws.end();
        if (cacheOk && existsSync(tmpP) && statSync(tmpP).size > 0) {
          try {
            if (existsSync(cacheP)) unlinkSync(cacheP);
            renameSync(tmpP, cacheP);
            evictIfNeeded();
            console.log(`[Audio] MISS ${safeId}  cacheado (${totalBytes} bytes)`);
          } catch (e) { console.log(`[Audio] ERR ${safeId} cache: ${e.message}`); }
        }
      });
      tee.on('error', () => { cacheOk = false; ws.end(); try { unlinkSync(tmpP); } catch {} });

      const body = Readable.fromWeb(up.body);

      if (req.headers.range) {
        const range = parseRange(req.headers.range, totalBytes);
        if (range) {
          let cursor = 0;
          const filter = new Transform({
            transform(chunk, enc, cb) {
              const start = cursor;
              const end = cursor + chunk.length - 1;
              cursor += chunk.length;
              if (end < range.start || start > range.end) { cb(); return; }
              const from = Math.max(0, range.start - start);
              const to = Math.min(chunk.length, range.end - start + 1);
              cb(null, chunk.subarray(from, to));
            },
          });
          filter.on('error', () => {});
          body.pipe(tee);
          body.pipe(filter).pipe(res);
          return;
        }
      }
      body.pipe(tee);
      body.pipe(res);
    } else {
      if (totalBytes > MAX_FILE_BYTES) console.log(`[Audio] MISS ${safeId}  sin caché (${(totalBytes / 1024 / 1024).toFixed(1)}MB muy grande)`);
      Readable.fromWeb(up.body).pipe(res);
    }
  } catch (err) {
    console.log(`[Audio] ERR  ${safeId}  ${err.message}`);
    if (!res.headersSent) res.status(502).json({ error: 'Error al conectar con Jellyfin' });
  }
});

export default router;
