(function ( w, d, PKAE ) {
	'use strict';

	function PKMultitrack ( app ) {
		var q = this;
		var storage_key = 'pk_multitrack_state_v1';
		var palette = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#a78bfa', '#f59e0b', '#22c55e', '#f472b6'];
		var state = null;

		function nextId ( prefix ) {
			return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
		}

		function normalizeTags ( tags ) {
			tags = tags || {};
			return {
				title: tags.title || '',
				artist: tags.artist || '',
				album: tags.album || '',
				track: tags.track || '',
				year: tags.year || '',
				genre: tags.genre || '',
				comment: tags.comment || ''
			};
		}

		function hasTags ( tags ) {
			tags = normalizeTags(tags);
			for (var key in tags) {
				if (tags[key]) return true;
			}
			return false;
		}

		function toTitleCase ( value ) {
			return (value || '').replace(/\w\S*/g, function (part) {
				return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
			});
		}

		function splitNameAndExtension ( name ) {
			var match = /^(.*?)(\.[^.]+)?$/.exec(name || '');
			return {
				base: match && match[1] ? match[1] : '',
				ext: match && match[2] ? match[2] : ''
			};
		}

		function parseFilenameTags ( name ) {
			var parsed = splitNameAndExtension(name);
			var base = (parsed.base || '').replace(/^\d+\s*[-_.]\s*/, '').trim();
			var result = {
				title: '',
				artist: '',
				track: '',
				album: '',
				year: '',
				genre: '',
				comment: ''
			};
			var trackMatch = /^(\d{1,2})\s+/.exec(parsed.base || '');
			if (trackMatch) {
				result.track = trackMatch[1];
			}

			var parts = base.split(/\s+-\s+/);
			if (parts.length >= 2) {
				result.artist = parts.shift().trim();
				result.title = parts.join(' - ').trim();
			} else {
				result.title = base;
			}

			return result;
		}

		function buildFileNameFromTags ( asset, pattern ) {
			pattern = pattern || '%artist% - %title%';
			var parsed = splitNameAndExtension(asset.name);
			var tags = normalizeTags(asset.tags);
			var replacements = {
				artist: tags.artist || 'Unknown Artist',
				title: tags.title || parsed.base || 'Untitled',
				album: tags.album || 'Unknown Album',
				track: tags.track || '',
				year: tags.year || '',
				genre: tags.genre || ''
			};

			var output = pattern.replace(/%([a-z]+)%/gi, function (_, key) {
				var value = replacements[key.toLowerCase()];
				return value == null ? '' : value;
			}).replace(/\s+/g, ' ').replace(/\s-\s-\s/g, ' - ').trim();

			output = output.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
			if (!output) output = parsed.base || 'RECwerk File';
			return output + parsed.ext;
		}

		function getClipEnd ( clip ) {
			return (clip.start || 0) + (clip.duration || 0);
		}

		function buildTrack ( name ) {
			var index = state && state.tracks ? state.tracks.length : 0;
			return {
				id: nextId('trk'),
				name: name || ('Track ' + (index + 1)),
				color: palette[index % palette.length],
				mute: false,
				solo: false,
				arm: false,
				gain: 0,
				pan: 0,
				effects: ['Insert FX', 'Send FX'],
				clips: []
			};
		}

		function buildAsset ( asset ) {
			return {
				id: asset.id || nextId('ast'),
				name: asset.name || 'Untitled Asset',
				path: asset.path || '',
				type: asset.type || 'audio',
				source: asset.source || 'import',
				duration: asset.duration || 0,
				createdAt: asset.createdAt || Date.now(),
				lastAction: asset.lastAction || '',
				tags: normalizeTags(asset.tags)
			};
		}

		function buildDefaultState () {
			state = {
				visible: false,
				mixerVisible: true,
				libraryVisible: true,
				selectedTrackId: '',
				selectedAssetId: '',
				selectedAssetIds: [],
				tracks: [],
				assets: [],
				master: {
					gain: 0,
					mute: false,
					solo: false
				}
			};

			for (var i = 0; i < 4; ++i) {
				state.tracks.push ( buildTrack () );
			}

			state.selectedTrackId = state.tracks[0].id;
			return state;
		}

		function loadState () {
			var raw = null;
			try {
				raw = w.localStorage && w.localStorage.getItem(storage_key);
			} catch (err) {}

			if (!raw) return buildDefaultState ();

			try {
				state = JSON.parse (raw);
			} catch (err) {
				return buildDefaultState ();
			}

			if (!state || !state.tracks || !(state.tracks instanceof Array)) {
				return buildDefaultState ();
			}

				if (!state.assets || !(state.assets instanceof Array)) {
					state.assets = [];
				}
				if (!state.selectedAssetId) state.selectedAssetId = '';
				if (!state.selectedAssetIds || !(state.selectedAssetIds instanceof Array)) state.selectedAssetIds = [];

			if (!state.master) {
				state.master = { gain: 0, mute: false, solo: false };
			}

			for (var i = 0; i < state.tracks.length; ++i) {
				state.tracks[i].effects = state.tracks[i].effects || ['Insert FX', 'Send FX'];
				state.tracks[i].clips = state.tracks[i].clips || [];
				if (!state.tracks[i].id) state.tracks[i].id = nextId('trk');
				if (!state.tracks[i].color) state.tracks[i].color = palette[i % palette.length];
			}

			for (var j = 0; j < state.assets.length; ++j) {
				state.assets[j] = buildAsset ( state.assets[j] );
			}

			if (!state.tracks.length) {
				state.tracks.push ( buildTrack ('Track 1') );
			}

			if (!state.selectedTrackId || !q.getTrack(state.selectedTrackId)) {
				state.selectedTrackId = state.tracks[0].id;
			}

			state.visible = !!state.visible;
			state.mixerVisible = state.mixerVisible !== false;
			state.libraryVisible = state.libraryVisible !== false;

			return state;
		}

		function persist () {
			try {
				w.localStorage && w.localStorage.setItem(storage_key, JSON.stringify(state));
			} catch (err) {}
		}

		function emitChange () {
			persist ();
			app.fireEvent ('DidMultitrackChange', state);
			app.fireEvent ('DidToggleMultitrackWorkspace', state.visible);
			app.fireEvent ('DidToggleMultitrackMixer', state.mixerVisible);
			app.fireEvent ('DidToggleMultitrackLibrary', state.libraryVisible);
		}

		function getSelectedTrack () {
			return q.getTrack ( state.selectedTrackId );
		}

		function getCurrentDuration () {
			if (!app.engine || !app.engine.wavesurfer || !app.engine.wavesurfer.getDuration) return 0;
			return app.engine.wavesurfer.getDuration () || 0;
		}

		this.getState = function () {
			return state;
		};

		this.getTimelineDuration = function () {
			var total = 0;
			for (var i = 0; i < state.tracks.length; ++i) {
				var track = state.tracks[i];
				for (var j = 0; j < track.clips.length; ++j) {
					total = Math.max(total, getClipEnd(track.clips[j]));
				}
			}
			return Math.max(total, getCurrentDuration(), 10);
		};

		this.getTrack = function ( track_id ) {
			for (var i = 0; i < state.tracks.length; ++i) {
				if (state.tracks[i].id === track_id) return state.tracks[i];
			}

			return null;
		};

		this.getAsset = function ( asset_id ) {
			for (var i = 0; i < state.assets.length; ++i) {
				if (state.assets[i].id === asset_id) return state.assets[i];
			}

			return null;
		};

			this.getSelectedAsset = function () {
			return q.getAsset(state.selectedAssetId);
		};

		this.getSelectedAssets = function () {
			var ids = state.selectedAssetIds && state.selectedAssetIds.length ? state.selectedAssetIds.slice() :
				(state.selectedAssetId ? [state.selectedAssetId] : []);
			var out = [];
			for (var i = 0; i < ids.length; ++i) {
				var asset = q.getAsset(ids[i]);
				if (asset) out.push(asset);
			}
			return out;
		};

		this.findAssetForFile = function ( file_name, file_path ) {
			var normalized_name = (file_name || '').toLowerCase();
			var normalized_path = (file_path || '').toLowerCase();

			for (var i = 0; i < state.assets.length; ++i) {
				var asset = state.assets[i];
				if (normalized_path && asset.path && asset.path.toLowerCase() === normalized_path) {
					return asset;
				}
			}

			for (var j = 0; j < state.assets.length; ++j) {
				var asset_by_name = state.assets[j];
				if (normalized_name && asset_by_name.name && asset_by_name.name.toLowerCase() === normalized_name) {
					return asset_by_name;
				}
			}

			return null;
		};

		this.getExportMetadata = function ( file_name, file_path ) {
			var selected_asset = q.getSelectedAsset();
			if (selected_asset && hasTags(selected_asset.tags)) {
				return normalizeTags(selected_asset.tags);
			}

			var asset = q.findAssetForFile(file_name, file_path);
			if (!asset) return null;

			return normalizeTags(asset.tags);
		};

		this.setSelectedAsset = function ( asset_id ) {
			if (asset_id && !q.getAsset(asset_id)) return false;
			state.selectedAssetId = asset_id || '';
			state.selectedAssetIds = asset_id ? [asset_id] : [];
			emitChange ();
			return true;
		};

		this.toggleAssetSelection = function ( asset_id, keep_existing ) {
			if (!q.getAsset(asset_id)) return false;

			if (!keep_existing) {
				state.selectedAssetIds = [asset_id];
				state.selectedAssetId = asset_id;
				emitChange ();
				return true;
			}

			var idx = state.selectedAssetIds.indexOf(asset_id);
			if (idx > -1) state.selectedAssetIds.splice(idx, 1);
			else state.selectedAssetIds.push(asset_id);

			state.selectedAssetId = state.selectedAssetIds.length ? state.selectedAssetIds[state.selectedAssetIds.length - 1] : '';
			emitChange ();
			return true;
		};

		this.selectAllAssets = function () {
			state.selectedAssetIds = state.assets.map(function (asset) { return asset.id; });
			state.selectedAssetId = state.selectedAssetIds[0] || '';
			emitChange ();
		};

		this.clearSelectedAssets = function () {
			state.selectedAssetIds = [];
			state.selectedAssetId = '';
			emitChange ();
		};

		this.isVisible = function () {
			return !!state.visible;
		};

		this.isMixerVisible = function () {
			return !!state.mixerVisible;
		};

		this.isLibraryVisible = function () {
			return !!state.libraryVisible;
		};

		this.hasSoloTracks = function () {
			for (var i = 0; i < state.tracks.length; ++i) {
				if (state.tracks[i].solo) return true;
			}

			return false;
		};

		this.isTrackAudible = function ( track ) {
			var has_solo = q.hasSoloTracks ();
			if (track.mute) return false;
			if (!has_solo) return true;
			return !!track.solo;
		};

		this.toggleWorkspace = function () {
			state.visible = !state.visible;
			emitChange ();
		};

		this.toggleMixer = function () {
			state.visible = true;
			state.mixerVisible = !state.mixerVisible;
			emitChange ();
		};

		this.toggleLibrary = function () {
			state.visible = true;
			state.libraryVisible = !state.libraryVisible;
			emitChange ();
		};

		this.setSelectedTrack = function ( track_id ) {
			if (!q.getTrack(track_id)) return false;
			state.selectedTrackId = track_id;
			emitChange ();
			return true;
		};

		this.addTrack = function ( name ) {
			var track = buildTrack ( name );
			state.tracks.push ( track );
			state.selectedTrackId = track.id;
			emitChange ();
			return track;
		};

		this.removeTrack = function ( track_id ) {
			if (state.tracks.length <= 1) return false;

			for (var i = 0; i < state.tracks.length; ++i) {
				if (state.tracks[i].id !== track_id) continue;
				state.tracks.splice (i, 1);
				break;
			}

			if (!q.getTrack(state.selectedTrackId)) {
				state.selectedTrackId = state.tracks[0].id;
			}

			emitChange ();
			return true;
		};

		this.setTrackValue = function ( track_id, key, value ) {
			var track = q.getTrack ( track_id );
			if (!track) return false;
			track[key] = value;
			emitChange ();
			return true;
		};

		this.toggleTrackFlag = function ( track_id, flag ) {
			var track = q.getTrack ( track_id );
			if (!track) return false;
			track[flag] = !track[flag];
			emitChange ();
			return true;
		};

		this.setMasterValue = function ( key, value ) {
			state.master[key] = value;
			emitChange ();
			return true;
		};

		this.addAsset = function ( asset ) {
			var normalized = buildAsset ( asset );
			var existing = null;

			for (var i = 0; i < state.assets.length; ++i) {
				var current = state.assets[i];
				if (normalized.path && current.path && normalized.path === current.path) {
					existing = current;
					break;
				}
				if (!normalized.path && !current.path && normalized.name === current.name && normalized.type === current.type) {
					existing = current;
					break;
				}
			}

			if (existing) {
				existing.name = normalized.name;
				existing.type = normalized.type;
				existing.source = normalized.source;
				existing.duration = normalized.duration;
				existing.lastAction = normalized.lastAction;
				existing.tags = normalizeTags(existing.tags);
				if (!state.selectedAssetId) state.selectedAssetId = existing.id;
				if (!state.selectedAssetIds.length) state.selectedAssetIds = [existing.id];
				emitChange ();
				return existing;
			}

			state.assets.unshift ( normalized );
			if (!state.selectedAssetId) state.selectedAssetId = normalized.id;
			if (!state.selectedAssetIds.length) state.selectedAssetIds = [normalized.id];
			emitChange ();
			return normalized;
		};

		this.updateAsset = function ( asset_id, patch ) {
			var asset = q.getAsset ( asset_id );
			if (!asset) return false;

			for (var key in patch) {
				if (key === 'tags') {
					asset.tags = normalizeTags ( patch.tags );
					continue;
				}
				asset[key] = patch[key];
			}

			emitChange ();
			return true;
		};

		this.updateAssetTag = function ( asset_id, field, value ) {
			var asset = q.getAsset ( asset_id );
			if (!asset) return false;
			asset.tags[field] = value;
			emitChange ();
			return true;
		};

		this.applyBulkTagPatch = function ( patches ) {
			var count = 0;
			for (var i = 0; i < patches.length; ++i) {
				var patch = patches[i];
				var asset = q.getAsset(patch.id);
				if (!asset) continue;

				for (var key in patch.tags) {
					asset.tags[key] = patch.tags[key];
				}
				asset.lastAction = 'bulk-edit';
				++count;
			}

			if (count) emitChange ();
			return count;
		};

		this.applyReplaceText = function ( findText, replaceText, fields ) {
			var assets = q.getSelectedAssets();
			if (!assets.length || !findText) return 0;
			fields = fields && fields.length ? fields : ['title', 'artist', 'album', 'track', 'year', 'genre', 'comment'];
			var count = 0;

			for (var i = 0; i < assets.length; ++i) {
				var asset = assets[i];
				var touched = false;
				for (var j = 0; j < fields.length; ++j) {
					var field = fields[j];
					if (!asset.tags[field]) continue;
					var nextValue = asset.tags[field].split(findText).join(replaceText);
					if (nextValue !== asset.tags[field]) {
						asset.tags[field] = nextValue;
						touched = true;
					}
				}
				if (touched) {
					asset.lastAction = 'replace-text';
					++count;
				}
			}

			if (count) emitChange ();
			return count;
		};

		this.addAssetToTrack = function ( asset_id, track_id ) {
			var track = q.getTrack ( track_id || state.selectedTrackId );
			var asset = q.getAsset ( asset_id );
			if (!track || !asset) return false;

			var lastEnd = 0;
			for (var i = 0; i < track.clips.length; ++i) {
				var clipEnd = (track.clips[i].start || 0) + (track.clips[i].duration || 0);
				if (clipEnd > lastEnd) lastEnd = clipEnd;
			}

			track.clips.push ({
				id: nextId('clip'),
				assetId: asset.id,
				name: asset.name,
				start: lastEnd ? lastEnd + 0.25 : 0,
				offset: 0,
				duration: asset.duration || getCurrentDuration () || 0
			});
			state.selectedTrackId = track.id;
			emitChange ();
			return true;
		};

		this.updateClip = function ( track_id, clip_id, patch ) {
			var track = q.getTrack(track_id);
			if (!track) return false;

			for (var i = 0; i < track.clips.length; ++i) {
				if (track.clips[i].id !== clip_id) continue;
				for (var key in patch) track.clips[i][key] = patch[key];
				emitChange ();
				return true;
			}

			return false;
		};

		this.getClip = function ( track_id, clip_id ) {
			var track = q.getTrack(track_id);
			if (!track) return null;
			for (var i = 0; i < track.clips.length; ++i) {
				if (track.clips[i].id === clip_id) return track.clips[i];
			}
			return null;
		};

		this.addCurrentFileToSelectedTrack = function () {
			if (!app.engine || !app.engine.currentFileName) return false;

			var asset = q.addAsset ({
				name: app.engine.currentFileName,
				path: app.engine.currentFilePath || '',
				type: app.isProjectFile && app.isProjectFile(app.engine.currentFileName) ? 'project' : 'audio',
				source: 'editor',
				duration: getCurrentDuration (),
				lastAction: 'Added from editor'
			});

			return q.addAssetToTrack ( asset.id, state.selectedTrackId );
		};

		this.noteExport = function ( file_name, format, tags ) {
			return q.addAsset ({
				name: file_name || ('RECwerk-export.' + (format || 'bin')),
				type: 'export-' + (format || 'file'),
				source: 'export',
				duration: getCurrentDuration (),
				lastAction: 'Exported with embedded tags',
				tags: normalizeTags(tags)
			});
		};

		this.createVinylEntry = function ( name ) {
			return q.addAsset ({
				name: name || 'RECwerk Vinyl Take',
				type: 'vinyl-take',
				source: 'vinyl-transfer',
				duration: getCurrentDuration (),
				lastAction: 'Prepared for tagging',
				tags: {
					genre: 'Vinyl Transfer'
				}
			});
		};

		this.applyBatchTagAction = function ( action, options ) {
			var assets = q.getSelectedAssets();
			if (!assets.length) return 0;
			var count = 0;

			for (var i = 0; i < assets.length; ++i) {
				var asset = assets[i];
				var tags = normalizeTags(asset.tags);
				if (action === 'trim-tags') {
					for (var key in tags) tags[key] = tags[key].trim();
				} else if (action === 'title-case-tags') {
					for (var key2 in tags) if (tags[key2]) tags[key2] = toTitleCase(tags[key2]);
				} else if (action === 'upper-tags') {
					for (var key3 in tags) if (tags[key3]) tags[key3] = tags[key3].toUpperCase();
				} else if (action === 'lower-tags') {
					for (var key4 in tags) if (tags[key4]) tags[key4] = tags[key4].toLowerCase();
				} else if (action === 'filename-to-tags') {
					var inferred = parseFilenameTags(asset.path || asset.name);
					for (var key5 in inferred) {
						if (inferred[key5]) tags[key5] = inferred[key5];
					}
				} else if (action === 'tags-to-name') {
					asset.name = buildFileNameFromTags(asset, options && options.pattern);
				} else {
					continue;
				}

				asset.tags = tags;
				asset.lastAction = action;
				++count;
			}

			if (count) emitChange ();
			return count;
		};

		this.getRenamePlan = function ( pattern ) {
			var assets = q.getSelectedAssets();
			var plan = [];
			for (var i = 0; i < assets.length; ++i) {
				var asset = assets[i];
				var nextName = buildFileNameFromTags(asset, pattern);
				plan.push({
					id: asset.id,
					name: asset.name,
					path: asset.path,
					nextName: nextName
				});
			}
			return plan;
		};

		this.syncViewState = emitChange;

		loadState ();

		app.listenFor ('RequestToggleMultitrackWorkspace', function () {
			q.toggleWorkspace ();
		});

		app.listenFor ('RequestToggleMultitrackMixer', function () {
			q.toggleMixer ();
		});

		app.listenFor ('RequestToggleMultitrackLibrary', function () {
			q.toggleLibrary ();
		});

		app.listenFor ('DidLoadFile', function ( file_name, file_path ) {
			if (!file_name) return ;

			q.addAsset ({
				name: file_name,
				path: file_path || '',
				type: app.isProjectFile && app.isProjectFile(file_name) ? 'project' : 'audio',
				source: 'opened-file',
				duration: getCurrentDuration (),
				lastAction: 'Opened in editor'
			});
		});

		app.listenFor ('DidActionRecordStop', function ( has_buffers ) {
			if (!has_buffers) return ;

			q.addAsset ({
				name: 'RECwerk Take ' + new Date().toLocaleString(),
				type: 'recording',
				source: 'recording',
				duration: getCurrentDuration (),
				lastAction: 'Captured in editor',
				tags: {
					genre: 'Vinyl Transfer'
				}
			});
		});

		setTimeout(function () {
			emitChange ();
		}, 0);
	}

	PKAE._deps.multitrack = PKMultitrack;

})( window, document, PKAudioEditor );
