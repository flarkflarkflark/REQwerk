const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const projectFile = process.argv[2];
const mode = process.argv[3] || 'open';
if (!projectFile) {
  console.error('[project-check] missing project file argument');
  process.exit(1);
}

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

function resolveRequestPath(rawUrl) {
  const requestUrl = new URL(rawUrl, 'http://127.0.0.1');
  let reqPath = decodeURIComponent(requestUrl.pathname);

  if (reqPath === '/') reqPath = '/index.html';
  else if (reqPath === '/app' || reqPath === '/app/') reqPath = '/app/index.html';

  const relativePath = path.normalize(reqPath).replace(/^[/\\]+/, '');
  const filePath = path.resolve(projectRoot, relativePath);

  if (filePath !== projectRoot && !filePath.startsWith(projectRoot + path.sep)) {
    return null;
  }

  return filePath;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
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
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff'
        });
        res.end(data);
      });
    });

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function run() {
  const server = await startServer();
  const serverPort = server.address().port;
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 960,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  win.webContents.on('console-message', (_event, _level, message) => {
    console.log('[renderer]', message);
  });

  await win.loadURL(`http://127.0.0.1:${serverPort}/app/`);

  const result = await win.webContents.executeJavaScript(
    `
      (async function () {
        function sleep(ms) {
          return new Promise(function (resolve) { setTimeout(resolve, ms); });
        }

        var app = window.PKAudioEditor;
        var errors = [];

        app.listenFor('ShowError', function (message) {
          errors.push(message);
        });

        if (${JSON.stringify(mode)} === 'parse') {
          try {
            var meta = await app._streamProjectFile(${JSON.stringify(projectFile)}, null);
            return { ok: true, mode: 'parse', meta: meta };
          } catch (err) {
            return { ok: false, mode: 'parse', error: err && err.message ? err.message : String(err) };
          }
        }

        app.OpenLocalFile('', ${JSON.stringify(path.basename(projectFile))}, ${JSON.stringify(projectFile)});

        for (var i = 0; i < 120; ++i) {
          await sleep(250);
          if (errors.length > 0) {
            return { ok: false, error: errors[0] };
          }

          if (app.engine && app.engine.wavesurfer && app.engine.wavesurfer.backend && app.engine.wavesurfer.backend.buffer) {
            var buffer = app.engine.wavesurfer.backend.buffer;
            if (buffer && buffer.length > 0 && app.engine.currentFileName) {
              return {
                ok: true,
                fileName: app.engine.currentFileName,
                channels: buffer.numberOfChannels,
                length: buffer.length,
                sampleRate: buffer.sampleRate,
                duration: buffer.duration
              };
            }
          }
        }

        return { ok: false, error: 'Timed out waiting for project load' };
      })();
    `,
    true
  );

  console.log('[project-check] result', JSON.stringify(result));

  await win.destroy();
  await new Promise((resolve) => server.close(resolve));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

app.whenReady().then(run).catch((err) => {
  console.error('[project-check] fatal', err);
  process.exitCode = 1;
});

app.on('window-all-closed', () => {
  app.quit();
});
