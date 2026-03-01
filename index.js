const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let server;
let port = 0;
const preferredPort = 45119;
const settingsPath = path.join(app.getPath('userData'), 'recwerk-settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    return {};
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// Eenvoudige HTTP server om file:// beperkingen (zoals WASM loading) te omzeilen
function startServer() {
  server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0].split('#')[0];
    if (reqPath === '/') reqPath = '/index.html';
    else if (reqPath === '/app' || reqPath === '/app/') reqPath = '/app/index.html';

    let filePath = path.join(__dirname, reqPath);
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end(JSON.stringify(err));
        return;
      }
      
      // Mime-types voor belangrijke bestanden
      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'text/html';
      if (ext === '.js') contentType = 'application/javascript';
      if (ext === '.css') contentType = 'text/css';
      if (ext === '.wasm') contentType = 'application/wasm';
      if (ext === '.svg') contentType = 'image/svg+xml';
      if (ext === '.png') contentType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  server.once('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`Preferred port ${preferredPort} is busy, falling back to a random port.`);
      server.listen(0, '127.0.0.1');
      return;
    }

    throw err;
  });

  server.once('listening', () => {
    port = server.address().port;
    console.log(`Internal server running on port ${port}`);
    createWindow();
  });

  server.listen(preferredPort, '127.0.0.1');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 850,
    title: 'RECwerk',
    icon: path.join(__dirname, 'img', 'icon.png'),
    backgroundColor: '#1E2832',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadURL(`http://127.0.0.1:${port}/app/index.html`);
}

// IPC handler voor save dialog
ipcMain.handle('show-save-dialog', async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return await dialog.showSaveDialog(win, options);
});

// IPC handler voor het lezen van bestanden
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    return fs.readFileSync(filePath);
  } catch (err) {
    console.error('Failed to read file:', err);
    throw err;
  }
});

ipcMain.handle('get-setting', async (event, key) => {
  const settings = readSettings();
  return settings[key];
});

ipcMain.handle('set-setting', async (event, key, value) => {
  const settings = readSettings();

  if (value === undefined || value === null) delete settings[key];
  else settings[key] = value;

  writeSettings(settings);
  return true;
});

app.whenReady().then(startServer);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
