export function formatDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

export function formatTotalDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export const PALETTE = ['#5b2a86','#3b1f6b','#7c3aed','#9333ea','#6d28d9','#4c1d95','#8b5cf6','#a855f7','#581c87','#6b21a8','#7e22ce','#86198f','#701a75','#4338ca','#312e81'];

export function colorFor(n) {
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function normalize(s = '') {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
