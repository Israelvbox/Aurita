const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aurita', {
  secure: {
    set: (key, value) => ipcRenderer.invoke('secure:set', key, value),
    get: (key) => ipcRenderer.invoke('secure:get', key),
    clear: () => ipcRenderer.invoke('secure:clear'),
  },
  cache: {
    set: (scope, key, json, ttlMs) => ipcRenderer.invoke('cache:set', scope, key, json, ttlMs),
    get: (scope, key) => ipcRenderer.invoke('cache:get', scope, key),
    clearScope: (scope) => ipcRenderer.invoke('cache:clearScope', scope),
    delete: (scope, key) => ipcRenderer.invoke('cache:delete', scope, key),
  },
  history: {
    add: (entry) => ipcRenderer.invoke('history:add', entry),
    recentGenres: (sinceDays) => ipcRenderer.invoke('history:recentGenres', sinceDays),
    topItemsByGenre: (genre, limit) => ipcRenderer.invoke('history:topItemsByGenre', genre, limit),
  },
  isElectron: true,
});
