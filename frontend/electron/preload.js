const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  compact:        () => ipcRenderer.send('win-compact'),
  restore:        () => ipcRenderer.send('win-restore'),
  close:          () => ipcRenderer.send('win-close'),
  hide:           () => ipcRenderer.send('win-hide'),
  onSummon: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('overlay-summon', handler)
    return () => ipcRenderer.removeListener('overlay-summon', handler)
  },
})
