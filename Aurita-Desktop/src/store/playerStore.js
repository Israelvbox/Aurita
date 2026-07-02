/**
 * playerStore.js — Desktop (Electron)
 *
 * Motor de audio con Web Audio API (crossfade, latencia controlada).
 * Usa MediaElementAudioSourceNode para mantener el streaming de Jellyfin
 * (no descarga canciones enteras) pero con control fino de volumen,
 * crossfade y latencia.
 */
import { create } from 'zustand';
import { jellyfin } from '../api/jellyfin.js';
import { service } from '../api/service.js';
import { historyStore, cacheStore } from '../db/storage.js';
import { getEffectiveGenres } from '../api/genreIndex.js';

const AUTOFILL_THRESHOLD = 0.85;
const CROSSFADE_MS = 200;

let ctx = null;
let masterGain = null;
let audioSource = null;
let audioGain = null;

function ensureAudioContext() {
  if (ctx) return;
  try {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    masterGain.gain.value = 1;
    audioSource = ctx.createMediaElementSource(audio);
    audioGain = ctx.createGain();
    audioGain.gain.value = 1;
    audioSource.connect(audioGain);
    audioGain.connect(masterGain);
  } catch (err) {
    console.warn('[Aurita] Web Audio init failed:', err);
    ctx = null;
    masterGain = null;
    audioSource = null;
    audioGain = null;
  }
}

const audio = new Audio();
audio.preload = 'auto';
audio.crossOrigin = 'anonymous';

const prefetchAudio = new Audio();
prefetchAudio.preload = 'auto';
prefetchAudio.crossOrigin = 'anonymous';
let prefetchUrl = '';

export function prefetchAudioForTrack(url) {
  if (!url || prefetchUrl === url) return;
  prefetchUrl = url;
  prefetchAudio.src = url;
  prefetchAudio.load();
}

const warmedIds = new Set();
export function warmTrack(id) {
  if (!id || warmedIds.has(id)) return;
  warmedIds.add(id);
  const url = jellyfin.streamUrl(id);
  prefetchAudioForTrack(url);
  fetch(url, { headers: { Range: 'bytes=0-1048575' } }).catch(() => {});
}

function warmUpcoming(queue, currentIndex) {
  warmTrack(queue[currentIndex + 1]?.Id);
  warmTrack(queue[currentIndex + 2]?.Id);
  warmTrack(queue[currentIndex + 3]?.Id);
}

export function warmFirstTracks(items, count = 3) {
  (items || []).slice(0, count).forEach(item => warmTrack(item?.Id));
}

function fadeOut(durationMs = CROSSFADE_MS) {
  if (!audioGain) return Promise.resolve();
  return new Promise(resolve => {
    const now = ctx.currentTime;
    audioGain.gain.cancelScheduledValues(now);
    audioGain.gain.setValueAtTime(audioGain.gain.value, now);
    audioGain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
    setTimeout(resolve, durationMs + 20);
  });
}

function fadeIn(durationMs = CROSSFADE_MS) {
  if (!audioGain) return;
  const now = ctx.currentTime;
  audioGain.gain.cancelScheduledValues(now);
  audioGain.gain.setValueAtTime(0, now);
  audioGain.gain.linearRampToValueAtTime(1, now + durationMs / 1000);
}

export const usePlayerStore = create((set, get) => {

  let _markedPlayed = new Set();
  let _isTransitioning = false;

  audio.addEventListener('play',  () => set({ isPlaying: true }));
  audio.addEventListener('pause', () => set({ isPlaying: false }));

  audio.addEventListener('timeupdate', () => {
    if (_isTransitioning) return;
    const { queue, currentIndex } = get();
    const current = queue[currentIndex];
    set({ currentTime: audio.currentTime });
    if (current && audio.currentTime >= 30 && !_markedPlayed.has(current.Id)) {
      _markedPlayed.add(current.Id);
      jellyfin.markPlayed(current.Id).catch(() => {});
    }
    if (audio.duration > 0 && audio.currentTime / audio.duration >= AUTOFILL_THRESHOLD) {
      get()._maybeAutoFill();
    }
  });

  audio.addEventListener('ended', async () => {
    if (_isTransitioning) return;
    const { queue, currentIndex } = get();
    const current = queue[currentIndex];
    if (current && !_markedPlayed.has(current.Id)) {
      _markedPlayed.add(current.Id);
      jellyfin.markPlayed(current.Id).catch(() => {});
    }
    get().next();
  });

  function onDurationKnown() {
    if (!_isTransitioning && Number.isFinite(audio.duration) && audio.duration > 0) {
      set({ duration: audio.duration });
    }
  }
  audio.addEventListener('loadedmetadata', onDurationKnown);
  audio.addEventListener('durationchange', onDurationKnown);
  audio.addEventListener('error', (e) => console.error('[Aurita] Error de audio:', e));

  const QUEUE_SAVE_KEY = 'player_queue';
  const MIN_ITEMS_TO_SAVE = 5;

  function persist(state) {
    const { queue, currentIndex, volume, repeatMode, shuffle } = state;
    if (queue.length >= MIN_ITEMS_TO_SAVE || currentIndex >= 0) {
      cacheStore.set('player', QUEUE_SAVE_KEY, {
        queue: queue.slice(0, 100),
        currentIndex,
        volume,
        repeatMode,
        shuffle,
        savedAt: Date.now(),
      }, 24 * 60 * 60 * 1000).catch(() => {});
    }
  }

  async function switchTrack(item, newQueue, idx) {
    _isTransitioning = true;

    ensureAudioContext();

    await fadeOut(CROSSFADE_MS);

    audio.pause();
    audio.src = '';

    const url = jellyfin.streamUrl(item.Id);
    if (prefetchUrl === url && prefetchAudio.src) {
      prefetchAudio.pause();
      prefetchUrl = '';
    }

    audio.src = url;
    audio.load();

    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }

    fadeIn(CROSSFADE_MS);

    try {
      await audio.play();
    } catch (err) {
      console.warn('[Aurita] No se pudo reproducir:', err);
    }

    _isTransitioning = false;
  }

  return {
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    repeatMode: 'off',
    shuffle: false,
    autoFilling: false,
    _autoFillSourceId: null,

    async restoreQueue() {
      const saved = await cacheStore.get('player', QUEUE_SAVE_KEY);
      if (!saved || !saved.queue?.length) return;
      if (Date.now() - saved.savedAt > 24 * 60 * 60 * 1000) return;
      const vol = saved.volume ?? 1;
      ensureAudioContext();
      if (masterGain) masterGain.gain.value = vol;
      set({
        queue: saved.queue,
        currentIndex: Math.min(saved.currentIndex, saved.queue.length - 1),
        volume: vol,
        repeatMode: saved.repeatMode || 'off',
        shuffle: saved.shuffle || false,
      });
    },

    async playItem(item, queue = null) {
      const newQueue = queue || [item];
      const index = newQueue.findIndex(i => i.Id === item.Id);
      const idx = index === -1 ? 0 : index;

      const durationFromMeta = item.RunTimeTicks
        ? item.RunTimeTicks / 10_000_000
        : 0;

      set({ queue: newQueue, currentIndex: idx, currentTime: 0, duration: durationFromMeta, _autoFillSourceId: null });
      persist(get());

      await switchTrack(item, newQueue, idx);

      getEffectiveGenres(item).then(genres => {
        historyStore.add({
          itemId: item.Id, name: item.Name,
          artist: item.AlbumArtist || (item.Artists || [])[0] || '',
          genres,
        });
      });
      warmUpcoming(newQueue, idx);

      if ('mediaSession' in navigator) {
        const artistName = item.AlbumArtist || (item.Artists || [])[0] || '';
        navigator.mediaSession.metadata = new MediaMetadata({
          title: item.Name,
          artist: artistName,
          album: item.Album || '',
          artwork: [{ src: jellyfin.imageUrl(item.AlbumId || item.Id, 'Primary', 512), sizes: '512x512', type: 'image/jpeg' }],
        });
        navigator.mediaSession.setActionHandler('play', () => { audio.play().catch(() => {}); set({ isPlaying: true }); });
        navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); set({ isPlaying: false }); });
        navigator.mediaSession.setActionHandler('previoustrack', () => get().prev());
        navigator.mediaSession.setActionHandler('nexttrack', () => get().next(true));
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime != null) { audio.currentTime = details.seekTime; set({ currentTime: details.seekTime }); }
        });
      }
    },

    togglePlay() {
      if (get().currentIndex < 0) return;
      if (audio.paused) {
        ensureAudioContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    },

    seekTo(seconds) {
      audio.currentTime = seconds;
      set({ currentTime: seconds });
    },

    setVolume(v) {
      if (masterGain) masterGain.gain.value = v;
      set({ volume: v });
      persist(get());
    },

    toggleRepeat() {
      const order = ['off', 'all', 'one'];
      const next = order[(order.indexOf(get().repeatMode) + 1) % order.length];
      set({ repeatMode: next });
    },

    toggleShuffle() { set({ shuffle: !get().shuffle }); },

    next(manual = false) {
      const { queue, currentIndex, repeatMode, shuffle, playItem } = get();
      if (queue.length === 0) return;

      if (repeatMode === 'one' && !manual) {
        audio.currentTime = 0;
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        audio.play().catch(() => {});
        return;
      }

      let nextIndex = shuffle
        ? Math.floor(Math.random() * queue.length)
        : currentIndex + 1;

      if (nextIndex >= queue.length) {
        if (repeatMode === 'all') nextIndex = 0;
        else return;
      }
      playItem(queue[nextIndex], queue);
    },

    prev() {
      const { queue, currentIndex, playItem } = get();
      if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
      }
      if (currentIndex > 0) playItem(queue[currentIndex - 1], queue);
      else { audio.currentTime = 0; }
    },

    playFromQueueAt(index) {
      const { queue, playItem } = get();
      if (queue[index]) playItem(queue[index], queue);
    },

    removeFromQueue(index) {
      const { queue, currentIndex } = get();
      if (index === currentIndex) return;
      const newQueue = queue.filter((_, i) => i !== index);
      const newIndex = index < currentIndex ? currentIndex - 1 : currentIndex;
      set({ queue: newQueue, currentIndex: newIndex });
      persist(get());
    },

    addNextManual(item) {
      const { queue, currentIndex } = get();
      const newQueue = [...queue];
      newQueue.splice(currentIndex + 1, 0, item);
      set({ queue: newQueue });
      persist(get());
      warmUpcoming(newQueue, currentIndex);
    },

    async _maybeAutoFill() {
      const { queue, currentIndex, autoFilling, _autoFillSourceId } = get();
      const remaining = queue.length - 1 - currentIndex;
      const current = queue[currentIndex];
      if (!current || autoFilling || remaining > 2) return;
      if (_autoFillSourceId === current.Id) return;

      set({ autoFilling: true, _autoFillSourceId: current.Id });
      try {
        const res = await service.getInstantMix(current.Id, 20);
        const existingIds = new Set(queue.map(i => i.Id));
        let fresh = (res.Items || []).filter(i => !existingIds.has(i.Id));
        const currentGenres = new Set(current.Genres || []);
        if (currentGenres.size > 0) {
          const related = fresh.filter(i => (i.Genres || []).some(g => currentGenres.has(g)));
          fresh = [...related, ...fresh.filter(i => !related.includes(i))];
        }
        fresh = fresh.slice(0, 10);
        if (fresh.length > 0) {
          set(state => ({ queue: [...state.queue, ...fresh] }));
          persist(get());
          warmUpcoming(get().queue, get().currentIndex);
        }
      } catch (err) {
        console.warn('[Aurita] No se pudo autocompletar la cola:', err);
      } finally {
        set({ autoFilling: false });
      }
    },
  };
});
