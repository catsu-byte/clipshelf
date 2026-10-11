const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipShelf', {
  getState: () => ipcRenderer.invoke('clipshelf:get-state'),
  copy: (id) => ipcRenderer.invoke('clipshelf:copy', id),
  togglePin: (id) => ipcRenderer.invoke('clipshelf:toggle-pin', id),
  delete: (id) => ipcRenderer.invoke('clipshelf:delete', id),
  clear: () => ipcRenderer.invoke('clipshelf:clear'),
  setPaused: (paused) => ipcRenderer.invoke('clipshelf:set-paused', paused),
  setStartAtLogin: (enabled) => ipcRenderer.invoke('clipshelf:set-start-at-login', enabled),
  onState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('clipshelf:state', handler);
    return () => ipcRenderer.removeListener('clipshelf:state', handler);
  },
});
