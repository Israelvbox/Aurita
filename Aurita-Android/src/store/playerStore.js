import { create } from 'zustand';
import { registerPlugin } from '@capacitor/core';
import { jellyfin } from '../api/jellyfin.js';
import { service } from '../api/service.js';
import { historyStore, cacheStore } from '../db/storage.js';
import { getEffectiveGenres } from '../api/genreIndex.js';

const AuritaPlayer = registerPlugin('AuritaPlayer');

const AUTOFILL_THRESHOLD = 0.85;
const MAX_PRELOADED = 200;
const QUEUE_SAVE_KEY = 'player_queue';

const preloadedIds = new Set();
function markPreloaded(id) {
  if (preloadedIds.size >= MAX_PRELOADED) {
    const first = preloadedIds.values().next().value;
    if (first !== undefined) preloadedIds.delete(first);
  }
  preloadedIds.add(id);
}

export function warmTrack(id) {
  if (!id || preloadedIds.has(id)) return;
  markPreloaded(id);
  const url = jellyfin.streamUrl(id);
  AuritaPlayer.preloadTrack({ url }).catch(() => {
    fetch(url, { headers: { Range: 'bytes=0-1048575' } }).catch(() => {});
  });
}

function warmUpcoming(queue, currentIndex) {
  warmTrack(queue[currentIndex + 1]?.Id);
  warmTrack(queue[currentIndex + 2]?.Id);
  warmTrack(queue[currentIndex + 3]?.Id);
}

export function warmFirstTracks(items, count = 3) {
  (items || []).slice(0, count).forEach((item) => warmTrack(item?.Id));
}

function serializeTracks(queue) {
  return queue.map((item) => ({
    url: jellyfin.streamUrl(item.Id),
    title: item.Name,
    artist: item.AlbumArtist || (item.Artists || [])[0] || '',
    album: item.Album || '',
    artworkUrl: jellyfin.imageUrl(item.AlbumId || item.Id, 'Primary', 512),
    duration: item.RunTimeTicks ? Math.round(item.RunTimeTicks / 10_000_000) : 0,
  }));
}

function persistQueue(state) {
  const { queue, currentIndex, repeatMode, shuffle, duration } = state;
  cacheStore.set('player', QUEUE_SAVE_KEY, {
    queue: queue.slice(0, 100),
    currentIndex,
    repeatMode,
    shuffle,
    duration,
    savedAt: Date.now(),
  }, 24 * 60 * 60 * 1000).catch(() => {});
}

export const usePlayerStore = create((set, get) => {
  let _markedPlayed = new Set();

  AuritaPlayer.addListener('stateChanged', (data) => {
    const prevIndex = get().currentIndex;
    const isNewTrack = data.currentIndex >= 0 && data.currentIndex !== prevIndex;
    const offset = isNewTrack ? 0 : get()._seekOffset;

    const updates = { isPlaying: data.isPlaying };
    // Tras seek, ExoPlayer reporta position 0 (nuevo stream con startTimeTicks).
    // Sumamos el offset para que la barra muestre la posición real.
    if (data.position > 0 || get().currentTime === 0) {
      updates.currentTime = (data.position || 0) + offset;
    }
    if (isNewTrack && data.duration > 0) updates.duration = data.duration;
    if (data.currentIndex >= 0) updates.currentIndex = data.currentIndex;
    if (isNewTrack) updates._seekOffset = 0;
    set(updates);

    const state = get();
    const current = state.queue[state.currentIndex];

    if (current && data.position >= 30 && !_markedPlayed.has(current.Id)) {
      _markedPlayed.add(current.Id);
      if (_markedPlayed.size > 500) _markedPlayed = new Set([..._markedPlayed].slice(-250));
      jellyfin.markPlayed(current.Id).catch(() => {});
    }

    if (data.ended) {
      if (current && !_markedPlayed.has(current.Id)) {
        _markedPlayed.add(current.Id);
        if (_markedPlayed.size > 500) _markedPlayed = new Set([..._markedPlayed].slice(-250));
        jellyfin.markPlayed(current.Id).catch(() => {});
      }
      // Con queue nativa, ended solo llega cuando no hay más items.
      // JS maneja repeat/all: playItem reenvía la cola completa.
      if (get().repeatMode === 'all') {
        get().playItem(get().queue[0], get().queue);
      }
    }

    const { duration, currentTime } = get();
    if (duration > 0 && currentTime / duration >= AUTOFILL_THRESHOLD) {
      get()._maybeAutoFill();
    }
  });

  AuritaPlayer.addListener('playerError', (data) => {
    console.error('[Aurita] No se pudo reproducir:', data.message);
  });

  AuritaPlayer.addListener('prevTrack', () => get().prev());
  AuritaPlayer.addListener('nextTrack', () => get().next(true));

  return {
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    repeatMode: 'off',
    shuffle: false,
    autoFilling: false,
    _autoFillSourceId: null,
    _seekOffset: 0,

    async restoreQueue() {
      const saved = await cacheStore.get('player', QUEUE_SAVE_KEY);
      if (!saved || !saved.queue?.length) return;
      if (Date.now() - saved.savedAt > 24 * 60 * 60 * 1000) return;

      const ci = Math.min(saved.currentIndex, saved.queue.length - 1);
      const savedDuration = saved.duration || (saved.queue[ci]?.RunTimeTicks ? Math.round(saved.queue[ci].RunTimeTicks / 10_000_000) : 0);
      set({
        queue: saved.queue,
        currentIndex: ci,
        repeatMode: saved.repeatMode || 'off',
        shuffle: saved.shuffle || false,
        duration: savedDuration,
      });

      // Sincronizar con el estado real del motor nativo
      try {
        const state = await AuritaPlayer.getState();
        if (state.currentIndex >= 0) {
          set({ currentIndex: state.currentIndex, isPlaying: state.isPlaying, currentTime: state.position });
          if (state.duration > 0) set({ duration: state.duration });
        } else {
          // Cola nativa vacía (ej. tras minimizar/reabrir) → re-poblar sin auto-play
          const { queue, currentIndex } = get();
          if (queue.length > 0 && currentIndex >= 0) {
            AuritaPlayer.play({
              tracks: serializeTracks(queue),
              startIndex: currentIndex,
              autoPlay: false,
            }).catch(() => {});
          }
        }
      } catch {}
    },

    playItem(item, queue = null) {
      const newQueue = queue || [item];
      const index = newQueue.findIndex((i) => i.Id === item.Id);
      const idx = index === -1 ? 0 : index;
      const duration = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 10_000_000) : 0;
      set({ queue: newQueue, currentIndex: idx, duration, _autoFillSourceId: null, _seekOffset: 0 });

      persistQueue(get());

      AuritaPlayer.play({
        tracks: serializeTracks(newQueue),
        startIndex: idx,
      }).catch((err) => console.warn('[Aurita] No se pudo iniciar la reproducción:', err));

      getEffectiveGenres(item).then((genres) => {
        historyStore.add({
          itemId: item.Id,
          name: item.Name,
          artist: item.AlbumArtist || (item.Artists || [])[0] || '',
          genres,
        });
      });
      warmUpcoming(newQueue, idx);
    },

    togglePlay() {
      const { isPlaying } = get();
      if (get().currentIndex < 0) return;
      if (isPlaying) AuritaPlayer.pause().catch(() => {});
      else AuritaPlayer.resume().catch(() => {});
    },

    seekTo(seconds) {
      AuritaPlayer.seekTo({ seconds }).catch(() => {});
      set({ currentTime: seconds, _seekOffset: seconds });
    },

    toggleRepeat() {
      const order = ['off', 'all', 'one'];
      const next = order[(order.indexOf(get().repeatMode) + 1) % order.length];
      set({ repeatMode: next });
      AuritaPlayer.setRepeatMode({ mode: next }).catch(() => {});
      persistQueue(get());
    },

    toggleShuffle() {
      const next = !get().shuffle;
      set({ shuffle: next });
      AuritaPlayer.setShuffle({ enabled: next }).catch(() => {});
      persistQueue(get());
    },

    next(manual = false) {
      const { queue, currentIndex, repeatMode } = get();
      if (queue.length === 0) return;

      if (repeatMode === 'one' && !manual) {
        AuritaPlayer.seekTo({ seconds: 0 }).catch(() => {});
        AuritaPlayer.resume().catch(() => {});
        return;
      }

      // Con queue nativa, next delega en ExoPlayer (respeta shuffle nativo)
      AuritaPlayer.next().catch(() => {
        // Fallback si no hay cola nativa: JS calcula el índice
        const { shuffle } = get();
        let nextIndex = shuffle ? Math.floor(Math.random() * queue.length) : currentIndex + 1;
        if (nextIndex >= queue.length) {
          if (repeatMode === 'all') nextIndex = 0;
          else return;
        }
        get().playItem(queue[nextIndex], queue);
      });
    },

    prev() {
      AuritaPlayer.prev().catch(() => {
        const { queue, currentIndex } = get();
        if (currentIndex > 0) get().playItem(queue[currentIndex - 1], queue);
      });
    },

    playFromQueueAt(index) {
      const { queue } = get();
      if (queue[index]) get().playItem(queue[index], queue);
    },

    removeFromQueue(index) {
      const { queue, currentIndex } = get();
      if (index === currentIndex) return;
      const newQueue = queue.filter((_, i) => i !== index);
      const newIndex = index < currentIndex ? currentIndex - 1 : currentIndex;
      set({ queue: newQueue, currentIndex: newIndex });
      persistQueue(get());
    },

    addNextManual(item) {
      const { queue, currentIndex } = get();
      const newQueue = [...queue];
      newQueue.splice(currentIndex + 1, 0, item);
      set({ queue: newQueue });
      warmUpcoming(newQueue, currentIndex);
      persistQueue(get());
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
        const existingIds = new Set(queue.map((i) => i.Id));
        let fresh = (res.Items || []).filter((i) => !existingIds.has(i.Id));

        const currentGenres = new Set(current.Genres || []);
        if (currentGenres.size > 0) {
          const related = fresh.filter((i) => (i.Genres || []).some((g) => currentGenres.has(g)));
          const unrelated = fresh.filter((i) => !related.includes(i));
          fresh = [...related, ...unrelated];
        }

        fresh = fresh.slice(0, 10);
        if (fresh.length > 0) {
          set((state) => ({ queue: [...state.queue, ...fresh] }));
          warmUpcoming(get().queue, get().currentIndex);
          persistQueue(get());

          // Reflejar en la cola nativa de ExoPlayer
          AuritaPlayer.addToQueue({ tracks: serializeTracks(fresh) }).catch(() => {});
        }
      } catch (err) {
        console.warn('[Aurita] No se pudo autocompletar la cola:', err);
      } finally {
        set({ autoFilling: false });
      }
    },
  };
});
