import { create } from 'zustand';

const STORAGE_KEY = 'aurita_settings';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export const useSettingsStore = create((set, get) => {
  const persisted = load();

  return {
    vinylMode: persisted.vinylMode ?? true,
    showLyrics: persisted.showLyrics ?? false,
    audioBitrate: persisted.audioBitrate ?? 0,
    downloadBitrate: persisted.downloadBitrate ?? 64000,

    setVinylMode(v) {
      set({ vinylMode: v });
      save({ ...get(), vinylMode: v });
    },

    setShowLyrics(v) {
      set({ showLyrics: v });
      save({ ...get(), showLyrics: v });
    },

    setAudioBitrate(v) {
      set({ audioBitrate: v });
      save({ ...get(), audioBitrate: v });
    },

    setDownloadBitrate(v) {
      set({ downloadBitrate: v });
      save({ ...get(), downloadBitrate: v });
    },
  };
});
