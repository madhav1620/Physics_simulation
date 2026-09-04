const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#0B0F19',
    title: 'Kinematics & Projectile Motion - Physics Simulator Desktop',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler: Export trajectory data to CSV
ipcMain.handle('export-csv', async (event, csvContent) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export Trajectory Data',
    defaultPath: 'trajectory_data.csv',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  });

  if (filePath) {
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    return { success: true, filePath };
  }
  return { success: false };
});
