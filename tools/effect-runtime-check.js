const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const port = 45191;
const reportPath = path.join(projectRoot, 'dist', 'effect-runtime-check-report.json');

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
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function createRendererHarness(config) {
  return `
    (async function runEffectHarness(config) {
      const app = window.PKAudioEditor;
      const effectErrors = [];
      const selectionWindow = config.selectionWindow;

      function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }

      function onceEvent(eventName, timeoutMs) {
        return new Promise((resolve, reject) => {
          var timer = null;
          var handler = function(a, b) {
            if (timer) clearTimeout(timer);
            app.stopListeningFor(eventName, handler);
            resolve([a, b]);
          };

          app.listenFor(eventName, handler);
          timer = setTimeout(function() {
            app.stopListeningFor(eventName, handler);
            reject(new Error('Timed out waiting for ' + eventName));
          }, timeoutMs || 10000);
        });
      }

      window.addEventListener('error', function (event) {
        effectErrors.push({
          type: 'window-error',
          message: event.message || 'Unknown renderer error'
        });
      });

      app.listenFor('ShowError', function(message) {
        effectErrors.push({
          type: 'app-error',
          message: message
        });
      });

      function makeLCG(seed) {
        var state = seed >>> 0;
        return function () {
          state = (1664525 * state + 1013904223) >>> 0;
          return state / 4294967296;
        };
      }

      function createFixtureProject() {
        var sampleRate = 44100;
        var duration = 3.0;
        var length = (sampleRate * duration) >> 0;
        var left = new Float32Array(length);
        var right = new Float32Array(length);
        var rnd = makeLCG(1337);

        for (var i = 0; i < length; ++i) {
          var t = i / sampleRate;
          var l = 0;
          var r = 0;
          var noiseA = (rnd() * 2 - 1) * 0.018;
          var noiseB = (rnd() * 2 - 1) * 0.021;

          if (t < 0.5) {
            l = 0.42 * Math.sin(2 * Math.PI * 220 * t);
            r = 0.32 * Math.sin(2 * Math.PI * 330 * t);
          } else if (t < 0.8) {
            l = 0;
            r = 0;
          } else if (t < 1.6) {
            l = 0.28 * Math.sin(2 * Math.PI * 440 * t) + noiseA;
            r = 0.24 * Math.sin(2 * Math.PI * 660 * t) + noiseB;
          } else if (t < 2.4) {
            l = 0.18 * Math.sin(2 * Math.PI * 180 * t) + 0.10 * Math.sin(2 * Math.PI * 360 * t) + noiseA * 1.6;
            r = 0.16 * Math.sin(2 * Math.PI * 220 * t) + 0.10 * Math.sin(2 * Math.PI * 440 * t) + noiseB * 1.9;
          } else {
            var tail = Math.max(0, (3.0 - t) / 0.6);
            l = tail * (0.22 * Math.sin(2 * Math.PI * 280 * t) + noiseA);
            r = tail * (0.18 * Math.sin(2 * Math.PI * 360 * t) + noiseB);
          }

          if (t >= 2.55 && t < 2.72) {
            l = 0;
            r = 0.24 * Math.sin(2 * Math.PI * 260 * t);
          }

          left[i] = Math.max(-1, Math.min(1, l));
          right[i] = Math.max(-1, Math.min(1, r));
        }

        var clickPositions = [1.05, 1.25, 2.18];
        for (var j = 0; j < clickPositions.length; ++j) {
          var idx = (clickPositions[j] * sampleRate) >> 0;
          left[idx] = 0.98;
          if (j !== 1) right[idx] = -0.98;
        }

        return {
          id: 'fx-fixture',
          name: 'fx-fixture',
          chans: 2,
          samplerate: sampleRate,
          durr: duration,
          channels: [left, right]
        };
      }

      function cloneFixtureProject(fixture) {
        return {
          id: fixture.id,
          name: fixture.name,
          chans: fixture.chans,
          samplerate: fixture.samplerate,
          durr: fixture.durr,
          data: fixture.channels.map(function(channel) {
            return new Float32Array(channel).buffer;
          })
        };
      }

      async function loadProject(project, firstLoad) {
        var waitReady = firstLoad ? onceEvent('DidLoadFile', 15000) : null;
        app.engine.wavesurfer.backend._add = 0;
        app.engine.LoadDB(project);

        if (waitReady) {
          await waitReady;
        } else {
          await sleep(220);
        }

        await sleep(180);
        app.fireEvent('RequestPause');
        app.fireEvent('RequestRegionClear');
        await sleep(60);
      }

      function snapshotBuffer(buffer) {
        var sampleStep = 97;
        var channels = [];

        for (var i = 0; i < buffer.numberOfChannels; ++i) {
          var data = buffer.getChannelData(i);
          var sum = 0;
          var sumAbs = 0;
          var max = 0;
          for (var j = 0; j < data.length; j += sampleStep) {
            var value = data[j];
            var abs = Math.abs(value);
            sum += value;
            sumAbs += abs;
            if (abs > max) max = abs;
          }

          channels.push({
            sum: Number(sum.toFixed(6)),
            sumAbs: Number(sumAbs.toFixed(6)),
            max: Number(max.toFixed(6))
          });
        }

        return {
          channelCount: buffer.numberOfChannels,
          length: buffer.length,
          duration: Number(buffer.duration.toFixed(6)),
          channels: channels
        };
      }

      function snapshotKey(snapshot) {
        return JSON.stringify(snapshot);
      }

      function bufferFinite(buffer) {
        for (var i = 0; i < buffer.numberOfChannels; ++i) {
          var data = buffer.getChannelData(i);
          for (var j = 0; j < data.length; ++j) {
            if (!Number.isFinite(data[j])) return false;
          }
        }
        return true;
      }

      function setSelection(enabled) {
        if (enabled) {
          app.fireEvent('RequestRegionSet', selectionWindow[0], selectionWindow[1]);
        } else {
          app.fireEvent('RequestRegionClear');
        }
      }

      function sampleOutsideSelectionChanged(beforeBuffer, afterBuffer) {
        if (!beforeBuffer || !afterBuffer) return null;
        if (beforeBuffer.numberOfChannels !== afterBuffer.numberOfChannels) return null;
        if (beforeBuffer.length !== afterBuffer.length) return null;

        var start = Math.max(0, Math.floor(selectionWindow[0] * beforeBuffer.sampleRate));
        var end = Math.min(beforeBuffer.length, Math.floor(selectionWindow[1] * beforeBuffer.sampleRate));
        var step = 131;

        for (var c = 0; c < beforeBuffer.numberOfChannels; ++c) {
          var beforeData = beforeBuffer.getChannelData(c);
          var afterData = afterBuffer.getChannelData(c);
          for (var i = 0; i < beforeData.length; i += step) {
            if (i >= start && i <= end) continue;
            if (Math.abs(beforeData[i] - afterData[i]) > 1e-5) return true;
          }
        }

        return false;
      }

      function cloneCurrentBuffer() {
        var buffer = app.engine.wavesurfer.backend.buffer;
        var clone = app.engine.wavesurfer.backend.ac.createBuffer(
          buffer.numberOfChannels,
          buffer.length,
          buffer.sampleRate
        );
        for (var i = 0; i < buffer.numberOfChannels; ++i) {
          clone.copyToChannel(new Float32Array(buffer.getChannelData(i)), i);
        }
        return clone;
      }

      async function waitForEffectChange(beforeSnapshot, timeoutMs) {
        var started = performance.now();
        var initialKey = snapshotKey(beforeSnapshot);
        while (performance.now() - started < timeoutMs) {
          await sleep(120);
          var current = snapshotBuffer(app.engine.wavesurfer.backend.buffer);
          if (snapshotKey(current) !== initialKey) {
            return current;
          }
        }

        return snapshotBuffer(app.engine.wavesurfer.backend.buffer);
      }

      var fixtures = createFixtureProject();
      await loadProject(cloneFixtureProject(fixtures), true);

      var effectCases = [
        {
          id: 'gain',
          event: 'RequestActionFX_GAIN',
          args: function () { return [[{ val: 1.8 }]]; }
        },
        {
          id: 'fade_in',
          event: 'RequestActionFX_FadeIn',
          args: function () { return []; }
        },
        {
          id: 'fade_out',
          event: 'RequestActionFX_FadeOut',
          args: function () { return []; }
        },
        {
          id: 'noise_rnn',
          event: 'RequestActionFX_NoiseRNN',
          args: function () { return []; },
          timeoutMs: 30000
        },
        {
          id: 'paragraphic_eq',
          event: 'RequestActionFX_PARAMEQ',
          args: function () {
            return [[
              { type: 'lowshelf', val: 9, q: 0.8, freq: 140 },
              { type: 'peaking', val: -12, q: 3.5, freq: 1100 },
              { type: 'highshelf', val: 8, q: 0.7, freq: 5200 }
            ]];
          }
        },
        {
          id: 'graphic_eq_10',
          event: 'RequestActionFX_PARAMEQ',
          args: function () {
            var freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
            return [freqs.map(function (freq, index) {
              return {
                type: 'peaking',
                val: [8, 5, 2, -2, -5, -8, -4, 3, 6, 9][index],
                q: 1.1,
                freq: freq
              };
            })];
          }
        },
        {
          id: 'graphic_eq_20',
          event: 'RequestActionFX_PARAMEQ',
          args: function () {
            var freqs = [31, 44, 62, 88, 125, 177, 250, 355, 500, 710, 1000, 1400, 2000, 2800, 4000, 5600, 8000, 11200, 16000, 18000];
            return [freqs.map(function (freq, index) {
              var pattern = [7, 5, 3, 1, -1, -3, -5, -7, -4, -2, 2, 4, 6, 3, 1, -1, -3, -5, -2, 4];
              return {
                type: 'peaking',
                val: pattern[index],
                q: 1.0,
                freq: freq
              };
            })];
          }
        },
        {
          id: 'compressor',
          event: 'RequestActionFX_Compressor',
          args: function () {
            return [{
              threshold: { val: -30 },
              knee: { val: 12 },
              ratio: { val: 8 },
              attack: { val: 0.004 },
              release: { val: 0.18 }
            }];
          }
        },
        {
          id: 'normalize',
          event: 'RequestActionFX_Normalize',
          args: function () { return [[false, 0.45]]; }
        },
        {
          id: 'hard_limit',
          event: 'RequestActionFX_HardLimit',
          args: function () { return [[true, 0.55, 0.35, 18]]; }
        },
        {
          id: 'delay',
          event: 'RequestActionFX_DELAY',
          args: function () {
            return [{
              delay: { val: 0.16 },
              feedback: { val: 0.42 },
              mix: { val: 0.38 }
            }];
          }
        },
        {
          id: 'distortion',
          event: 'RequestActionFX_DISTORT',
          args: function () { return [[{ val: 1.65 }]]; }
        },
        {
          id: 'chorus',
          event: 'RequestActionFX_Chorus',
          args: function () { return [{ rate: 3.8, depth: 0.0065 }]; }
        },
        {
          id: 'bitcrusher',
          event: 'RequestActionFX_Bitcrusher',
          args: function () { return [{ bits: 4 }]; }
        },
        {
          id: 'filter',
          event: 'RequestActionFX_Filter',
          args: function () { return [{ type: 'lowpass', freq: 900, q: 1.4 }]; }
        },
        {
          id: 'reverb',
          event: 'RequestActionFX_REVERB',
          args: function () { return [{ time: 1.6, decay: 1.8, mix: 0.7 }]; }
        },
        {
          id: 'speed',
          event: 'RequestActionFX_SPEED',
          args: function () { return [1.35]; },
          timeoutMs: 20000
        },
        {
          id: 'playback_rate',
          event: 'RequestActionFX_RATE',
          args: function () { return [0.8]; },
          timeoutMs: 20000
        },
        {
          id: 'reverse',
          event: 'RequestActionFX_Reverse',
          args: function () { return []; }
        },
        {
          id: 'invert',
          event: 'RequestActionFX_Invert',
          args: function () { return []; }
        },
        {
          id: 'remove_silence',
          event: 'RequestActionFX_RemSil',
          args: function () { return []; },
          timeoutMs: 20000,
          allowOutsideSelectionChange: true
        },
        {
          id: 'click_removal',
          event: 'RequestActionFX_ClickRemoval',
          args: function () { return [{ threshold: 0.45, maxWidth: 160, method: 'linear' }]; }
        }
      ];

      var results = [];

      for (var caseIndex = 0; caseIndex < effectCases.length; ++caseIndex) {
        var effectCase = effectCases[caseIndex];

        for (var modeIndex = 0; modeIndex < 2; ++modeIndex) {
          var withSelection = modeIndex === 1;

          for (var run = 1; run <= 3; ++run) {
            console.log('[fx-test] start', effectCase.id, withSelection ? 'selection' : 'full', 'run', run);

            effectErrors.length = 0;
            await loadProject(cloneFixtureProject(fixtures), false);
            setSelection(withSelection);
            await sleep(90);

            var beforeBuffer = cloneCurrentBuffer();
            var beforeSnapshot = snapshotBuffer(beforeBuffer);
            var beforeKey = snapshotKey(beforeSnapshot);
            var status = 'passed';
            var failureMessage = null;

            try {
              app.fireEvent.apply(app, [effectCase.event].concat(effectCase.args()));
              var afterSnapshot = await waitForEffectChange(beforeSnapshot, effectCase.timeoutMs || 15000);
              var afterBuffer = app.engine.wavesurfer.backend.buffer;

              if (snapshotKey(afterSnapshot) === beforeKey) {
                throw new Error('Buffer did not change');
              }

              if (!bufferFinite(afterBuffer)) {
                throw new Error('Buffer contains non-finite samples');
              }

              if (effectErrors.length > 0) {
                throw new Error(effectErrors[0].message || 'Application reported an error');
              }

              if (withSelection && !effectCase.allowOutsideSelectionChange) {
                var changedOutside = sampleOutsideSelectionChanged(beforeBuffer, afterBuffer);
                if (changedOutside === true) {
                  throw new Error('Samples outside the selection changed');
                }
              }

              results.push({
                effect: effectCase.id,
                mode: withSelection ? 'selection' : 'full',
                run: run,
                status: status,
                before: beforeSnapshot,
                after: afterSnapshot
              });
              console.log('[fx-test] pass', effectCase.id, withSelection ? 'selection' : 'full', 'run', run);
            } catch (err) {
              status = 'failed';
              failureMessage = err && err.message ? err.message : String(err);
              results.push({
                effect: effectCase.id,
                mode: withSelection ? 'selection' : 'full',
                run: run,
                status: status,
                error: failureMessage,
                appErrors: effectErrors.slice(),
                before: beforeSnapshot,
                after: snapshotBuffer(app.engine.wavesurfer.backend.buffer)
              });
              console.error('[fx-test] fail', effectCase.id, withSelection ? 'selection' : 'full', 'run', run, failureMessage);
            }

            app.fireEvent('RequestActionFX_PREVIEW_STOP');
            app.fireEvent('RequestPause');
            await sleep(60);
          }
        }
      }

      var failures = results.filter(function(entry) { return entry.status !== 'passed'; });
      return {
        summary: {
          total: results.length,
          passed: results.length - failures.length,
          failed: failures.length
        },
        failures: failures,
        results: results
      };
    })(${JSON.stringify(config)});
  `;
}

async function run() {
  const server = await startServer();
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    backgroundColor: '#1E2832',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const prefix = level >= 2 ? '[renderer-error]' : '[renderer]';
    console.log(prefix, message);
  });

  await win.loadURL(`http://127.0.0.1:${port}/app/index.html`);

  const result = await win.webContents.executeJavaScript(
    createRendererHarness({
      selectionWindow: [0.45, 1.45]
    }),
    true
  );

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));

  console.log('[fx-test] summary', JSON.stringify(result.summary));
  if (result.failures.length > 0) {
    result.failures.forEach((failure) => {
      console.log(
        '[fx-test] failure-detail',
        JSON.stringify({
          effect: failure.effect,
          mode: failure.mode,
          run: failure.run,
          error: failure.error
        })
      );
    });
  }

  await win.destroy();
  await new Promise((resolve) => server.close(resolve));

  if (result.failures.length > 0) {
    process.exitCode = 1;
  }
}

app.whenReady().then(run).catch((err) => {
  console.error('[fx-test] fatal', err);
  process.exitCode = 1;
});

app.on('window-all-closed', () => {
  app.quit();
});
