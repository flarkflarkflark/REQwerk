(function ( w, d, PKAE ) {
	'use strict';

	function PKMultitrack ( app ) {
		var q = this;
		var storage_key = 'pk_multitrack_state_v2';
		var legacy_storage_key = 'pk_multitrack_state_v1';
		var palette = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#a78bfa', '#f59e0b', '#22c55e', '#f472b6'];
		var defaultToolbar = [
			'play-mix',
			'stop-mix',
			'render-mix',
			'add-track',
			'add-current-file',
			'new-vinyl',
			'toggle-mixer',
			'toggle-library'
		];
		var defaultDocks = {
			left: { tabs: ['browser', 'inspector'], active: 'browser', collapsed: false },
			right: { tabs: ['mixer', 'library'], active: 'mixer', collapsed: false },
			bottom: { tabs: ['actions'], active: 'actions', collapsed: false }
		};
		var state = null;

		function nextId ( prefix ) {
			return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
		}

		function cloneObject ( value ) {
			return JSON.parse ( JSON.stringify ( value ) );
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
			if (trackMatch) result.track = trackMatch[1];

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

		function getTrackIndex ( track_id ) {
			for (var i = 0; i < state.tracks.length; ++i) {
				if (state.tracks[i].id === track_id) return i;
			}
			return -1;
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

		function cloneTrack ( track, name ) {
			if (!track) return null;
			var copy = {
				id: nextId('trk'),
				name: name || (track.name + ' Copy'),
				color: track.color || palette[0],
				mute: !!track.mute,
				solo: !!track.solo,
				arm: false,
				gain: track.gain || 0,
				pan: track.pan || 0,
				effects: cloneObject(track.effects || ['Insert FX', 'Send FX']),
				clips: []
			};

			for (var i = 0; i < (track.clips || []).length; ++i) {
				copy.clips.push(Object.assign({}, track.clips[i], {
					id: nextId('clip')
				}));
			}

			return copy;
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

		function buildStatus ( message, detail, level ) {
			return {
				message: message || 'Ready',
				detail: detail || '',
				level: level || 'info',
				updatedAt: Date.now()
			};
		}

		function buildDefaultState () {
			state = {
				layoutVersion: 2,
				visible: true,
				mixerVisible: true,
				libraryVisible: true,
				selectedTrackId: '',
				selectedAssetId: '',
				selectedAssetIds: [],
				selectedClipId: '',
				selectedClipTrackId: '',
				tracks: [],
				assets: [],
				customToolbar: defaultToolbar.slice(),
				docks: cloneObject(defaultDocks),
				status: buildStatus('Ready', 'Workspace available for arrangement, tagging and mix preview.', 'info'),
				master: {
					gain: 0,
					mute: false,
					solo: false
				}
			};

			state.tracks.push ( buildTrack ('Track 1') );

			state.selectedTrackId = state.tracks[0].id;
			return state;
		}

		function normalizeDockState () {
			if (!state.docks) state.docks = cloneObject(defaultDocks);

			for (var dock_id in defaultDocks) {
				if (!state.docks[dock_id]) state.docks[dock_id] = cloneObject(defaultDocks[dock_id]);
				if (!(state.docks[dock_id].tabs instanceof Array)) state.docks[dock_id].tabs = cloneObject(defaultDocks[dock_id].tabs);
				if (state.docks[dock_id].collapsed == null) state.docks[dock_id].collapsed = false;
				state.docks[dock_id].tabs = state.docks[dock_id].tabs.filter(function (panel_id, index, arr) {
					return !!panel_id && arr.indexOf(panel_id) === index;
				});
				if (!state.docks[dock_id].tabs.length) {
					state.docks[dock_id].active = '';
				} else if (state.docks[dock_id].tabs.indexOf(state.docks[dock_id].active) === -1) {
					state.docks[dock_id].active = state.docks[dock_id].tabs[0];
				}
			}
		}

		function ensurePanelVisibleState () {
			state.mixerVisible = q.hasDockPanel('mixer');
			state.libraryVisible = q.hasDockPanel('library');
		}

		function ensureToolbarState () {
			if (!(state.customToolbar instanceof Array) || !state.customToolbar.length) {
				state.customToolbar = defaultToolbar.slice();
			}
			state.customToolbar = state.customToolbar.filter(function (action_id, index, arr) {
				return !!action_id && arr.indexOf(action_id) === index;
			});
		}

		function ensureDockPanel ( panel_id, dock_id ) {
			var dock = state.docks[dock_id];
			if (!dock) return;

			for (var key in state.docks) {
				var tabs = state.docks[key].tabs;
				var idx = tabs.indexOf(panel_id);
				if (idx > -1) tabs.splice(idx, 1);
				if (state.docks[key].active === panel_id) state.docks[key].active = tabs[0] || '';
			}

			dock.tabs.push(panel_id);
			dock.active = dock.active || panel_id;
			dock.collapsed = false;
		}

		function setStatusInternal ( message, detail, level ) {
			state.status = buildStatus(message, detail, level);
		}

		function loadState () {
			var raw = null;
			var raw_v2 = null;
			var raw_v1 = null;
			var from_legacy = false;
			var needs_layout_upgrade = false;
			try {
				raw_v2 = w.localStorage && w.localStorage.getItem(storage_key);
				raw_v1 = w.localStorage && w.localStorage.getItem(legacy_storage_key);
				raw = raw_v2 || raw_v1;
				from_legacy = !raw_v2 && !!raw_v1;
			} catch (err) {}

			if (!raw) return buildDefaultState ();

			try {
				state = JSON.parse (raw);
			} catch (err2) {
				return buildDefaultState ();
			}

			if (!state || !state.tracks || !(state.tracks instanceof Array)) {
				return buildDefaultState ();
			}

			if (!state.assets || !(state.assets instanceof Array)) state.assets = [];
			if (!state.selectedAssetId) state.selectedAssetId = '';
			if (!state.selectedAssetIds || !(state.selectedAssetIds instanceof Array)) state.selectedAssetIds = [];
			if (!state.master) state.master = { gain: 0, mute: false, solo: false };
			if (!state.status) state.status = buildStatus('Ready', 'Workspace restored from previous session.', 'info');
			needs_layout_upgrade = !state.layoutVersion || state.layoutVersion < 2;
			state.layoutVersion = 2;

			for (var i = 0; i < state.tracks.length; ++i) {
				state.tracks[i].effects = state.tracks[i].effects || ['Insert FX', 'Send FX'];
				state.tracks[i].clips = state.tracks[i].clips || [];
				if (!state.tracks[i].id) state.tracks[i].id = nextId('trk');
				if (!state.tracks[i].color) state.tracks[i].color = palette[i % palette.length];
			}

			for (var j = 0; j < state.assets.length; ++j) {
				state.assets[j] = buildAsset ( state.assets[j] );
			}

			if (!state.tracks.length) state.tracks.push ( buildTrack ('Track 1') );
			if (!state.selectedTrackId || !q.getTrack(state.selectedTrackId)) state.selectedTrackId = state.tracks[0].id;
			if (state.selectedClipId && !q.getClip(state.selectedClipTrackId, state.selectedClipId)) {
				state.selectedClipId = '';
				state.selectedClipTrackId = '';
			}

			state.visible = !!state.visible;
			normalizeDockState ();
			ensureToolbarState ();
			if (from_legacy || needs_layout_upgrade) {
				state.visible = true;
				ensureDockPanel('browser', 'left');
				ensureDockPanel('inspector', 'left');
				ensureDockPanel('mixer', 'right');
				ensureDockPanel('library', 'right');
				ensureDockPanel('actions', 'bottom');
				state.status = buildStatus('Workspace upgraded', 'Legacy layout migrated to the docked workspace.', 'info');
			}
			ensurePanelVisibleState ();
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

		function getCurrentDuration () {
			if (!app.engine || !app.engine.wavesurfer || !app.engine.wavesurfer.getDuration) return 0;
			return app.engine.wavesurfer.getDuration () || 0;
		}

		loadState ();

		this.getState = function () {
			return state;
		};

		this.getTimelineDuration = function () {
			var total = 0;
			for (var i = 0; i < state.tracks.length; ++i) {
				for (var j = 0; j < state.tracks[i].clips.length; ++j) {
					total = Math.max(total, getClipEnd(state.tracks[i].clips[j]));
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

		this.getClip = function ( track_id, clip_id ) {
			var track = q.getTrack(track_id);
			if (!track) return null;
			for (var i = 0; i < track.clips.length; ++i) {
				if (track.clips[i].id === clip_id) return track.clips[i];
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

		this.getSelectedClip = function () {
			if (!state.selectedClipId || !state.selectedClipTrackId) return null;
			return q.getClip(state.selectedClipTrackId, state.selectedClipId);
		};

		this.findAssetForFile = function ( file_name, file_path ) {
			var normalized_name = (file_name || '').toLowerCase();
			var normalized_path = (file_path || '').toLowerCase();

			for (var i = 0; i < state.assets.length; ++i) {
				if (normalized_path && state.assets[i].path && state.assets[i].path.toLowerCase() === normalized_path) {
					return state.assets[i];
				}
			}

			for (var j = 0; j < state.assets.length; ++j) {
				if (normalized_name && state.assets[j].name && state.assets[j].name.toLowerCase() === normalized_name) {
					return state.assets[j];
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

		this.getPanelDock = function ( panel_id ) {
			for (var dock_id in state.docks) {
				if (state.docks[dock_id].tabs.indexOf(panel_id) > -1) return dock_id;
			}
			return '';
		};

		this.hasDockPanel = function ( panel_id ) {
			return !!q.getPanelDock(panel_id);
		};

		this.setDockActiveTab = function ( dock_id, panel_id ) {
			var dock = state.docks[dock_id];
			if (!dock) return false;
			if (dock.tabs.indexOf(panel_id) === -1) return false;
			dock.active = panel_id;
			emitChange ();
			return true;
		};

		this.setDockPanel = function ( panel_id, dock_id ) {
			var target_dock = state.docks[dock_id];
			if (!panel_id || !target_dock) return false;
			state.visible = true;

			for (var key in state.docks) {
				var tabs = state.docks[key].tabs;
				var idx = tabs.indexOf(panel_id);
				if (idx > -1) tabs.splice(idx, 1);
				if (state.docks[key].active === panel_id) state.docks[key].active = tabs[0] || '';
			}

			target_dock.tabs.push(panel_id);
			target_dock.active = panel_id;
			target_dock.collapsed = false;
			ensurePanelVisibleState ();
			setStatusInternal('Panel moved', panel_id + ' docked to ' + dock_id + '.', 'info');
			emitChange ();
			return true;
		};

		this.removeDockPanel = function ( panel_id ) {
			var removed = false;
			for (var dock_id in state.docks) {
				var tabs = state.docks[dock_id].tabs;
				var idx = tabs.indexOf(panel_id);
				if (idx === -1) continue;
				tabs.splice(idx, 1);
				if (state.docks[dock_id].active === panel_id) state.docks[dock_id].active = tabs[0] || '';
				removed = true;
			}

			if (!removed) return false;
			ensurePanelVisibleState ();
			setStatusInternal('Panel hidden', panel_id + ' removed from the dock layout.', 'warn');
			emitChange ();
			return true;
		};

		this.toggleDockCollapsed = function ( dock_id ) {
			var dock = state.docks[dock_id];
			if (!dock) return false;
			dock.collapsed = !dock.collapsed;
			emitChange ();
			return true;
		};

		this.setSelectedTrack = function ( track_id ) {
			if (!q.getTrack(track_id)) return false;
			state.selectedTrackId = track_id;
			setStatusInternal('Track focused', q.getTrack(track_id).name + ' is active.', 'info');
			emitChange ();
			return true;
		};

		this.setSelectedClip = function ( track_id, clip_id ) {
			if (!q.getClip(track_id, clip_id)) return false;
			state.selectedClipTrackId = track_id;
			state.selectedClipId = clip_id;
			emitChange ();
			return true;
		};

		this.toggleWorkspace = function () {
			state.visible = !state.visible;
			setStatusInternal(state.visible ? 'Workspace visible' : 'Workspace hidden', 'Arrange, docks and status panels ' + (state.visible ? 'opened.' : 'closed.'), 'info');
			emitChange ();
		};

		this.toggleMixer = function () {
			state.visible = true;
			if (q.hasDockPanel('mixer')) q.removeDockPanel('mixer');
			else q.setDockPanel('mixer', 'right');
		};

		this.toggleLibrary = function () {
			state.visible = true;
			if (q.hasDockPanel('library')) q.removeDockPanel('library');
			else q.setDockPanel('library', 'right');
		};

		this.addTrack = function ( name, index ) {
			var track = buildTrack ( name );
			if (index == null || isNaN(index)) index = state.tracks.length;
			index = Math.max(0, Math.min(state.tracks.length, index / 1));
			state.tracks.splice ( index, 0, track );
			state.selectedTrackId = track.id;
			state.selectedClipTrackId = '';
			state.selectedClipId = '';
			setStatusInternal('Track added', track.name + ' is ready for clips and routing.', 'info');
			emitChange ();
			return track;
		};

		this.insertTrackRelative = function ( reference_track_id, placement, name ) {
			var reference_track = q.getTrack(reference_track_id);
			var reference_index = getTrackIndex(reference_track_id);
			var track = null;
			var target_index = 0;
			if (!reference_track || reference_index === -1) return false;
			target_index = placement === 'above' ? reference_index : reference_index + 1;
			track = buildTrack(name);
			state.tracks.splice(target_index, 0, track);
			state.selectedTrackId = track.id;
			state.selectedClipTrackId = '';
			state.selectedClipId = '';
			setStatusInternal('Track inserted', track.name + ' inserted ' + placement + ' ' + reference_track.name + '.', 'info');
			emitChange ();
			return track;
		};

		this.duplicateTrack = function ( track_id ) {
			var source_track = q.getTrack(track_id);
			var source_index = getTrackIndex(track_id);
			var copy = cloneTrack(source_track);
			if (!copy || source_index === -1) return false;

			state.tracks.splice(source_index + 1, 0, copy);
			state.selectedTrackId = copy.id;
			state.selectedClipTrackId = '';
			state.selectedClipId = '';
			setStatusInternal('Track duplicated', copy.name + ' created from ' + source_track.name + '.', 'info');
			emitChange ();
			return copy;
		};

		this.renameTrack = function ( track_id, name ) {
			var track = q.getTrack(track_id);
			if (!track) return false;
			track.name = name || track.name;
			setStatusInternal('Track renamed', track.name, 'info');
			emitChange ();
			return true;
		};

		this.removeTrack = function ( track_id ) {
			if (state.tracks.length <= 1) {
				setStatusInternal('Track kept', 'At least one track must remain in the workspace.', 'warn');
				emitChange ();
				return false;
			}

			var removed_track = null;
			for (var i = 0; i < state.tracks.length; ++i) {
				if (state.tracks[i].id !== track_id) continue;
				removed_track = state.tracks[i];
				state.tracks.splice (i, 1);
				break;
			}
			if (!removed_track) return false;

			if (!q.getTrack(state.selectedTrackId)) state.selectedTrackId = state.tracks[0].id;
			if (state.selectedClipTrackId === track_id) {
				state.selectedClipTrackId = '';
				state.selectedClipId = '';
			}

			setStatusInternal('Track removed', removed_track.name + ' removed from the arrange view.', 'warn');
			emitChange ();
			return true;
		};

		this.setTrackValue = function ( track_id, key, value ) {
			var track = q.getTrack ( track_id );
			if (!track) return false;
			track[key] = value;
			setStatusInternal('Track updated', track.name + ' ' + key + ' -> ' + value, 'info');
			emitChange ();
			return true;
		};

		this.toggleTrackFlag = function ( track_id, flag ) {
			var track = q.getTrack ( track_id );
			if (!track) return false;
			track[flag] = !track[flag];
			setStatusInternal('Track ' + flag, track.name + ' ' + (track[flag] ? 'enabled' : 'disabled') + ' ' + flag + '.', track[flag] ? 'info' : 'warn');
			emitChange ();
			return true;
		};

		this.setMasterValue = function ( key, value ) {
			state.master[key] = value;
			setStatusInternal('Master updated', key + ' -> ' + value, 'info');
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
				setStatusInternal('Asset refreshed', existing.name + ' updated in the library.', 'info');
				emitChange ();
				return existing;
			}

			state.assets.unshift ( normalized );
			if (!state.selectedAssetId) state.selectedAssetId = normalized.id;
			if (!state.selectedAssetIds.length) state.selectedAssetIds = [normalized.id];
			setStatusInternal('Asset added', normalized.name + ' available in the library/browser.', 'info');
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

			setStatusInternal('Asset updated', asset.name + ' metadata changed.', 'info');
			emitChange ();
			return true;
		};

		this.removeAsset = function ( asset_id ) {
			for (var i = 0; i < state.assets.length; ++i) {
				if (state.assets[i].id !== asset_id) continue;
				setStatusInternal('Asset removed', state.assets[i].name + ' removed from the library.', 'warn');
				state.assets.splice(i, 1);
				break;
			}
			state.selectedAssetIds = state.selectedAssetIds.filter(function (id) { return id !== asset_id; });
			if (state.selectedAssetId === asset_id) state.selectedAssetId = state.selectedAssetIds[0] || '';
			emitChange ();
			return true;
		};

		this.updateAssetTag = function ( asset_id, field, value ) {
			var asset = q.getAsset ( asset_id );
			if (!asset) return false;
			asset.tags[field] = value;
			setStatusInternal('Tag updated', asset.name + ' ' + field + ' changed.', 'info');
			emitChange ();
			return true;
		};

		this.applyBulkTagPatch = function ( patches ) {
			var count = 0;
			for (var i = 0; i < patches.length; ++i) {
				var patch = patches[i];
				var asset = q.getAsset(patch.id);
				if (!asset) continue;

				for (var key in patch.tags) asset.tags[key] = patch.tags[key];
				asset.lastAction = 'bulk-edit';
				++count;
			}

			if (count) {
				setStatusInternal('Bulk tags applied', count + ' assets updated.', 'info');
				emitChange ();
			}
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

			if (count) {
				setStatusInternal('Replace text', count + ' assets updated.', 'info');
				emitChange ();
			}
			return count;
		};

		this.setSelectedAsset = function ( asset_id ) {
			if (asset_id && !q.getAsset(asset_id)) return false;
			state.selectedAssetId = asset_id || '';
			state.selectedAssetIds = asset_id ? [asset_id] : [];
			if (asset_id) setStatusInternal('Export source selected', q.getAsset(asset_id).name, 'info');
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
			setStatusInternal('Asset selection', state.selectedAssetIds.length + ' assets selected.', 'info');
			emitChange ();
		};

		this.clearSelectedAssets = function () {
			state.selectedAssetIds = [];
			state.selectedAssetId = '';
			setStatusInternal('Asset selection cleared', 'No assets selected.', 'warn');
			emitChange ();
		};

		this.addAssetToTrack = function ( asset_id, track_id ) {
			var track = q.getTrack ( track_id || state.selectedTrackId );
			var asset = q.getAsset ( asset_id );
			if (!track || !asset) return false;

			var lastEnd = 0;
			for (var i = 0; i < track.clips.length; ++i) {
				lastEnd = Math.max(lastEnd, getClipEnd(track.clips[i]));
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
			state.selectedClipTrackId = track.id;
			state.selectedClipId = track.clips[track.clips.length - 1].id;
			setStatusInternal('Clip routed', asset.name + ' inserted on ' + track.name + '.', 'info');
			emitChange ();
			return true;
		};

		this.updateClip = function ( track_id, clip_id, patch ) {
			var clip = q.getClip(track_id, clip_id);
			if (!clip) return false;

			for (var key in patch) clip[key] = patch[key];
			state.selectedClipTrackId = track_id;
			state.selectedClipId = clip_id;
			setStatusInternal('Clip updated', clip.name + ' changed in the arrange view.', 'info');
			emitChange ();
			return true;
		};

		this.removeClip = function ( track_id, clip_id ) {
			var track = q.getTrack(track_id);
			if (!track) return false;

			for (var i = 0; i < track.clips.length; ++i) {
				if (track.clips[i].id !== clip_id) continue;
				setStatusInternal('Clip removed', track.clips[i].name + ' removed from ' + track.name + '.', 'warn');
				track.clips.splice(i, 1);
				break;
			}

			if (state.selectedClipTrackId === track_id && state.selectedClipId === clip_id) {
				state.selectedClipTrackId = '';
				state.selectedClipId = '';
			}

			emitChange ();
			return true;
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

			if (count) {
				setStatusInternal('Batch action', action + ' applied to ' + count + ' assets.', 'info');
				emitChange ();
			}
			return count;
		};

		this.getRenamePlan = function ( pattern ) {
			var assets = q.getSelectedAssets();
			var plan = [];
			for (var i = 0; i < assets.length; ++i) {
				plan.push({
					id: assets[i].id,
					name: assets[i].name,
					path: assets[i].path,
					nextName: buildFileNameFromTags(assets[i], pattern)
				});
			}
			return plan;
		};

		this.getToolbarActions = function () {
			return state.customToolbar.slice();
		};

		this.setToolbarActions = function ( actions ) {
			if (!(actions instanceof Array) || !actions.length) return false;
			state.customToolbar = actions.filter(function (action_id, index, arr) {
				return !!action_id && arr.indexOf(action_id) === index;
			});
			setStatusInternal('Toolbar updated', state.customToolbar.length + ' custom actions pinned.', 'info');
			emitChange ();
			return true;
		};

		this.setStatus = function ( message, detail, level ) {
			setStatusInternal(message, detail, level);
			emitChange ();
		};

		this.syncViewState = emitChange;

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
