(function ( w, PKAE ) {
	'use strict';

	function dbToGain ( db ) {
		db = db / 1 || 0;
		return Math.pow(10, db / 20);
	}

	function cloneAudioBuffer ( ctx, buffer ) {
		if (!ctx || !buffer) return null;
		var clone = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
		for (var i = 0; i < buffer.numberOfChannels; ++i) {
			clone.getChannelData(i).set(buffer.getChannelData(i));
		}
		return clone;
	}

	function PKMultitrackEngine ( app ) {
		if (!app.multitrack || !app.engine || !app.engine.wavesurfer) return ;

		var q = this;
		var runtimeBuffers = {};
		var activeNodes = [];
		var isPlaying = false;

		function getAudioContext () {
			return app.engine.wavesurfer.backend && app.engine.wavesurfer.backend.ac;
		}

		function getState () {
			return app.multitrack.getState();
		}

		function resolveAssetBuffer ( asset_id ) {
			return runtimeBuffers[asset_id] || null;
		}

		function getTrackPlaybackPlan () {
			var state = getState();
			var clips = [];
			var longest = 0;

			for (var i = 0; i < state.tracks.length; ++i) {
				var track = state.tracks[i];
				if (!app.multitrack.isTrackAudible(track)) continue;

				for (var j = 0; j < track.clips.length; ++j) {
					var clip = track.clips[j];
					var buffer = resolveAssetBuffer(clip.assetId);
					if (!buffer) continue;

					var clipOffset = Math.max(0, clip.offset || 0);
					var available = Math.max(0, buffer.duration - clipOffset);
					var clipDuration = clip.duration > 0 ? Math.min(available, clip.duration) : available;
					if (!clipDuration) continue;

					clips.push({
						track: track,
						clip: clip,
						buffer: buffer,
						start: Math.max(0, clip.start || 0),
						offset: clipOffset,
						duration: clipDuration
					});

					longest = Math.max(longest, (clip.start || 0) + clipDuration);
				}
			}

			return {
				clips: clips,
				duration: longest
			};
		}

		function connectTrackGraph ( ctx, destination, track, masterGainDb ) {
			var input = ctx.createGain();
			input.gain.value = dbToGain(track.gain) * dbToGain(masterGainDb);

			var node = input;
			if (ctx.createStereoPanner) {
				var panner = ctx.createStereoPanner();
				panner.pan.value = Math.max(-1, Math.min(1, (track.pan || 0) / 100));
				input.connect(panner);
				node = panner;
			}

			node.connect(destination);
			return input;
		}

		function clearActiveNodes () {
			while (activeNodes.length) {
				var current = activeNodes.pop();
				try {
					current.stop && current.stop(0);
				} catch (err) {}
				try {
					current.disconnect && current.disconnect();
				} catch (err2) {}
			}
		}

		this.captureCurrentBufferForAsset = function ( asset_id ) {
			var ctx = getAudioContext();
			var buffer = app.engine.wavesurfer.backend && app.engine.wavesurfer.backend.buffer;
			if (!ctx || !buffer || !asset_id) return false;

			runtimeBuffers[asset_id] = cloneAudioBuffer(ctx, buffer);
			return true;
		};

		this.hasRuntimeBuffer = function ( asset_id ) {
			return !!runtimeBuffers[asset_id];
		};

		this.stop = function () {
			clearActiveNodes();
			isPlaying = false;
			app.fireEvent('DidMultitrackPlaybackState', false);
		};

		this.play = function () {
			var ctx = getAudioContext();
			if (!ctx) return false;

			var state = getState();
			var plan = getTrackPlaybackPlan();
			if (!plan.clips.length) return false;

			app.fireEvent('RequestPause');
			q.stop();

			var masterGain = ctx.createGain();
			masterGain.gain.value = state.master.mute ? 0 : dbToGain(state.master.gain);
			masterGain.connect(ctx.destination);
			activeNodes.push(masterGain);

			var perTrackInputs = {};
			var now = ctx.currentTime + 0.02;

			for (var i = 0; i < plan.clips.length; ++i) {
				var item = plan.clips[i];
				if (!perTrackInputs[item.track.id]) {
					perTrackInputs[item.track.id] = connectTrackGraph(ctx, masterGain, item.track, 0);
					activeNodes.push(perTrackInputs[item.track.id]);
				}

				var source = ctx.createBufferSource();
				source.buffer = item.buffer;
				source.connect(perTrackInputs[item.track.id]);
				source.start(now + item.start, item.offset, item.duration);
				activeNodes.push(source);
			}

			isPlaying = true;
			app.fireEvent('DidMultitrackPlaybackState', true);

			w.setTimeout(function () {
				if (isPlaying) q.stop();
			}, Math.max(50, (plan.duration * 1000) + 120));

			return true;
		};

		this.renderToEditor = function () {
			var ctx = getAudioContext();
			if (!ctx) return Promise.resolve(false);

			var state = getState();
			var plan = getTrackPlaybackPlan();
			if (!plan.clips.length || !plan.duration) return Promise.resolve(false);

			var sampleRate = plan.clips[0].buffer.sampleRate || ctx.sampleRate;
			var frameCount = Math.max(1, Math.ceil(plan.duration * sampleRate));
			var channels = 2;
			var offline = new OfflineAudioContext(channels, frameCount, sampleRate);
			var masterGain = offline.createGain();
			masterGain.gain.value = state.master.mute ? 0 : dbToGain(state.master.gain);
			masterGain.connect(offline.destination);
			var perTrackInputs = {};

			for (var i = 0; i < plan.clips.length; ++i) {
				var item = plan.clips[i];
				if (!perTrackInputs[item.track.id]) {
					perTrackInputs[item.track.id] = connectTrackGraph(offline, masterGain, item.track, 0);
				}

				var source = offline.createBufferSource();
				source.buffer = item.buffer;
				source.connect(perTrackInputs[item.track.id]);
				source.start(item.start, item.offset, item.duration);
			}

			return offline.startRendering().then(function (mixedBuffer) {
				app.engine.wavesurfer.loadDecodedBuffer(mixedBuffer);
				app.engine.currentFileName = 'RECwerk-multitrack-mix.wav';
				app.engine.currentFilePath = '';
				app.fireEvent('DidLoadFile', app.engine.currentFileName, '');
				return true;
			});
		};

		app.listenFor('DidLoadFile', function (file_name, file_path) {
			var asset = app.multitrack.findAssetForFile(file_name, file_path);
			if (!asset) return ;
			q.captureCurrentBufferForAsset(asset.id);
		});

		app.listenFor('RequestMultitrackPlay', function () {
			if (!q.play()) {
				alert('No buffered clips are ready for multitrack playback yet.');
			}
		});

		app.listenFor('RequestMultitrackStop', function () {
			q.stop();
		});

		app.listenFor('RequestMultitrackRenderToEditor', function () {
			q.renderToEditor().then(function (ok) {
				if (!ok) {
					alert('There is no multitrack mix to render yet.');
				}
			});
		});
	}

	PKAE._deps.multitrackEngine = PKMultitrackEngine;

})( window, PKAudioEditor );
