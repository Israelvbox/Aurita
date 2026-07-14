import { create } from 'zustand';

export const useOfflineStore = create((set) => ({
  isOffline: false,
  setOffline(v) { set({ isOffline: v }) },
}));
