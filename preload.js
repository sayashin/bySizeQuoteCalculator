// preload.js
const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadPrices: () => ipcRenderer.invoke('load-prices'),
  savePrices: (data) => ipcRenderer.invoke('save-prices', data),
  openAdmin: () => ipcRenderer.send('open-admin'),
  onPricesUpdated: (cb) => {
    ipcRenderer.removeAllListeners('prices-updated');
    ipcRenderer.on('prices-updated', (_evt, payload) => cb(payload));
  }
  ,
  exportCart: (payload) => ipcRenderer.invoke('export-cart', payload)
});

// expose a small clipboard helper so renderer can reliably copy text
contextBridge.exposeInMainWorld('nativeClipboard', {
  writeText: (text) => {
    try { clipboard.writeText(text); return true; } catch (e) { return false; }
  }
});
