import { create } from 'zustand';

const KEY = 'aurita_settings';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export const useSettingsStore = create((set, get) => {
  const persisted = load();
  return {
    showLyrics: persisted?.showLyrics ?? false,
    vinylMode: persisted?.vinylMode ?? false,
    toggleLyrics() {
      set((s) => {
        const next = { showLyrics: !s.showLyrics };
        save({ ...get(), ...next });
        return next;
      });
    },
    toggleVinyl() {
      set((s) => {
        const next = { vinylMode: !s.vinylMode };
        save({ ...get(), ...next });
        return next;
      });
    },
  };
});
