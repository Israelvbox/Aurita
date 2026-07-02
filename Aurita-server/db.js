import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encrypt, decrypt } from './crypto.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'aurita.db');

let _db = null;

export function getDb() {
  if (!_db) throw new Error('Base de datos no inicializada');
  return _db;
}

export function initDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    /* ── Pistas ─────────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS tracks (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      album_id    TEXT,
      album_name  TEXT,
      artist_id   TEXT,
      artist      TEXT,
      genres      TEXT DEFAULT '[]',
      year        INTEGER,
      duration_s  INTEGER,
      image_tag   TEXT,
      synced_at   INTEGER NOT NULL
    );

    /* FTS5: búsqueda por nombre, álbum y artista */
    CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
      id UNINDEXED,
      name,
      album_name,
      artist,
      content = tracks,
      tokenize = 'unicode61 remove_diacritics 1'
    );

    CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
      INSERT INTO tracks_fts(rowid, id, name, album_name, artist)
      VALUES (new.rowid, new.id, new.name, new.album_name, new.artist);
    END;
    CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, id, name, album_name, artist)
      VALUES ('delete', old.rowid, old.id, old.name, old.album_name, old.artist);
    END;
    CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, id, name, album_name, artist)
      VALUES ('delete', old.rowid, old.id, old.name, old.album_name, old.artist);
      INSERT INTO tracks_fts(rowid, id, name, album_name, artist)
      VALUES (new.rowid, new.id, new.name, new.album_name, new.artist);
    END;

    /* ── Álbumes ──────────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS albums (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      artist      TEXT,
      artist_id   TEXT,
      genres      TEXT DEFAULT '[]',
      year        INTEGER,
      image_tag   TEXT
    );

    /* ── Artistas ─────────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS artists (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      image_tag    TEXT,
      backdrop_tag TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS artists_fts USING fts5(
      id UNINDEXED,
      name,
      content = artists,
      tokenize = 'unicode61 remove_diacritics 1'
    );

    CREATE TRIGGER IF NOT EXISTS artists_ai AFTER INSERT ON artists BEGIN
      INSERT INTO artists_fts(rowid, id, name)
      VALUES (new.rowid, new.id, new.name);
    END;
    CREATE TRIGGER IF NOT EXISTS artists_ad AFTER DELETE ON artists BEGIN
      INSERT INTO artists_fts(artists_fts, rowid, id, name)
      VALUES ('delete', old.rowid, old.id, old.name);
    END;
    CREATE TRIGGER IF NOT EXISTS artists_au AFTER UPDATE ON artists BEGIN
      INSERT INTO artists_fts(artists_fts, rowid, id, name)
      VALUES ('delete', old.rowid, old.id, old.name);
      INSERT INTO artists_fts(rowid, id, name)
      VALUES (new.rowid, new.id, new.name);
    END;

    /* ── Géneros ──────────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS genres (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      sort_name TEXT
    );

    /* ── Metadatos de sincronización ──────────────────────────── */
    CREATE TABLE IF NOT EXISTS sync_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  console.log('[DB] Inicializada en', DB_PATH);
  return _db;
}

/* ── Helpers de escritura (upsert) ───────────────────────────── */

export function upsertTrack(t) {
  getDb().prepare(`
    INSERT INTO tracks (id, name, album_id, album_name, artist_id, artist, genres, year, duration_s, image_tag, synced_at)
    VALUES (@id, @name, @album_id, @album_name, @artist_id, @artist, @genres, @year, @duration_s, @image_tag, @synced_at)
    ON CONFLICT(id) DO UPDATE SET
      name       = excluded.name,
      album_id   = excluded.album_id,
      album_name = excluded.album_name,
      artist_id  = excluded.artist_id,
      artist     = excluded.artist,
      genres     = excluded.genres,
      year       = excluded.year,
      duration_s = excluded.duration_s,
      image_tag  = excluded.image_tag,
      synced_at  = excluded.synced_at
  `).run(t);
}

export function upsertAlbum(a) {
  getDb().prepare(`
    INSERT INTO albums (id, name, artist, artist_id, genres, year, image_tag)
    VALUES (@id, @name, @artist, @artist_id, @genres, @year, @image_tag)
    ON CONFLICT(id) DO UPDATE SET
      name      = excluded.name,
      artist    = excluded.artist,
      artist_id = excluded.artist_id,
      genres    = excluded.genres,
      year      = excluded.year,
      image_tag = excluded.image_tag
  `).run(a);
}

export function upsertArtist(a) {
  getDb().prepare(`
    INSERT INTO artists (id, name, image_tag, backdrop_tag)
    VALUES (@id, @name, @image_tag, @backdrop_tag)
    ON CONFLICT(id) DO UPDATE SET
      name         = excluded.name,
      image_tag    = excluded.image_tag,
      backdrop_tag = excluded.backdrop_tag
  `).run(a);
}

export function upsertGenre(g) {
  getDb().prepare(`
    INSERT INTO genres (id, name, sort_name)
    VALUES (@id, @name, @sort_name)
    ON CONFLICT(id) DO UPDATE SET
      name      = excluded.name,
      sort_name = excluded.sort_name
  `).run(g);
}

const SECRET_KEYS = new Set(['serverToken']);

export function setSyncMeta(key, value) {
  const stored = SECRET_KEYS.has(key)
    ? encrypt(JSON.stringify(value))
    : JSON.stringify(value);
  getDb().prepare(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, stored);
}

export function getSyncMeta(key) {
  const row = getDb().prepare('SELECT value FROM sync_meta WHERE key = ?').get(key);
  if (!row) return null;
  if (SECRET_KEYS.has(key)) {
    if (row.value.includes(':')) {
      const decrypted = decrypt(row.value);
      if (decrypted) return JSON.parse(decrypted);
    }
    try {
      const parsed = JSON.parse(row.value);
      setSyncMeta(key, parsed);
      return parsed;
    } catch {
      return null;
    }
  }
  return JSON.parse(row.value);
}

/* ── Limpieza de registros huérfanos ────────────────────────── */

export function deleteWhereNotIn(table, ids) {
  if (ids.size === 0) return;
  const placeholders = [...ids].map(() => '?').join(',');
  getDb().prepare(`DELETE FROM ${table} WHERE id NOT IN (${placeholders})`).run(...ids);
}

/* ── Helpers de lectura ──────────────────────────────────────── */

export function formatTrack(row) {
  return {
    Id:          row.id,
    Name:        row.name,
    AlbumId:     row.album_id,
    Album:       row.album_name,
    AlbumArtist: row.artist,
    ArtistId:    row.artist_id,
    Genres:      JSON.parse(row.genres || '[]'),
    ProductionYear: row.year,
    RunTimeTicks: row.duration_s ? row.duration_s * 10_000_000 : null,
    ImageTags:   row.image_tag ? { Primary: row.image_tag } : {},
    Type:        'Audio',
  };
}

export function formatAlbum(row) {
  return {
    Id:             row.id,
    Name:           row.name,
    AlbumArtist:    row.artist,
    ArtistId:       row.artist_id,
    Genres:         JSON.parse(row.genres || '[]'),
    ProductionYear: row.year,
    ImageTags:      row.image_tag ? { Primary: row.image_tag } : {},
    Type:           'MusicAlbum',
  };
}

export function formatArtist(row) {
  return {
    Id:        row.id,
    Name:      row.name,
    ImageTags: row.image_tag ? { Primary: row.image_tag } : {},
    BackdropImageTags: row.backdrop_tag ? [row.backdrop_tag] : [],
    Type:      'MusicArtist',
  };
}
