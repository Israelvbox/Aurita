import { service } from '../api/service.js';
import { historyStore } from '../db/storage.js';

const MAX_MIXES = 6;
const MIX_SIZE_MIN = 12;
const MIX_SIZE_MAX = 15;

function mixSize() {
  return MIX_SIZE_MIN + Math.floor(Math.random() * (MIX_SIZE_MAX - MIX_SIZE_MIN + 1));
}

// Devuelve los N géneros más escuchados en los últimos `days` días.
// Por defecto 1 día: los mixes se regeneran a diario según lo que vas
// escuchando, no se quedan fijos toda la semana.
async function topGenres(days = 1, limit = MAX_MIXES) {
  const counts = await historyStore.recentGenres(days);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre, plays]) => ({ genre, plays }));
}

async function buildMixForGenre(genre, { knownRatio = 0.6 } = {}) {
  const size = mixSize();
  const knownCount = Math.round(size * knownRatio);
  const discoverCount = size - knownCount;

  const [known, candidates] = await Promise.all([
    historyStore.topItemsByGenre(genre, knownCount),
    service.getItemsByGenre(genre, size * 3),
  ]);

  const knownIds = new Set(known.map((k) => k.item_id));
  const items = candidates.Items || [];

  const discoveries = items.filter((i) => !knownIds.has(i.Id)).slice(0, discoverCount);
  const knownResolved = known.map((k) => items.find((i) => i.Id === k.item_id)).filter(Boolean);

  return {
    genre,
    title: `Mix de ${genre}`,
    items: shuffle([...knownResolved, ...discoveries]).slice(0, size),
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Mixes del día (máximo 6), uno por cada género más escuchado hoy.
export async function getWeeklyMixes() {
  const genres = await topGenres(1, MAX_MIXES);
  if (genres.length === 0) return [];
  const mixes = await Promise.all(genres.map(({ genre }) => buildMixForGenre(genre)));
  return mixes.filter((m) => m.items.length > 0).slice(0, MAX_MIXES);
}

// Recomendados: géneros que sonaron algo en los últimos 30 días pero no son
// los más escuchados de hoy, para fomentar descubrimiento sin perder relación
// con tus gustos reales.
export async function getRecommendedPlaylists() {
  const genres = await topGenres(30, MAX_MIXES + 3);
  const topFive = genres.slice(0, 3).map((g) => g.genre);
  const rest = genres.slice(3, MAX_MIXES + 3).map((g) => g.genre);
  const targetGenres = (rest.length > 0 ? rest : topFive).slice(0, MAX_MIXES);

  const mixes = await Promise.all(
    targetGenres.map(async (genre) => {
      const res = await service.getItemsByGenre(genre, mixSize());
      return { genre, title: `Recomendado: ${genre}`, items: res.Items || [] };
    })
  );
  return mixes.filter((m) => m.items.length > 0).slice(0, MAX_MIXES);
}
