import { service } from '../api/service.js';
import { historyStore } from '../db/storage.js';

const MAX_MIXES = 6;
const MIX_SIZE_MIN = 12;
const MIX_SIZE_MAX = 18;
let mixCache = null;
let mixCacheTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;

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
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre, plays]) => ({ genre, plays }));
}

async function buildMixForGenre(genre, { knownRatio = 0.5 } = {}) {
  const size = mixSize();
  const knownCount = Math.round(size * knownRatio);
  const discoverCount = size - knownCount;

  const [known, candidates] = await Promise.all([
    historyStore.topItemsByGenre(genre, knownCount * 2),
    service.getItemsByGenre(genre, size * 4),
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

export async function getWeeklyMixes() {
  const genres = await topGenres(1, MAX_MIXES);
  if (genres.length === 0) {
    const fallback = await buildRandomMix();
    return fallback ? [fallback] : [];
  }

  const mixes = await Promise.all(
    genres.map(({ genre }) => buildMixForGenre(genre, { knownRatio: 0.5 }))
  );
  return mixes.filter(Boolean).slice(0, MAX_MIXES);
}

export async function getRecommendedPlaylists() {
  const genres = await topGenres(30, MAX_MIXES + 3);
  const topFive = genres.slice(0, 3).map((g) => g.genre);
  const rest = genres.slice(3, MAX_MIXES + 3).map((g) => g.genre);
  const targetGenres = (rest.length > 0 ? rest : topFive).slice(0, MAX_MIXES);

  const mixes = await Promise.all(
    targetGenres.map(async (genre) => {
      const res = await service.getItemsByGenre(genre, mixSize());
      const items = (res.Items || []).slice(0, MIX_SIZE_MAX);
      if (items.length === 0) return null;
      return {
        genre,
        title: `Descubre: ${genre}`,
        items: shuffle(items),
      };
    })
  );

  const results = mixes.filter(Boolean).slice(0, MAX_MIXES);
  if (results.length === 0) {
    const fallback = await buildRandomMix();
    if (fallback) results.push(fallback);
  }
  return results;
}
