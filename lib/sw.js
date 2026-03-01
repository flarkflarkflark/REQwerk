const CACHE_NAME = 'recwerk-assets-v2';
const assets = [
	'/app/index.html',
	'/css/main.css',
	'/css/fonts/icomoon.eot',
	'/css/fonts/icomoon.svg',
	'/css/fonts/icomoon.ttf',
	'/css/fonts/icomoon.woff',
	'/img/app-icon-192.png',
	'/img/app-icon-512.png',
	'/img/app-icon.png',
	'/img/ico.png',
	'/img/icon.png',
	'/img/logo.svg',
	'/img/manifest.json',
	'/img/phone-switch.jpg',
	'/lib/dist/wavesurfer.js',
	'/lib/dist/plugin/wavesurfer.regions.js',
	'/lib/oneup.js',
	'/lib/app.js',
	'/lib/keys.js',
	'/lib/contextmenu.js',
	'/lib/ui-fx.js',
	'/lib/ui.js',
	'/lib/modal.js',
	'/lib/state.js',
	'/lib/engine.js',
	'/lib/actions.js',
	'/lib/drag.js',
	'/lib/recorder.js',
	'/lib/welcome.js',
	'/lib/fx-pg-eq.js',
	'/lib/fx-auto.js',
	'/lib/local.js',
	'/lib/id3.js',
	'/lib/lzma.js',
	'/lib/lame.js',
	'/lib/flac.js',
	'/lib/wav.js',
	'/lib/libflac.js',
	'/lib/libflac.wasm',
	'/lib/lz4-block-codec-wasm.js',
	'/lib/lz4-block-codec.wasm',
	'/lib/rnn_denoise.js',
	'/lib/rnn_denoise.wasm',
	'/lib/test.mp3',
	'/pages/about.html',
	'/pages/eq.html',
	'/pages/index-cache.html',
	'/pages/sp.html'
];

self.addEventListener('install', function (event) {
	event.waitUntil(
		caches.open(CACHE_NAME).then(function (cache) {
			return cache.addAll(assets);
		})
	);
});

self.addEventListener('activate', function (event) {
	event.waitUntil(
		caches.keys().then(function (keys) {
			return Promise.all(keys.map(function (key) {
				if (key !== CACHE_NAME) return caches.delete(key);
			}));
		})
	);
});

self.addEventListener('fetch', function (event) {
	if (event.request.method !== 'GET') return;

	event.respondWith(
		caches.match(event.request).then(function (cachedResponse) {
			if (cachedResponse) return cachedResponse;
			return fetch(event.request);
		})
	);
});
