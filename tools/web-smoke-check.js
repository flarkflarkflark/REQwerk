const http = require('http');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
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

const checks = [
  { path: '/', expect: 'RECwerk' },
  { path: '/app/', expect: 'RECwerk Editor' },
  { path: '/css/main.css', contentType: 'text/css' },
  { path: '/img/logo.svg', contentType: 'image/svg+xml' },
  { path: '/img/manifest.json', contentType: 'application/json' },
  { path: '/lib/app.js', contentType: 'application/javascript' },
  { path: '/lib/actions.js', contentType: 'application/javascript' },
  { path: '/lib/engine.js', contentType: 'application/javascript' },
  { path: '/lib/ui.js', contentType: 'application/javascript' },
  { path: '/lib/sw.js', contentType: 'application/javascript' },
  { path: '/sw.js', contentType: 'application/javascript' },
  { path: '/pages/about.html', expect: 'RECwerk' },
  { path: '/pages/eq.html?iframe=1', expect: '<!DOCTYPE html>' },
  { path: '/pages/sp.html?iframe=1', expect: '<!DOCTYPE html>' }
];

const remoteBaseUrl = process.env.CHECK_BASE_URL ? process.env.CHECK_BASE_URL.replace(/\/+$/, '') : '';
const maxAttempts = Math.max(1, (process.env.CHECK_RETRIES || 1) / 1 || 1);
const retryDelayMs = Math.max(0, (process.env.CHECK_DELAY_MS || 3000) / 1 || 3000);

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

function createServer() {
  return http.createServer((req, res) => {
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
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runChecks(baseUrl) {
  for (const check of checks) {
    const response = await fetch(baseUrl + check.path, {
      redirect: 'follow'
    });
    if (!response.ok) {
      throw new Error(`${check.path} returned ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (check.contentType && !contentType.includes(check.contentType)) {
      throw new Error(`${check.path} returned unexpected content-type ${contentType}`);
    }

    if (check.expect) {
      const body = await response.text();
      if (!body.includes(check.expect)) {
        throw new Error(`${check.path} did not contain expected text`);
      }
    }

    console.log(`[web-smoke] ok ${check.path}`);
  }
}

async function runAgainstBase(baseUrl) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; ++attempt) {
    try {
      await runChecks(baseUrl);
      console.log('[web-smoke] all checks passed');
      return;
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;
      console.warn(`[web-smoke] attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      await sleep(retryDelayMs);
    }
  }

  throw lastError || new Error('Unknown web smoke failure');
}

async function run() {
  if (remoteBaseUrl) {
    await runAgainstBase(remoteBaseUrl);
    return;
  }

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await runAgainstBase(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((err) => {
  console.error('[web-smoke] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
