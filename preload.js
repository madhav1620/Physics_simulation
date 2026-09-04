const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  exportCSV: (csvData) => ipcRenderer.invoke('export-csv', csvData),
});
