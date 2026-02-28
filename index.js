const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let server;
let port = 0;

// Eenvoudige HTTP server om file:// beperkingen (zoals WASM loading) te omzeilen
function startServer() {
  server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    
    // Zorg dat we geen queries of hashes in de bestandsnaam hebben
    filePath = filePath.split('?')[0].split('#')[0];

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

  server.listen(0, '127.0.0.1', () => {
    port = server.address().port;
    console.log(`Internal server running on port ${port}`);
    createWindow();
  });
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
  win.loadURL(`http://127.0.0.1:${port}/index.html`);
}

app.whenReady().then(startServer);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
