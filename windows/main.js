const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 460,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#111111',
    title: 'MEMEINATER 6700',
    icon: path.join(__dirname, 'www', 'icon-512.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'www', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
