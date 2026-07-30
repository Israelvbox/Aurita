import { service } from '../api/service.js';
import { jellyfin } from '../api/jellyfin.js';
import { historyStore, cacheStore } from '../db/storage.js';

const CACHE_TTL = 30 * 60 * 1000;

async function cachedMix(key, fn) {
  const cached = await cacheStore.get('mix', key);
  if (cached) return cached;
  const data = await fn();
  cacheStore.set('mix', key, data, CACHE_TTL).catch(() => {});
  return data;
}

const MIN_MIXES = 4;
const MAX_MIXES = 6;
const MIX_SIZE_MIN = 50;
const MIX_SIZE_MAX = 50;

const _genreItemsCache = new Map();
async function getCachedItemsByGenre(genre, limit) {
  const key = `${genre}:${limit}`;
  if (_genreItemsCache.has(key)) return _genreItemsCache.get(key);
  const res = await service.getItemsByGenre(genre, limit);
  _genreItemsCache.set(key, res);
  return res;
}

const MIX_NAMES = [
  'Mezcla', 'Descubrimientos', 'Vibra', 'Sesión', 'Ritmo',
  'Melodía', 'Armonía', 'Compás', 'Fusión', 'Latido',
];

function mixSize() {
  return MIX_SIZE_MIN + Math.floor(Math.random() * (MIX_SIZE_MAX - MIX_SIZE_MIN + 1));
}

function pickName() {
  return MIX_NAMES[Math.floor(Math.random() * MIX_NAMES.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function topGenres(days = 1, limit = MAX_MIXES) {
  const counts = await historyStore.recentGenres(days);
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return [];
  const topPlays = entries[0][1];
  const minPlays = Math.max(3, Math.floor(topPlays * 0.1));
  return entries
    .filter(([, plays]) => plays >= minPlays)
    .slice(0, limit)
    .map(([genre, plays]) => ({ genre, plays }));
}

async function fallbackGenres(exclude = new Set(), limit = MAX_MIXES) {
  try {
    const res = await jellyfin.getGenres();
    const all = (res.Items || []).map(g => g.Name).filter(g => !exclude.has(g));
    return shuffle(all).slice(0, limit);
  } catch {
    return [];
  }
}

async function buildMixForGenre(genre, { knownRatio = 0.5 } = {}) {
  const size = mixSize();
  const knownCount = Math.round(size * knownRatio);
  const discoverCount = size - knownCount;

  const [known, candidates] = await Promise.all([
    historyStore.topItemsByGenre(genre, knownCount * 2),
    getCachedItemsByGenre(genre, size * 2),
  ]);

  const knownIds = new Set(known.map((k) => k.item_id));
  const items = candidates.Items || [];

  const knownResolved = known
    .map((k) => items.find((i) => i.Id === k.item_id))
    .filter(Boolean)
    .slice(0, knownCount);

  const discoveries = items
    .filter((i) => !knownIds.has(i.Id))
    .slice(0, discoverCount);

  const combined = shuffle([...knownResolved, ...discoveries]).slice(0, size);

  if (combined.length === 0) return null;

  return {
    genre,
    title: `${pickName()} — ${genre}`,
    items: combined,
  };
}

async function buildRandomMix() {
  const size = mixSize();
  const candidates = await service.getAllAudio(size * 2);
  const items = (candidates.Items || []).slice(0, size);
  if (items.length === 0) return null;
  return {
    genre: 'random',
    title: 'Para ti',
    items: shuffle(items).slice(0, size),
  };
}

async function ensureMixCount(mixes, knownRatio, usedGenres, maxMixes) {
  // Already enough
  if (mixes.length >= MIN_MIXES) return mixes.slice(0, maxMixes);

  // Try additional genres
  const extras = await fallbackGenres(usedGenres, maxMixes);
  for (const genre of extras) {
    usedGenres.add(genre);
    const m = await buildMixForGenre(genre, { knownRatio });
    if (m) mixes.push(m);
    if (mixes.length >= MIN_MIXES) break;
  }

  // Last resort: random mix
  while (mixes.length < MIN_MIXES) {
    const rm = await buildRandomMix();
    if (!rm) break;
    mixes.push(rm);
  }

  return mixes.slice(0, maxMixes);
}

async function getMixes(days, knownRatio, namePrefix) {
  const genres = await topGenres(days, MAX_MIXES);
  const usedGenres = new Set(genres.map(g => g.genre));
  let genresToTry = genres.map(g => g.genre);

  // If not enough from history, grab more genres
  if (genresToTry.length < MAX_MIXES) {
    const extra = await fallbackGenres(usedGenres, MAX_MIXES - genresToTry.length);
    extra.forEach(g => usedGenres.add(g));
    genresToTry = [...genresToTry, ...extra];
  }

  const mixes = (await Promise.all(
    genresToTry.map(genre => buildMixForGenre(genre, { knownRatio }))
  )).filter(Boolean);

  const result = await ensureMixCount(mixes, knownRatio, usedGenres, MAX_MIXES);
  if (result.length === 0) return [];

  return result.map(m => ({
    ...m,
    title: `${namePrefix} — ${m.genre}`,
  }));
}

export async function getDailyMixes() {
  return cachedMix('daily', () => getMixes(1, 0.7, 'Mix de hoy'));
}

export async function getWeeklyMixes() {
  return cachedMix('weekly', () => getMixes(7, 0.5, 'Mix semanal'));
}

export async function getRecommendedPlaylists() {
  return cachedMix('recommended', () => _getRecommended());
}

async function _getRecommended() {
  const genres = await topGenres(30, MAX_MIXES + 3);
  const usedGenres = new Set(genres.map(g => g.genre));
  const topThree = genres.slice(0, 3).map(g => g.genre);
  const rest = genres.slice(3, MAX_MIXES + 3).map(g => g.genre);
  let targets = (rest.length > 0 ? rest : topThree).slice(0, MAX_MIXES);

  // Not enough from history? grab more genres
  if (targets.length < MAX_MIXES) {
    const extra = await fallbackGenres(usedGenres, MAX_MIXES - targets.length);
    extra.forEach(g => usedGenres.add(g));
    targets = [...targets, ...extra];
  }

  const mixes = (await Promise.all(
    targets.map(async (genre) => {
      const res = await getCachedItemsByGenre(genre, mixSize());
      const items = (res.Items || []).slice(0, MIX_SIZE_MAX);
      if (items.length === 0) return null;
      return {
        genre,
        title: `Descubre: ${genre}`,
        items: shuffle(items),
      };
    })
  )).filter(Boolean);

  const result = await ensureMixCount(mixes, 0.5, usedGenres, MAX_MIXES);
  return result.map(m => ({
    ...m,
    title: m.genre === 'random' ? m.title : `Descubre: ${m.genre}`,
  }));
}
