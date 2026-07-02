const windowMs = 60_000;
const maxRequests = 120;
const store = new Map();

export function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = store.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { windowStart: now, count: 0 };
    store.set(ip, entry);
  }
  entry.count++;
  if (entry.count > maxRequests) {
    return res.status(429).json({ error: 'Demasiadas peticiones. Intenta de nuevo en unos segundos.' });
  }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store) {
    if (now - entry.windowStart > windowMs) store.delete(ip);
  }
}, 60_000);
