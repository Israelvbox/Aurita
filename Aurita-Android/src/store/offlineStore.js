import { create } from 'zustand';
import { registerPlugin } from '@capacitor/core';
import { jellyfin } from '../api/jellyfin.js';
import { useSettingsStore } from './settingsStore.js';

const AuritaPlayer = registerPlugin('AuritaPlayer');

export const useOfflineStore = create((set, get) => ({
  isOffline: false,
  downloadedIds: new Set(),
  downloading: new Set(),
  downloadProgress: {},
  hydrated: false,

  setOffline(v) { set({ isOffline: v }) },

  async hydrate() {
    if (get().hydrated) return;
    try {
      const res = await AuritaPlayer.getDownloadedIds();
      set({ downloadedIds: new Set(res.ids || []), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  async downloadTrack(item) {
    const id = item.Id;
    if (get().downloading.has(id) || get().downloadedIds.has(id)) return;

    set((s) => ({ downloading: new Set(s.downloading).add(id) }));

    const bitrate = useSettingsStore.getState().downloadBitrate;
    const url = jellyfin.streamUrl(id, bitrate);

    try {
      await AuritaPlayer.downloadTrack({ url, itemId: id, onProgress: true });
      set((s) => {
        const next = new Set(s.downloadedIds);
        next.add(id);
        const dl = new Set(s.downloading);
        dl.delete(id);
        const prog = { ...s.downloadProgress };
        delete prog[id];
        return { downloadedIds: next, downloading: dl, downloadProgress: prog };
      });
    } catch (err) {
      set((s) => {
        const dl = new Set(s.downloading);
        dl.delete(id);
        const prog = { ...s.downloadProgress };
        delete prog[id];
        return { downloading: dl, downloadProgress: prog };
      });
      console.warn('[Offline] Error descargando', item.Name, err);
    }
  },

  async deleteDownload(itemId) {
    try {
      await AuritaPlayer.deleteDownload({ itemId });
      set((s) => {
        const next = new Set(s.downloadedIds);
        next.delete(itemId);
        return { downloadedIds: next };
      });
    } catch {}
  },

  isDownloaded(itemId) {
    return get().downloadedIds.has(itemId);
  },

  async refreshDownloadedIds() {
    try {
      const res = await AuritaPlayer.getDownloadedIds();
      set({ downloadedIds: new Set(res.ids || []) });
    } catch {}
  },

  _onProgress: null,
  _progressListener: null,

  startListening() {
    if (get()._progressListener) return;
    const handler = AuritaPlayer.addListener('downloadProgress', (data) => {
      if (data.itemId) {
        set((s) => ({
          downloadProgress: { ...s.downloadProgress, [data.itemId]: data.progress },
        }));
      }
    });
    set({ _progressListener: handler });
  },

  stopListening() {
    const h = get()._progressListener;
    if (h) { h.remove(); set({ _progressListener: null }); }
  },
}));
