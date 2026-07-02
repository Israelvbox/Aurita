import { JELLYFIN_URL } from './config.js';
import { getSyncMeta }  from './db.js';

const DEVICE_NAME = 'AuritaServer';
const DEVICE_ID   = 'aurita-server-1';
const APP_VERSION = '1.0.0';

function authHeader(token) {
  let h = `MediaBrowser Client="${DEVICE_NAME}", Device="${DEVICE_NAME}", DeviceId="${DEVICE_ID}", Version="${APP_VERSION}"`;
  if (token) h += `, Token="${token}"`;
  return h;
}

// Token del servidor: se guarda en SQLite la primera vez que alguien
// hace login. A partir de ahí se usa para todas las syncs automáticas.
function getServerToken() {
  try { return getSyncMeta('serverToken'); } catch { return null; }
}

export async function jellyfinRequest(path, { method = 'GET', body, query, token } = {}) {
  const activeToken = token || getServerToken();
  const url = new URL(`${JELLYFIN_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type':         'application/json',
      'X-Emby-Authorization': authHeader(activeToken),
      // Algunas versiones de Jellyfin prefieren este header para el token;
      // lo mandamos también por compatibilidad.
      ...(activeToken ? { 'X-Emby-Token': activeToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`Jellyfin ${method} ${path}: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function jellyfinGetAll(path, query = {}, token) {
  const PAGE = 5000;
  let start  = 0;
  const all  = [];
  while (true) {
    const res   = await jellyfinRequest(path, { query: { ...query, StartIndex: start, Limit: PAGE }, token });
    const items = res?.Items || [];
    all.push(...items);
    if (all.length >= (res?.TotalRecordCount || 0) || items.length < PAGE) break;
    start += PAGE;
  }
  return all;
}
