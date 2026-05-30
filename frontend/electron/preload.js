const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  compact:        () => ipcRenderer.send('win-compact'),
  restore:        () => ipcRenderer.send('win-restore'),
  toggleMaximize: () => ipcRenderer.send('win-toggle-maximize'),
  close:          () => ipcRenderer.send('win-close'),
})
