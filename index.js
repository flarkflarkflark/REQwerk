const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let server;
let port = 0;
const preferredPort = 45119;
const settingsPath = path.join(app.getPath('userData'), 'recwerk-settings.json');
const appRoot = path.resolve(__dirname);
const mimeTypes = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.eot': 'application/vnd.ms-fontobject',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
});

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

function resolveRequestPath(rawUrl) {
  const requestUrl = new URL(rawUrl, 'http://127.0.0.1');
  let reqPath = decodeURIComponent(requestUrl.pathname);

  if (reqPath === '/') reqPath = '/index.html';
  else if (reqPath === '/app' || reqPath === '/app/') reqPath = '/app/index.html';

  const relativePath = path.normalize(reqPath).replace(/^[/\\]+/, '');
  const filePath = path.resolve(appRoot, relativePath);

  if (filePath !== appRoot && !filePath.startsWith(appRoot + path.sep)) {
    return null;
  }

  return filePath;
}

// Eenvoudige HTTP server om file:// beperkingen (zoals WASM loading) te omzeilen
function startServer() {
  server = http.createServer((req, res) => {
    const filePath = resolveRequestPath(req.url);

    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        const statusCode = err.code === 'ENOENT' ? 404 : 500;
        res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(statusCode === 404 ? 'Not Found' : 'Internal Server Error');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff'
      });
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

ipcMain.handle('write-file', async (event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, Buffer.from(data));
    return true;
  } catch (err) {
    console.error('Failed to write file:', err);
    throw err;
  }
});

ipcMain.handle('rename-file', async (event, oldPath, newPath) => {
  try {
    fs.renameSync(oldPath, newPath);
    return true;
  } catch (err) {
    console.error('Failed to rename file:', err);
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
