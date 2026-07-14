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

    setVinylMode(v) {
      set({ vinylMode: v });
      save({ ...get(), vinylMode: v });
    },

    setShowLyrics(v) {
      set({ showLyrics: v });
      save({ ...get(), showLyrics: v });
    },
  };
});
