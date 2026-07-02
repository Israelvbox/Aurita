import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, getDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

// En Linux/X11, el WM_CLASS de la ventana se deriva del nombre de la app.
// GNOME Shell compara ese WM_CLASS contra StartupWMClass del .desktop para
// decidir qué icono mostrar en la barra de tareas — si no coinciden, cae
// al icono genérico aunque el .png esté instalado correctamente. Por eso
// hace falta fijarlo explícitamente, en vez de confiar en el valor por
// defecto (que sale de package.json "name", en minúsculas: "aurita").
app.setName('Aurita');

// En Windows, sin esto el sistema puede agrupar la ventana bajo un ID
// genérico y mostrar el icono por defecto en notificaciones/taskbar en
// vez del icono real de la app, aunque BrowserWindow tenga `icon` puesto.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.aurita.app');
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e0e10',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
    console.error('[Aurita] Falló la carga de la ventana:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Aurita] El proceso de la ventana se cerró inesperadamente:', details);
  });
}

app.whenReady().then(() => {
  // Importante: la ventana se crea SIEMPRE, pase lo que pase con la base de
  // datos. Si initDb() fallara (p.ej. el módulo nativo de SQLite no se
  // compiló bien para esta versión de Electron) antes arrancábamos la BD y
  // LUEGO la ventana, así que un fallo aquí dejaba la app sin ventana visible
  // y sin ningún error claro en pantalla.
  try {
    initDb(path.join(app.getPath('userData'), 'aurita.db'));
  } catch (err) {
    console.error('[Aurita] No se pudo inicializar la base de datos local:', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

process.on('uncaughtException', (err) => {
  console.error('[Aurita] Error no capturado en el proceso principal:', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- IPC: credenciales seguras (token de Jellyfin) ---------- */
ipcMain.handle('secure:set', (_e, key, value) => {
  const db = getDb();
  if (!db) return false;
  const encrypted = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(value).toString('base64')
    : Buffer.from(value).toString('base64');
  db.prepare(
    'INSERT INTO secure_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).run(key, encrypted);
  return true;
});

ipcMain.handle('secure:get', (_e, key) => {
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT value FROM secure_kv WHERE key = ?').get(key);
  if (!row) return null;
  const buf = Buffer.from(row.value, 'base64');
  try {
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf-8');
  } catch {
    return null;
  }
});

ipcMain.handle('secure:clear', () => {
  const db = getDb();
  if (!db) return false;
  db.prepare('DELETE FROM secure_kv').run();
  return true;
});

/* ---------- IPC: caché genérico de items de Jellyfin ---------- */
ipcMain.handle('cache:set', (_e, scope, key, json, ttlMs) => {
  const db = getDb();
  if (!db) return false;
  const expiresAt = ttlMs ? Date.now() + ttlMs : null;
  db.prepare(
    `INSERT INTO cache (scope, key, json, expires_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(scope, key) DO UPDATE SET json=excluded.json, expires_at=excluded.expires_at`
  ).run(scope, key, json, expiresAt);
  return true;
});

ipcMain.handle('cache:get', (_e, scope, key) => {
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT json, expires_at FROM cache WHERE scope = ? AND key = ?').get(scope, key);
  if (!row) return null;
  if (row.expires_at && row.expires_at < Date.now()) {
    db.prepare('DELETE FROM cache WHERE scope = ? AND key = ?').run(scope, key);
    return null;
  }
  return row.json;
});

ipcMain.handle('cache:clearScope', (_e, scope) => {
  const db = getDb();
  if (!db) return false;
  db.prepare('DELETE FROM cache WHERE scope = ?').run(scope);
  return true;
});

ipcMain.handle('cache:delete', (_e, scope, key) => {
  const db = getDb();
  if (!db) return false;
  db.prepare('DELETE FROM cache WHERE scope = ? AND key = ?').run(scope, key);
  return true;
});

/* ---------- IPC: historial de escucha (para los mixes) ---------- */
ipcMain.handle('history:add', (_e, entry) => {
  const db = getDb();
  if (!db) return false;
  db.prepare(
    `INSERT INTO listen_history (item_id, name, artist, genres, played_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(entry.itemId, entry.name, entry.artist, JSON.stringify(entry.genres || []), Date.now());
  return true;
});

ipcMain.handle('history:recentGenres', (_e, sinceDays = 7) => {
  const db = getDb();
  if (!db) return {};
  const since = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const rows = db
    .prepare('SELECT genres FROM listen_history WHERE played_at >= ?')
    .all(since);
  const counts = {};
  for (const r of rows) {
    const genres = JSON.parse(r.genres || '[]');
    for (const g of genres) counts[g] = (counts[g] || 0) + 1;
  }
  return counts;
});

ipcMain.handle('history:topItemsByGenre', (_e, genre, limit = 30) => {
  const db = getDb();
  if (!db) return [];
  const rows = db
    .prepare(
      `SELECT item_id, name, artist, genres, COUNT(*) as plays
       FROM listen_history
       WHERE genres LIKE ?
       GROUP BY item_id
       ORDER BY plays DESC
       LIMIT ?`
    )
    .all(`%${genre}%`, limit);
  return rows;
});
