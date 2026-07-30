import { create } from 'zustand';
import { persist } from 'zustand/middleware';

function today() { return new Date().toISOString().slice(0, 10); }

export const useNetworkStatsStore = create(
  persist(
    (set, get) => ({
      daily: {},
      lastConnectionType: 'unknown',
      setConnectionType(type) {
        set({ lastConnectionType: type });
      },
      addBytes(bytes, type) {
        if (bytes <= 0) return;
        const key = today();
        const daily = { ...get().daily };
        if (!daily[key]) daily[key] = { wifi: 0, cellular: 0, unknown: 0 };
        daily[key][type] = (daily[key][type] || 0) + bytes;
        set({ daily });
      },
      resetAll() {
        set({ daily: {} });
      },
    }),
    { name: 'aurita_network_stats' }
  )
);

const KB = 1024;
const MB = KB * 1024;

export function formatBytes(bytes) {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}
