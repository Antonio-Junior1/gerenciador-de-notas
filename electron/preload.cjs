const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApp", {
  platform: process.platform,
  isDesktop: true,
  openDataDir: () => ipcRenderer.invoke("open-data-dir"),
  pickSpreadsheetSave: () => ipcRenderer.invoke("pick-spreadsheet-save"),
  openFilePath: (filePath) => ipcRenderer.invoke("open-file-path", filePath),
});
