(function ( w, d, PKAE ) {
	'use strict';

	function escapeHTML ( value ) {
		return (value == null ? '' : String(value))
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function formatDb ( value ) {
		value = value / 1 || 0;
		return (value > 0 ? '+' : '') + value.toFixed(1) + ' dB';
	}

	function formatPan ( value ) {
		value = value / 1 || 0;
		if (value === 0) return 'C';
		return (value < 0 ? 'L' : 'R') + Math.abs(value).toFixed(0);
	}

	function formatShortTime ( value ) {
		value = value / 1 || 0;
		if (value < 60) return value.toFixed(2) + 's';
		var mins = Math.floor(value / 60);
		var secs = value - (mins * 60);
		return mins + 'm ' + secs.toFixed(1) + 's';
	}

	function buildTimelineTicks ( duration ) {
		var html = '';
		duration = Math.max(1, duration || 1);
		for (var second = 0; second <= Math.ceil(duration); ++second) {
			html += '<span style="left:' + ((second / duration) * 100).toFixed(4) + '%">' + second + 's</span>';
		}
		return html;
	}

	function PKMultitrackUI ( app ) {
		if (!app.multitrack || !app.ui || !app.ui.audioContainer) return ;

		var q = this;
		var multitrack = app.multitrack;
		var isDesktopApp = !!(w.process && w.process.versions && w.process.versions.electron);
		var ipcRenderer = null;
		var pathModule = null;
		var contextMenu = null;
		var dragState = null;
		var isMixPlaying = false;

		try {
			if (isDesktopApp) {
				ipcRenderer = require('electron').ipcRenderer;
				pathModule = require('path');
			}
		} catch (err) {}

		var toolbarCatalog = {
			'play-mix': { label: 'Play', icon: 'icon-play3', hint: 'Play the non-destructive mix preview' },
			'stop-mix': { label: 'Stop', icon: 'icon-stop2', hint: 'Stop the current mix preview' },
			'render-mix': { label: 'Render', icon: 'icon-hammer', hint: 'Render the multitrack mix into the editor' },
			'add-track': { label: 'Track', icon: 'icon-file-text2', hint: 'Add a new arrange track' },
			'add-current-file': { label: 'Editor', icon: 'icon-files-empty', hint: 'Send the current editor file into the selected track' },
			'new-vinyl': { label: 'Vinyl', icon: 'icon-rec', hint: 'Create a vinyl transfer entry in the library' },
			'toggle-mixer': { label: 'Mixer', icon: 'icon-loop', hint: 'Show or hide the mixer dock' },
			'toggle-library': { label: 'Library', icon: 'icon-zoom-in', hint: 'Show or hide the library dock' },
			'open-mixer-window': { label: 'Float Mix', icon: 'icon-forward3', hint: 'Open the mixer in a floating window' },
			'open-library-window': { label: 'Float Lib', icon: 'icon-next2', hint: 'Open the library in a floating window' }
		};
		var dockTitles = {
			left: 'Left Dock',
			right: 'Right Dock',
			bottom: 'Bottom Dock'
		};
		var panelTitles = {
			browser: 'Browser',
			inspector: 'Inspector',
			mixer: 'Mixer',
			library: 'Library',
			actions: 'Custom Actions'
		};

		function getAttr ( target, key ) {
			if (!target) return null;
			if (target.getAttribute) return target.getAttribute ( key );
			return target[ key ] != null ? target[ key ] : null;
		}

		function getToolbarActionList () {
			var state = multitrack.getState();
			return state.customToolbar || [];
		}

		function getDockPanelTitle ( panel_id ) {
			return panelTitles[panel_id] || panel_id || 'Panel';
		}

		function getSelectedTrack () {
			var state = multitrack.getState();
			return multitrack.getTrack(state.selectedTrackId);
		}

		function getEditorDuration () {
			if (!app.engine || !app.engine.wavesurfer || !app.engine.wavesurfer.getDuration) return 0;
			return app.engine.wavesurfer.getDuration() || 0;
		}

		function confirmTrackRemoval ( track_id ) {
			var track = multitrack.getTrack(track_id);
			if (!track) return false;
			if (multitrack.getState().tracks.length <= 1) {
				alert('At least one track must remain in the workspace.');
				return false;
			}
			return confirm('Remove track "' + track.name + '"?');
		}

		function createShell () {
			var el = d.createElement ('section');
			el.className = 'pk_mtw pk_reaper_shell';
			el.innerHTML =
				'<div class="pk_mtw_topbar">' +
					'<div class="pk_mtw_brand">' +
						'<strong>RECwerk Workspace</strong>' +
						'<span>Compact arrange view with docks, context menus and custom actions.</span>' +
					'</div>' +
					'<div class="pk_mtw_transportinfo"></div>' +
					'<div class="pk_mtw_topactions">' +
						'<button type="button" class="pk_mtw_btn" data-mt-action="toggle-workspace">Show Workspace</button>' +
						'<button type="button" class="pk_mtw_btn" data-mt-action="customize-toolbar">Customize Toolbar</button>' +
					'</div>' +
				'</div>' +
				'<div class="pk_mtw_macrobar"></div>' +
				'<div class="pk_mtw_shellgrid">' +
					'<aside class="pk_mtw_dock pk_mtw_dock_left"></aside>' +
					'<section class="pk_mtw_center">' +
						'<div class="pk_mtw_arrange">' +
							'<div class="pk_mtw_panelhd pk_mtw_arrangehd">' +
								'<div>' +
									'<strong>Arrange</strong>' +
									'<span>Track lanes, clip moves and REAPER-style right-click actions.</span>' +
								'</div>' +
								'<div class="pk_mtw_panelactions">' +
									'<button type="button" class="pk_mtw_chip" data-mt-action="add-track">Add Track</button>' +
									'<button type="button" class="pk_mtw_chip" data-mt-action="add-current-file">Send Editor File</button>' +
									'<button type="button" class="pk_mtw_chip" data-mt-action="render-mix">Render To Editor</button>' +
									'<button type="button" class="pk_mtw_chip" data-mt-action="new-vinyl">New Vinyl Entry</button>' +
								'</div>' +
							'</div>' +
							'<div class="pk_mtw_tracks"></div>' +
						'</div>' +
					'</section>' +
					'<aside class="pk_mtw_dock pk_mtw_dock_right"></aside>' +
					'<section class="pk_mtw_dock pk_mtw_dock_bottom"></section>' +
				'</div>' +
				'<div class="pk_mtw_statusbar"></div>';
			app.ui.audioContainer.appendChild ( el );
			return el;
		}

		var shell = createShell();
		var track_list = shell.querySelector('.pk_mtw_tracks');
		var macrobar = shell.querySelector('.pk_mtw_macrobar');
		var transportinfo = shell.querySelector('.pk_mtw_transportinfo');
		var statusbar = shell.querySelector('.pk_mtw_statusbar');
		var leftDock = shell.querySelector('.pk_mtw_dock_left');
		var rightDock = shell.querySelector('.pk_mtw_dock_right');
		var bottomDock = shell.querySelector('.pk_mtw_dock_bottom');
		var play_mix_btn = null;
		var stop_mix_btn = null;

		function renderToolbar () {
			var items = getToolbarActionList();
			var html = '<div class="pk_mtw_macrostrip">';

			for (var i = 0; i < items.length; ++i) {
				var cfg = toolbarCatalog[items[i]];
				if (!cfg) continue;
				html += '<button type="button" class="pk_mtw_tool ' + cfg.icon + '" title="' + escapeHTML(cfg.hint) + '" data-mt-action="' + items[i] + '">' +
					'<span>' + escapeHTML(cfg.label) + '</span>' +
				'</button>';
			}

			html += '<button type="button" class="pk_mtw_tool pk_mtw_tool_cfg icon-hammer" title="Customize custom actions toolbar" data-mt-action="customize-toolbar"><span>Edit</span></button>';
			html += '</div>';
			macrobar.innerHTML = html;
		}

		function renderTransportInfo ( state ) {
			var track = getSelectedTrack();
			var asset = multitrack.getSelectedAsset();
			var duration = multitrack.getTimelineDuration();
			transportinfo.innerHTML =
				'<div class="pk_mtw_infoblock"><label>Mix</label><strong>' + (isMixPlaying ? 'Running' : 'Stopped') + '</strong></div>' +
				'<div class="pk_mtw_infoblock"><label>Timeline</label><strong>' + escapeHTML(formatShortTime(duration)) + '</strong></div>' +
				'<div class="pk_mtw_infoblock"><label>Tracks</label><strong>' + state.tracks.length + '</strong></div>' +
				'<div class="pk_mtw_infoblock"><label>Assets</label><strong>' + state.assets.length + '</strong></div>' +
				'<div class="pk_mtw_infoblock"><label>Focus</label><strong>' + escapeHTML(track ? track.name : 'None') + '</strong></div>' +
				'<div class="pk_mtw_infoblock"><label>Export</label><strong>' + escapeHTML(asset ? asset.name : 'Not set') + '</strong></div>';
		}

		function renderStatusBar ( state ) {
			var status = state.status || { message: 'Ready', detail: '', level: 'info' };
			var selectedClip = multitrack.getSelectedClip();
			var editorDuration = getEditorDuration();
			statusbar.className = 'pk_mtw_statusbar pk_status_' + (status.level || 'info');
			statusbar.innerHTML =
				'<div class="pk_mtw_statusmain">' +
					'<strong>' + escapeHTML(status.message || 'Ready') + '</strong>' +
					'<span>' + escapeHTML(status.detail || 'Everything is right-click away.') + '</span>' +
				'</div>' +
				'<div class="pk_mtw_statusmeta">' +
					'<span>Editor ' + escapeHTML(formatShortTime(editorDuration)) + '</span>' +
					'<span>' + escapeHTML(selectedClip ? ('Clip ' + selectedClip.name) : 'No clip focus') + '</span>' +
					'<span>Screen ' + w.innerWidth + 'x' + w.innerHeight + '</span>' +
				'</div>';
		}

		function renderTracks ( state ) {
			var html = '';
			var timelineDuration = multitrack.getTimelineDuration();

			for (var i = 0; i < state.tracks.length; ++i) {
				var track = state.tracks[i];
				var selected = track.id === state.selectedTrackId;
				var audible = multitrack.isTrackAudible ( track );
				var clips = '';

				for (var j = 0; j < track.clips.length; ++j) {
					var clip = track.clips[j];
					var clipLeft = Math.max(0, ((clip.start || 0) / timelineDuration) * 100);
					var clipWidth = Math.max(8, (((clip.duration || 0.5) / timelineDuration) * 100));
					var isClipSelected = state.selectedClipId === clip.id && state.selectedClipTrackId === track.id;
					clips += '<button type="button" class="pk_mtt_clip' + (isClipSelected ? ' pk_sel' : '') + '" data-mt-action="edit-clip" data-track-id="' + track.id + '" data-clip-id="' + clip.id + '" style="left:' + clipLeft.toFixed(4) + '%; width:' + clipWidth.toFixed(4) + '%; border-color:' + track.color + '; box-shadow: inset 0 0 0 1px ' + track.color + ';">' +
						'<span class="pk_mtt_grab" data-mt-action="drag-clip" data-track-id="' + track.id + '" data-clip-id="' + clip.id + '">::</span>' +
						'<strong>' + escapeHTML(clip.name) + '</strong>' +
						'<span>Start ' + ((clip.start || 0).toFixed(2)) + 's / Dur ' + (clip.duration ? clip.duration.toFixed(2) + 's' : 'clip') + '</span>' +
					'</button>';
				}

				if (!clips) {
					clips = '<div class="pk_mtt_empty">Drop assets here, use the browser/library, or send the current editor file into this lane.</div>';
				}

				html += '<div class="pk_mtt_row' + (selected ? ' pk_sel' : '') + '" data-track-row="' + track.id + '">' +
					'<div class="pk_mtt_meta">' +
						'<button type="button" class="pk_mtt_trackbtn" data-mt-action="select-track" data-track-id="' + track.id + '">' +
							'<span class="pk_mtt_color" style="background:' + track.color + ';"></span>' +
							'<span class="pk_mtt_name">' + escapeHTML(track.name) + '</span>' +
							'<span class="pk_mtt_state">' + (audible ? 'Live' : 'Muted') + '</span>' +
						'</button>' +
						'<div class="pk_mtt_metaaux">' +
							'<span>' + formatDb(track.gain) + '</span>' +
							'<span>' + formatPan(track.pan) + '</span>' +
						'</div>' +
						'<div class="pk_mtt_switches">' +
							'<button type="button" class="pk_mtw_flag' + (track.mute ? ' pk_act' : '') + '" data-mt-action="toggle-track-flag" data-track-id="' + track.id + '" data-flag="mute">M</button>' +
							'<button type="button" class="pk_mtw_flag' + (track.solo ? ' pk_act' : '') + '" data-mt-action="toggle-track-flag" data-track-id="' + track.id + '" data-flag="solo">S</button>' +
							'<button type="button" class="pk_mtw_flag' + (track.arm ? ' pk_act' : '') + '" data-mt-action="toggle-track-flag" data-track-id="' + track.id + '" data-flag="arm">R</button>' +
						'</div>' +
					'</div>' +
					'<div class="pk_mtt_lane">' +
						'<div class="pk_mtt_ruler">' + buildTimelineTicks(timelineDuration) + '</div>' +
						'<div class="pk_mtt_laneinner" data-track-id="' + track.id + '" data-timeline-duration="' + timelineDuration + '">' + clips + '</div>' +
					'</div>' +
				'</div>';
			}

			track_list.innerHTML = html;
		}

		function renderMixerHTML ( state ) {
			var html = '<div class="pk_mtm_strip pk_mtm_master">' +
				'<div class="pk_mtm_title">MASTER</div>' +
				'<div class="pk_mtm_meter"><span style="height:' + Math.max(8, 50 + state.master.gain * 2) + '%;"></span></div>' +
				'<div class="pk_mtm_value">' + formatDb(state.master.gain) + '</div>' +
				'<input class="pk_mtm_fader" data-mt-master="gain" type="range" min="-24" max="12" step="0.5" value="' + state.master.gain + '">' +
				'<div class="pk_mtm_switches">' +
					'<button type="button" class="pk_mtw_flag' + (state.master.mute ? ' pk_act' : '') + '" data-mt-action="toggle-master-flag" data-flag="mute">M</button>' +
					'<button type="button" class="pk_mtw_flag' + (state.master.solo ? ' pk_act' : '') + '" data-mt-action="toggle-master-flag" data-flag="solo">S</button>' +
				'</div>' +
			'</div>';

			for (var i = 0; i < state.tracks.length; ++i) {
				var track = state.tracks[i];
				html += '<div class="pk_mtm_strip' + (track.id === state.selectedTrackId ? ' pk_sel' : '') + '" data-track-row="' + track.id + '">' +
					'<div class="pk_mtm_title">' + escapeHTML(track.name) + '</div>' +
					'<div class="pk_mtm_meter"><span style="height:' + Math.max(8, 40 + track.gain * 2) + '%; background:' + track.color + ';"></span></div>' +
					'<div class="pk_mtm_value">' + formatDb(track.gain) + '</div>' +
					'<input class="pk_mtm_fader" data-mt-track-id="' + track.id + '" data-mt-prop="gain" type="range" min="-24" max="12" step="0.5" value="' + track.gain + '">' +
					'<div class="pk_mtm_value">' + formatPan(track.pan) + '</div>' +
					'<input class="pk_mtm_pan" data-mt-track-id="' + track.id + '" data-mt-prop="pan" type="range" min="-100" max="100" step="1" value="' + track.pan + '">' +
					'<div class="pk_mtm_switches">' +
						'<button type="button" class="pk_mtw_flag' + (track.mute ? ' pk_act' : '') + '" data-mt-action="toggle-track-flag" data-track-id="' + track.id + '" data-flag="mute">M</button>' +
						'<button type="button" class="pk_mtw_flag' + (track.solo ? ' pk_act' : '') + '" data-mt-action="toggle-track-flag" data-track-id="' + track.id + '" data-flag="solo">S</button>' +
						'<button type="button" class="pk_mtw_flag' + (track.arm ? ' pk_act' : '') + '" data-mt-action="toggle-track-flag" data-track-id="' + track.id + '" data-flag="arm">R</button>' +
					'</div>' +
					'<div class="pk_mtm_fx">' +
						'<span>' + escapeHTML(track.effects[0]) + '</span>' +
						'<span>' + escapeHTML(track.effects[1]) + '</span>' +
					'</div>' +
				'</div>';
			}

			return html;
		}

		function renderAssetsHTML ( state ) {
			if (!state.assets.length) {
				return '<div class="pk_mtw_assetempty">Imported files, recorded takes and vinyl entries will appear here. Tag them, batch-edit them and route them into tracks.</div>';
			}

			var html = '';
			for (var i = 0; i < state.assets.length; ++i) {
				var asset = state.assets[i];
				var isSelected = state.selectedAssetIds && state.selectedAssetIds.indexOf(asset.id) > -1;
				html += '<article class="pk_mtw_asset' + (asset.id === state.selectedAssetId ? ' pk_sel' : '') + '" data-asset-card="' + asset.id + '">' +
					'<div class="pk_mtw_assethead">' +
						'<div>' +
							'<label class="pk_mtw_assetpick"><input type="checkbox" data-mt-action="toggle-asset-selection" data-asset-id="' + asset.id + '"' + (isSelected ? ' checked' : '') + '> Pick</label>' +
							'<strong>' + escapeHTML(asset.name) + '</strong>' +
							'<span>' + escapeHTML(asset.type) + ' / ' + escapeHTML(asset.source) + '</span>' +
						'</div>' +
						'<div class="pk_mtw_panelactions">' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="select-asset" data-asset-id="' + asset.id + '">' + (asset.id === state.selectedAssetId ? 'Export Source' : 'Use For Export') + '</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="send-asset-to-track" data-asset-id="' + asset.id + '">Send To Track</button>' +
							(isDesktopApp && asset.path && window.PKMetadataWriter && window.PKMetadataWriter.guessFormat(asset.path) ? '<button type="button" class="pk_mtw_chip" data-mt-action="write-asset-tags" data-asset-id="' + asset.id + '">Write Tags To File</button>' : '') +
						'</div>' +
					'</div>' +
					'<div class="pk_mtw_assetpath">' + escapeHTML(asset.path || 'No linked file path yet') + '</div>' +
					(asset.lastAction ? '<div class="pk_mtw_assetstatus">' + escapeHTML(asset.lastAction) + '</div>' : '') +
					'<div class="pk_mtw_taggrid">' +
						'<label>Title<input type="text" data-mt-asset-id="' + asset.id + '" data-mt-tag="title" value="' + escapeHTML(asset.tags.title) + '"></label>' +
						'<label>Artist<input type="text" data-mt-asset-id="' + asset.id + '" data-mt-tag="artist" value="' + escapeHTML(asset.tags.artist) + '"></label>' +
						'<label>Album<input type="text" data-mt-asset-id="' + asset.id + '" data-mt-tag="album" value="' + escapeHTML(asset.tags.album) + '"></label>' +
						'<label>Track<input type="text" data-mt-asset-id="' + asset.id + '" data-mt-tag="track" value="' + escapeHTML(asset.tags.track) + '"></label>' +
						'<label>Year<input type="text" data-mt-asset-id="' + asset.id + '" data-mt-tag="year" value="' + escapeHTML(asset.tags.year) + '"></label>' +
						'<label>Genre<input type="text" data-mt-asset-id="' + asset.id + '" data-mt-tag="genre" value="' + escapeHTML(asset.tags.genre) + '"></label>' +
						'<label class="pk_mtw_comment">Comment<textarea data-mt-asset-id="' + asset.id + '" data-mt-tag="comment">' + escapeHTML(asset.tags.comment) + '</textarea></label>' +
					'</div>' +
				'</article>';
			}

			return html;
		}

		function renderBrowserHTML ( state ) {
			if (!state.assets.length) {
				return '<div class="pk_mtw_assetempty">Browser is empty. Open audio or a .recwerk project to populate it.</div>';
			}

			var html = '<div class="pk_mt_browserlist">';
			for (var i = 0; i < state.assets.length; ++i) {
				var asset = state.assets[i];
				html += '<div class="pk_mt_browserrow' + (asset.id === state.selectedAssetId ? ' pk_sel' : '') + '" data-asset-card="' + asset.id + '">' +
					'<button type="button" class="pk_mt_browserpick" data-mt-action="select-asset" data-asset-id="' + asset.id + '">' +
						'<strong>' + escapeHTML(asset.name) + '</strong>' +
						'<span>' + escapeHTML(asset.type) + ' / ' + escapeHTML(formatShortTime(asset.duration || 0)) + '</span>' +
					'</button>' +
					'<div class="pk_mt_browseractions">' +
						'<button type="button" class="pk_mtw_chip" data-mt-action="send-asset-to-track" data-asset-id="' + asset.id + '">Route</button>' +
						'<button type="button" class="pk_mtw_chip" data-mt-action="toggle-asset-selection" data-asset-id="' + asset.id + '">Pick</button>' +
					'</div>' +
				'</div>';
			}
			html += '</div>';
			return html;
		}

		function renderInspectorHTML ( state ) {
			var track = getSelectedTrack();
			var clip = multitrack.getSelectedClip();
			var asset = multitrack.getSelectedAsset();
			var html = '<div class="pk_mt_inspector">';

			if (track) {
				html += '<section class="pk_mt_inspectorblock">' +
					'<h4>Track</h4>' +
					'<strong>' + escapeHTML(track.name) + '</strong>' +
					'<label>Gain<input type="range" min="-24" max="12" step="0.5" data-mt-track-id="' + track.id + '" data-mt-prop="gain" value="' + track.gain + '"></label>' +
					'<div class="pk_mt_inspectorvals"><span>' + formatDb(track.gain) + '</span><span>' + formatPan(track.pan) + '</span></div>' +
					'<label>Pan<input type="range" min="-100" max="100" step="1" data-mt-track-id="' + track.id + '" data-mt-prop="pan" value="' + track.pan + '"></label>' +
					'<div class="pk_mtw_panelactions">' +
						'<button type="button" class="pk_mtw_chip" data-mt-action="insert-track-above" data-track-id="' + track.id + '">Insert Above</button>' +
						'<button type="button" class="pk_mtw_chip" data-mt-action="insert-track-below" data-track-id="' + track.id + '">Insert Below</button>' +
						'<button type="button" class="pk_mtw_chip" data-mt-action="duplicate-track" data-track-id="' + track.id + '">Duplicate Track</button>' +
						'<button type="button" class="pk_mtw_chip" data-mt-action="rename-track" data-track-id="' + track.id + '">Rename Track</button>' +
						'<button type="button" class="pk_mtw_chip" data-mt-action="remove-track" data-track-id="' + track.id + '">Remove Track</button>' +
					'</div>' +
				'</section>';
			}

			if (clip) {
				html += '<section class="pk_mt_inspectorblock">' +
					'<h4>Clip</h4>' +
					'<strong>' + escapeHTML(clip.name) + '</strong>' +
					'<div class="pk_mt_inspectorvals"><span>Start ' + (clip.start || 0).toFixed(2) + 's</span><span>Dur ' + (clip.duration || 0).toFixed(2) + 's</span></div>' +
					'<div class="pk_mtw_panelactions">' +
						'<button type="button" class="pk_mtw_chip" data-mt-action="edit-clip" data-track-id="' + state.selectedClipTrackId + '" data-clip-id="' + clip.id + '">Edit Clip</button>' +
						'<button type="button" class="pk_mtw_chip" data-mt-action="remove-clip" data-track-id="' + state.selectedClipTrackId + '" data-clip-id="' + clip.id + '">Remove Clip</button>' +
					'</div>' +
				'</section>';
			}

			if (asset) {
				html += '<section class="pk_mt_inspectorblock">' +
					'<h4>Export Source</h4>' +
					'<strong>' + escapeHTML(asset.name) + '</strong>' +
					'<div class="pk_mt_inspectorvals"><span>' + escapeHTML(asset.tags.artist || 'No artist') + '</span><span>' + escapeHTML(asset.tags.album || 'No album') + '</span></div>' +
					'<div class="pk_mtw_panelactions">' +
						'<button type="button" class="pk_mtw_chip" data-mt-action="send-asset-to-track" data-asset-id="' + asset.id + '">Route To Track</button>' +
						'<button type="button" class="pk_mtw_chip" data-mt-action="select-asset" data-asset-id="' + asset.id + '">Keep As Export</button>' +
					'</div>' +
				'</section>';
			}

			if (!track && !clip && !asset) {
				html += '<div class="pk_mtw_assetempty">Select a track, clip or asset to inspect routing, levels and export metadata.</div>';
			}

			html += '</div>';
			return html;
		}

		function renderActionsHTML () {
			var keys = Object.keys(toolbarCatalog);
			var html = '<div class="pk_mt_actiongrid">';
			for (var i = 0; i < keys.length; ++i) {
				var cfg = toolbarCatalog[keys[i]];
				html += '<button type="button" class="pk_mt_actioncard" data-mt-action="' + keys[i] + '">' +
					'<i class="' + cfg.icon + '"></i>' +
					'<strong>' + escapeHTML(cfg.label) + '</strong>' +
					'<span>' + escapeHTML(cfg.hint) + '</span>' +
				'</button>';
			}
			html += '</div>';
			return html;
		}

		function renderPanelHTML ( panel_id, state ) {
			if (panel_id === 'browser') return renderBrowserHTML(state);
			if (panel_id === 'inspector') return renderInspectorHTML(state);
			if (panel_id === 'mixer') return '<div class="pk_mtm_strips">' + renderMixerHTML(state) + '</div>';
			if (panel_id === 'library') return '<div class="pk_mtw_batchbar">' +
					'<button type="button" class="pk_mtw_chip" data-mt-action="select-all-assets">Select All</button>' +
					'<button type="button" class="pk_mtw_chip" data-mt-action="clear-asset-selection">Clear</button>' +
					'<button type="button" class="pk_mtw_chip" data-mt-action="batch-filename-tags">Filename -> Tags</button>' +
					'<button type="button" class="pk_mtw_chip" data-mt-action="batch-tags-name">Tags -> Name</button>' +
					'<button type="button" class="pk_mtw_chip" data-mt-action="batch-trim-tags">Trim Tags</button>' +
					'<button type="button" class="pk_mtw_chip" data-mt-action="batch-titlecase-tags">Title Case</button>' +
					'<button type="button" class="pk_mtw_chip" data-mt-action="bulk-edit-tags">Bulk Edit</button>' +
					'<button type="button" class="pk_mtw_chip" data-mt-action="replace-text-tags">Replace Text</button>' +
					(isDesktopApp ? '<button type="button" class="pk_mtw_chip" data-mt-action="batch-rename-files">Rename Files</button>' : '') +
				'</div><div class="pk_mtw_assets">' + renderAssetsHTML(state) + '</div>';
			if (panel_id === 'actions') return renderActionsHTML();
			return '<div class="pk_mtw_assetempty">Unknown panel.</div>';
		}

		function renderDock ( dock_id, target, state ) {
			var dock = state.docks[dock_id];
			if (!dock) return;

			var active = dock.active;
			var html = '<div class="pk_mtw_dockframe' + (dock.collapsed ? ' pk_collapsed' : '') + '" data-dock-frame="' + dock_id + '">' +
				'<div class="pk_mtw_dockbar" data-mt-dock-id="' + dock_id + '">' +
					'<div class="pk_mtw_docktabs">';

			for (var i = 0; i < dock.tabs.length; ++i) {
				html += '<button type="button" class="pk_mtw_tab' + (dock.tabs[i] === active ? ' pk_act' : '') + '" data-mt-action="activate-dock-tab" data-dock-id="' + dock_id + '" data-panel-id="' + dock.tabs[i] + '">' + escapeHTML(getDockPanelTitle(dock.tabs[i])) + '</button>';
			}

			html += '</div>' +
					'<div class="pk_mtw_panelactions">';

			if (active) {
				html += '<button type="button" class="pk_mtw_chip" data-mt-action="move-panel-dock" data-panel-id="' + active + '" data-dock-target="left">L</button>' +
					'<button type="button" class="pk_mtw_chip" data-mt-action="move-panel-dock" data-panel-id="' + active + '" data-dock-target="right">R</button>' +
					'<button type="button" class="pk_mtw_chip" data-mt-action="move-panel-dock" data-panel-id="' + active + '" data-dock-target="bottom">B</button>';
				if (active === 'mixer' || active === 'library') {
					html += '<button type="button" class="pk_mtw_chip" data-mt-action="float-panel" data-panel-id="' + active + '">Float</button>';
				}
				html += '<button type="button" class="pk_mtw_chip" data-mt-action="close-dock-panel" data-panel-id="' + active + '">Hide</button>';
			}

			html += '<button type="button" class="pk_mtw_chip" data-mt-action="toggle-dock-collapse" data-dock-id="' + dock_id + '">' + (dock.collapsed ? 'Open' : 'Collapse') + '</button>' +
				'</div>' +
			'</div>' +
			'<div class="pk_mtw_dockbody">' +
				(active ? renderPanelHTML(active, state) : '<div class="pk_mtw_assetempty">Empty dock. Use the toolbar or context menu to place a panel here.</div>') +
			'</div>' +
			'</div>';

			target.innerHTML = html;
		}

		function showBulkEditModal () {
			var assets = multitrack.getSelectedAssets();
			if (!assets.length) {
				alert('Select assets first.');
				return ;
			}

			var rows = '';
			for (var i = 0; i < assets.length; ++i) {
				rows += '<tr>' +
					'<td>' + escapeHTML(assets[i].name) + '</td>' +
					'<td><input class="pk_mtw_bulkinput" data-asset-id="' + assets[i].id + '" data-bulk-tag="title" value="' + escapeHTML(assets[i].tags.title) + '"></td>' +
					'<td><input class="pk_mtw_bulkinput" data-asset-id="' + assets[i].id + '" data-bulk-tag="artist" value="' + escapeHTML(assets[i].tags.artist) + '"></td>' +
					'<td><input class="pk_mtw_bulkinput" data-asset-id="' + assets[i].id + '" data-bulk-tag="album" value="' + escapeHTML(assets[i].tags.album) + '"></td>' +
					'<td><input class="pk_mtw_bulkinput" data-asset-id="' + assets[i].id + '" data-bulk-tag="track" value="' + escapeHTML(assets[i].tags.track) + '"></td>' +
					'<td><input class="pk_mtw_bulkinput" data-asset-id="' + assets[i].id + '" data-bulk-tag="year" value="' + escapeHTML(assets[i].tags.year) + '"></td>' +
					'<td><input class="pk_mtw_bulkinput" data-asset-id="' + assets[i].id + '" data-bulk-tag="genre" value="' + escapeHTML(assets[i].tags.genre) + '"></td>' +
				'</tr>';
			}

			new PKSimpleModal({
				title: 'Bulk Tag Editor',
				clss: 'pk_fnt10',
				body:
					'<div class="pk_mtw_bulkwrap">' +
						'<table class="pk_mtw_bulktable">' +
							'<thead><tr><th>File</th><th>Title</th><th>Artist</th><th>Album</th><th>Track</th><th>Year</th><th>Genre</th></tr></thead>' +
							'<tbody>' + rows + '</tbody>' +
						'</table>' +
					'</div>',
				buttons: [{
					title: 'SAVE',
					clss: 'pk_modal_a_accpt',
					callback: function (modal) {
						var inputs = modal.el_body.querySelectorAll('[data-asset-id][data-bulk-tag]');
						var map = {};
						for (var i = 0; i < inputs.length; ++i) {
							var assetId = inputs[i].getAttribute('data-asset-id');
							var tag = inputs[i].getAttribute('data-bulk-tag');
							if (!map[assetId]) map[assetId] = { id: assetId, tags: {} };
							map[assetId].tags[tag] = inputs[i].value;
						}
						var patches = [];
						for (var key in map) patches.push(map[key]);
						multitrack.applyBulkTagPatch(patches);
						modal.Destroy();
					}
				}],
				setup: function () {
					app.ui.InteractionHandler.checkAndSet('modal');
				},
				ondestroy: function () {
					app.ui.InteractionHandler.on = false;
				}
			}).Show();
		}

		function showReplaceModal () {
			var findText = prompt('Find text:', '');
			if (findText === null || !findText.length) return ;
			var replaceText = prompt('Replace with:', '');
			if (replaceText === null) return ;
			var count = multitrack.applyReplaceText(findText, replaceText, ['title', 'artist', 'album', 'genre', 'comment']);
			if (count && window.OneUp) OneUp('Replaced text in ' + count + ' assets', 1400);
		}

		function showToolbarModal () {
			var current = getToolbarActionList();
			var keys = Object.keys(toolbarCatalog);
			var rows = '';

			for (var i = 0; i < keys.length; ++i) {
				var cfg = toolbarCatalog[keys[i]];
				rows += '<label class="pk_mtw_toolbarrow">' +
					'<input type="checkbox" data-toolbar-action="' + keys[i] + '"' + (current.indexOf(keys[i]) > -1 ? ' checked' : '') + '>' +
					'<span class="' + cfg.icon + '"></span>' +
					'<strong>' + escapeHTML(cfg.label) + '</strong>' +
					'<em>' + escapeHTML(cfg.hint) + '</em>' +
				'</label>';
			}

			new PKSimpleModal({
				title: 'Customize Toolbar',
				clss: 'pk_fnt10',
				body: '<div class="pk_mtw_toolbarpick">' + rows + '</div>',
				buttons: [{
					title: 'SAVE',
					clss: 'pk_modal_a_accpt',
					callback: function (modal) {
						var inputs = modal.el_body.querySelectorAll('[data-toolbar-action]');
						var picked = [];
						for (var i = 0; i < inputs.length; ++i) {
							if (inputs[i].checked) picked.push(inputs[i].getAttribute('data-toolbar-action'));
						}
						if (!picked.length) {
							alert('Pick at least one toolbar action.');
							return ;
						}
						multitrack.setToolbarActions(picked);
						modal.Destroy();
					}
				}]
			}).Show();
		}

		function stopClipDrag () {
			if (!dragState) return ;
			d.removeEventListener('mousemove', onClipDragMove, false);
			d.removeEventListener('mouseup', stopClipDrag, false);
			d.removeEventListener('mouseleave', stopClipDrag, false);
			dragState = null;
		}

		function onClipDragMove ( e ) {
			if (!dragState) return ;
			var laneRect = dragState.lane.getBoundingClientRect();
			var relativeX = Math.min(Math.max(0, e.clientX - laneRect.left), laneRect.width);
			var nextStart = (relativeX / Math.max(1, laneRect.width)) * dragState.duration;
			nextStart = Math.max(0, Math.round(nextStart / 0.25) * 0.25);
			multitrack.updateClip(dragState.trackId, dragState.clipId, { start: nextStart });
		}

		function startClipDrag ( target ) {
			var lane = target && target.closest ? target.closest('.pk_mtt_laneinner') : null;
			if (!lane) return false;

			dragState = {
				trackId: getAttr(target, 'data-track-id'),
				clipId: getAttr(target, 'data-clip-id'),
				lane: lane,
				duration: parseFloat(getAttr(lane, 'data-timeline-duration')) || multitrack.getTimelineDuration()
			};

			multitrack.setSelectedClip(dragState.trackId, dragState.clipId);
			d.addEventListener('mousemove', onClipDragMove, false);
			d.addEventListener('mouseup', stopClipDrag, false);
			d.addEventListener('mouseleave', stopClipDrag, false);
			return true;
		}

		function handleAction ( action, target, options ) {
			options = options || {};
			var track_id = getAttr(target, 'data-track-id') || options.trackId || '';
			var asset_id = getAttr(target, 'data-asset-id') || options.assetId || '';
			var panel_id = getAttr(target, 'data-panel-id') || options.panelId || '';
			var dock_id = getAttr(target, 'data-dock-id') || options.dockId || '';
			var dock_target = getAttr(target, 'data-dock-target') || options.dockTarget || '';

			if (action === 'toggle-workspace') {
				multitrack.toggleWorkspace ();
				return true;
			}
			if (action === 'customize-toolbar') {
				showToolbarModal();
				return true;
			}
			if (action === 'play-mix') {
				app.fireEvent('RequestMultitrackPlay');
				return true;
			}
			if (action === 'stop-mix') {
				app.fireEvent('RequestMultitrackStop');
				return true;
			}
			if (action === 'render-mix') {
				app.fireEvent('RequestMultitrackRenderToEditor');
				return true;
			}
			if (action === 'toggle-mixer') {
				multitrack.toggleMixer ();
				return true;
			}
			if (action === 'toggle-library') {
				multitrack.toggleLibrary ();
				return true;
			}
			if (action === 'open-mixer-window') {
				app.fireEvent ('RequestShowMultitrackPanel', 'mixer', [1]);
				return true;
			}
			if (action === 'open-library-window') {
				app.fireEvent ('RequestShowMultitrackPanel', 'library', [1]);
				return true;
			}
			if (action === 'select-all-assets') {
				multitrack.selectAllAssets();
				return true;
			}
			if (action === 'clear-asset-selection') {
				multitrack.clearSelectedAssets();
				return true;
			}
			if (action === 'batch-filename-tags') {
				var parsedCount = multitrack.applyBatchTagAction('filename-to-tags');
				if (parsedCount && window.OneUp) OneUp('Parsed filenames for ' + parsedCount + ' assets', 1400);
				return true;
			}
			if (action === 'batch-tags-name') {
				var namePattern = prompt('Filename pattern:', '%artist% - %title%');
				if (namePattern === null) return true;
				var renamedNames = multitrack.applyBatchTagAction('tags-to-name', { pattern: namePattern });
				if (renamedNames && window.OneUp) OneUp('Updated display names for ' + renamedNames + ' assets', 1400);
				return true;
			}
			if (action === 'batch-trim-tags') {
				var trimCount = multitrack.applyBatchTagAction('trim-tags');
				if (trimCount && window.OneUp) OneUp('Trimmed tags on ' + trimCount + ' assets', 1400);
				return true;
			}
			if (action === 'batch-titlecase-tags') {
				var titleCount = multitrack.applyBatchTagAction('title-case-tags');
				if (titleCount && window.OneUp) OneUp('Title-cased tags on ' + titleCount + ' assets', 1400);
				return true;
			}
			if (action === 'bulk-edit-tags') {
				showBulkEditModal();
				return true;
			}
			if (action === 'replace-text-tags') {
				showReplaceModal();
				return true;
			}
			if (action === 'add-track') {
				multitrack.addTrack ();
				return true;
			}
			if (action === 'insert-track-above') {
				multitrack.insertTrackRelative(track_id, 'above');
				return true;
			}
			if (action === 'insert-track-below') {
				multitrack.insertTrackRelative(track_id, 'below');
				return true;
			}
			if (action === 'duplicate-track') {
				multitrack.duplicateTrack(track_id);
				return true;
			}
			if (action === 'select-track') {
				multitrack.setSelectedTrack ( track_id );
				return true;
			}
			if (action === 'rename-track') {
				var track = multitrack.getTrack(track_id);
				if (!track) return true;
				var nextName = prompt('Track name:', track.name);
				if (nextName === null) return true;
				multitrack.renameTrack(track_id, nextName.trim() || track.name);
				return true;
			}
			if (action === 'remove-track') {
				if (!confirmTrackRemoval(track_id)) return true;
				multitrack.removeTrack(track_id);
				return true;
			}
			if (action === 'toggle-track-flag') {
				multitrack.toggleTrackFlag ( track_id, getAttr(target, 'data-flag') || options.flag );
				return true;
			}
			if (action === 'toggle-master-flag') {
				var flag = getAttr(target, 'data-flag') || options.flag;
				var current = multitrack.getState().master[flag];
				multitrack.setMasterValue ( flag, !current );
				return true;
			}
			if (action === 'add-current-file') {
				if (!multitrack.addCurrentFileToSelectedTrack ()) {
					alert ('Open a file in the editor first, then send it into a track.');
				}
				return true;
			}
			if (action === 'send-asset-to-track') {
				multitrack.addAssetToTrack ( asset_id );
				return true;
			}
			if (action === 'toggle-asset-selection') {
				multitrack.toggleAssetSelection(asset_id, !!options.keepSelection);
				return true;
			}
			if (action === 'select-asset') {
				multitrack.setSelectedAsset ( asset_id );
				return true;
			}
			if (action === 'remove-asset') {
				multitrack.removeAsset(asset_id);
				return true;
			}
			if (action === 'activate-dock-tab') {
				multitrack.setDockActiveTab(dock_id, panel_id);
				return true;
			}
			if (action === 'move-panel-dock') {
				multitrack.setDockPanel(panel_id, dock_target);
				return true;
			}
			if (action === 'close-dock-panel') {
				multitrack.removeDockPanel(panel_id);
				return true;
			}
			if (action === 'toggle-dock-collapse') {
				multitrack.toggleDockCollapsed(dock_id);
				return true;
			}
			if (action === 'float-panel') {
				if (panel_id === 'mixer' || panel_id === 'library') {
					multitrack.removeDockPanel(panel_id);
					app.fireEvent('RequestShowMultitrackPanel', panel_id, [1]);
				}
				return true;
			}
			if (action === 'batch-rename-files') {
				if (!ipcRenderer || !pathModule) return true;
				var renamePattern = prompt('Rename pattern:', '%artist% - %title%');
				if (renamePattern === null) return true;
				var renamePlan = multitrack.getRenamePlan(renamePattern);
				if (!renamePlan.length) return true;

				var desktopPlan = renamePlan.filter(function (item) { return !!item.path; });
				if (!desktopPlan.length) {
					alert('Select desktop-backed assets first.');
					return true;
				}

				Promise.all(desktopPlan.map(function (item) {
					var newPath = pathModule.join(pathModule.dirname(item.path), item.nextName);
					return ipcRenderer.invoke('rename-file', item.path, newPath).then(function () {
						multitrack.updateAsset(item.id, {
							name: item.nextName,
							path: newPath,
							lastAction: 'Renamed from tags'
						});
						return true;
					});
				})).then(function () {
					if (window.OneUp) OneUp('Renamed ' + desktopPlan.length + ' files from tags', 1600);
				}).catch(function (err) {
					console.error(err);
					alert('Could not rename one or more files from tags.');
				});
				return true;
			}
			if (action === 'write-asset-tags') {
				var asset = multitrack.getAsset(asset_id);
				if (!asset || !asset.path || !ipcRenderer || !window.PKMetadataWriter) return true;

				ipcRenderer.invoke('read-file', asset.path).then(function (data) {
					var bytes = window.PKMetadataWriter.applyMetadataToBytes(data, asset.path, asset.tags);
					return ipcRenderer.invoke('write-file', asset.path, bytes);
				}).then(function () {
					multitrack.updateAsset(asset.id, {
						lastAction: 'Tags written to file'
					});
					if (window.OneUp) OneUp('Wrote tags to ' + asset.name, 1400);
				}).catch(function (err) {
					console.error(err);
					alert('Could not write tags to file: ' + asset.path);
				});
				return true;
			}
			if (action === 'new-vinyl') {
				var name = prompt ('Name this vinyl entry:', 'RECwerk Vinyl Transfer');
				if (name !== null) multitrack.createVinylEntry ( name );
				return true;
			}
			if (action === 'edit-clip') {
				var clip_id = getAttr(target, 'data-clip-id') || options.clipId;
				var clip = multitrack.getClip(track_id, clip_id);
				if (!clip) return true;
				multitrack.setSelectedClip(track_id, clip_id);

				var startValue = prompt('Clip start in seconds:', clip.start || 0);
				if (startValue === null) return true;
				var durationValue = prompt('Clip duration in seconds:', clip.duration || 0);
				if (durationValue === null) return true;
				var parsedStart = parseFloat(startValue);
				var parsedDuration = parseFloat(durationValue);
				if (!isNaN(parsedStart) && !isNaN(parsedDuration) && parsedStart >= 0 && parsedDuration >= 0) {
					multitrack.updateClip(track_id, clip_id, {
						start: parsedStart,
						duration: parsedDuration
					});
				}
				return true;
			}
			if (action === 'remove-clip') {
				multitrack.removeClip(track_id, getAttr(target, 'data-clip-id') || options.clipId);
				return true;
			}

			return false;
		}

		function handleInput ( target ) {
			var track_id = getAttr(target, 'data-mt-track-id');
			var prop = getAttr(target, 'data-mt-prop');
			var master_key = getAttr(target, 'data-mt-master');

			if (track_id && prop) {
				multitrack.setTrackValue ( track_id, prop, target.value / 1 );
				return true;
			}

			if (master_key) {
				multitrack.setMasterValue ( master_key, target.value / 1 );
				return true;
			}

			return false;
		}

		function handleTagChange ( target ) {
			if (getAttr(target, 'data-mt-action') === 'toggle-asset-selection') return true;
			var asset_id = getAttr(target, 'data-mt-asset-id');
			var tag = getAttr(target, 'data-mt-tag');
			if (!asset_id || !tag) return false;
			multitrack.updateAssetTag ( asset_id, tag, target.value );
			return true;
		}

		function buildContextOptions ( e ) {
			var target = e.target;
			if (!target || (target.closest && target.closest('input, textarea, select'))) return [];
			var clipButton = target.closest ? target.closest('.pk_mtt_clip') : null;
			var trackButton = target.closest ? target.closest('[data-track-row], .pk_mtt_trackbtn, .pk_mtm_strip') : null;
			var assetCard = target.closest ? target.closest('[data-asset-card]') : null;
			var dockFrame = target.closest ? target.closest('[data-dock-frame]') : null;
			var onToolbar = target.closest ? target.closest('.pk_mtw_macrobar') : null;
			var items = [];

			if (clipButton) {
				var clipTrackId = clipButton.getAttribute('data-track-id');
				var clipId = clipButton.getAttribute('data-clip-id');
				items.push({
					name: 'Edit Clip',
					callback: function () {
						handleAction('edit-clip', clipButton, { trackId: clipTrackId, clipId: clipId });
					}
				});
				items.push({
					name: 'Remove Clip',
					callback: function () {
						handleAction('remove-clip', clipButton, { trackId: clipTrackId, clipId: clipId });
					}
				});
				items.push({
					name: 'Focus Track',
					callback: function () {
						multitrack.setSelectedTrack(clipTrackId);
						multitrack.setSelectedClip(clipTrackId, clipId);
					}
				});
				return items;
			}

			if (trackButton && getAttr(trackButton, 'data-track-row') || getAttr(trackButton, 'data-track-id')) {
				var trackId = getAttr(trackButton, 'data-track-row') || getAttr(trackButton, 'data-track-id');
				items.push({
					name: 'Select Track',
					callback: function () {
						multitrack.setSelectedTrack(trackId);
					}
				});
				items.push({
					name: 'Rename Track',
					callback: function () {
						handleAction('rename-track', trackButton, { trackId: trackId });
					}
				});
				items.push({
					name: 'Insert Track Above',
					callback: function () {
						handleAction('insert-track-above', trackButton, { trackId: trackId });
					}
				});
				items.push({
					name: 'Insert Track Below',
					callback: function () {
						handleAction('insert-track-below', trackButton, { trackId: trackId });
					}
				});
				items.push({
					name: 'Duplicate Track',
					callback: function () {
						handleAction('duplicate-track', trackButton, { trackId: trackId });
					}
				});
				items.push({
					name: 'Mute / Unmute',
					callback: function () {
						handleAction('toggle-track-flag', trackButton, { trackId: trackId, flag: 'mute' });
					}
				});
				items.push({
					name: 'Solo / Unsolo',
					callback: function () {
						handleAction('toggle-track-flag', trackButton, { trackId: trackId, flag: 'solo' });
					}
				});
				items.push({
					name: 'Record Arm',
					callback: function () {
						handleAction('toggle-track-flag', trackButton, { trackId: trackId, flag: 'arm' });
					}
				});
				items.push({
					name: 'Remove Track',
					callback: function () {
						handleAction('remove-track', trackButton, { trackId: trackId });
					}
				});
				return items;
			}

			if (assetCard) {
				var assetId = getAttr(assetCard, 'data-asset-card');
				items.push({
					name: 'Use For Export',
					callback: function () {
						handleAction('select-asset', assetCard, { assetId: assetId });
					}
				});
				items.push({
					name: 'Route To Track',
					callback: function () {
						handleAction('send-asset-to-track', assetCard, { assetId: assetId });
					}
				});
				items.push({
					name: 'Filename -> Tags',
					callback: function () {
						multitrack.toggleAssetSelection(assetId, false);
						handleAction('batch-filename-tags', assetCard, { assetId: assetId });
					}
				});
				if (isDesktopApp) {
					items.push({
						name: 'Write Tags To File',
						callback: function () {
							handleAction('write-asset-tags', assetCard, { assetId: assetId });
						}
					});
				}
				items.push({
					name: 'Remove Asset',
					callback: function () {
						handleAction('remove-asset', assetCard, { assetId: assetId });
					}
				});
				return items;
			}

			if (dockFrame) {
				var dockId = getAttr(dockFrame, 'data-dock-frame');
				var dock = multitrack.getState().docks[dockId];
				var panelId = dock && dock.active;
				if (panelId) {
					items.push({
						name: 'Move To Left Dock',
						callback: function () {
							handleAction('move-panel-dock', dockFrame, { panelId: panelId, dockTarget: 'left' });
						}
					});
					items.push({
						name: 'Move To Right Dock',
						callback: function () {
							handleAction('move-panel-dock', dockFrame, { panelId: panelId, dockTarget: 'right' });
						}
					});
					items.push({
						name: 'Move To Bottom Dock',
						callback: function () {
							handleAction('move-panel-dock', dockFrame, { panelId: panelId, dockTarget: 'bottom' });
						}
					});
					if (panelId === 'mixer' || panelId === 'library') {
						items.push({
							name: 'Float Panel',
							callback: function () {
								handleAction('float-panel', dockFrame, { panelId: panelId });
							}
						});
					}
					items.push({
						name: 'Hide Panel',
						callback: function () {
							handleAction('close-dock-panel', dockFrame, { panelId: panelId });
						}
					});
				}
				items.push({
					name: 'Collapse / Expand Dock',
					callback: function () {
						handleAction('toggle-dock-collapse', dockFrame, { dockId: dockId });
					}
				});
				return items;
			}

			if (onToolbar) {
				items.push({
					name: 'Customize Toolbar',
					callback: function () {
						showToolbarModal();
					}
				});
				items.push({
					name: 'Play Mix',
					callback: function () {
						handleAction('play-mix', onToolbar, {});
					}
				});
				items.push({
					name: 'Render To Editor',
					callback: function () {
						handleAction('render-mix', onToolbar, {});
					}
				});
				return items;
			}

			if (target.closest && target.closest('.pk_mtw_arrange')) {
				items.push({
					name: 'Add Track',
					callback: function () {
						handleAction('add-track', target, {});
					}
				});
				items.push({
					name: 'Send Current Editor File',
					callback: function () {
						handleAction('add-current-file', target, {});
					}
				});
				items.push({
					name: 'Render Mix To Editor',
					callback: function () {
						handleAction('render-mix', target, {});
					}
				});
			}

			return items;
		}

		function setupContextMenu () {
			if (!PKAE._deps.ContextMenu) return;
			contextMenu = PKAE._deps.ContextMenu(shell);

			shell.addEventListener('contextmenu', function (e) {
				if (!shell.classList.contains('pk_act')) return;
				var options = buildContextOptions(e);
				if (!options.length) return;

				e.preventDefault();
				e.stopPropagation();
				contextMenu.options = [];
				for (var i = 0; i < options.length; ++i) {
					contextMenu.addOption(options[i].name, options[i].callback, false);
				}
				contextMenu.open(e);
			}, false);
		}

		q.renderFloatingPanel = function ( panel_name ) {
			var state = multitrack.getState ();

			if (panel_name === 'mixer') {
				return {
					title: 'Mixer',
					subtitle: 'Master bus and per-track strips.',
					html:
						'<div class="pk_mtw_batchbar pk_mtf_batchbar">' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="play-mix">Play Mix</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="stop-mix">Stop Mix</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="render-mix">Render To Editor</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="add-track">Add Track</button>' +
						'</div>' +
						'<div class="pk_mtm_strips pk_mtf_strips">' + renderMixerHTML ( state ) + '</div>'
				};
			}

			if (panel_name === 'library') {
				return {
					title: 'RECwerk Asset Library',
					subtitle: 'Tagging, file prep and export metadata.',
					html:
						'<div class="pk_mtw_batchbar pk_mtf_batchbar">' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="select-all-assets">Select All</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="clear-asset-selection">Clear</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="batch-filename-tags">Filename -> Tags</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="batch-tags-name">Tags -> Name</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="batch-trim-tags">Trim Tags</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="batch-titlecase-tags">Title Case</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="bulk-edit-tags">Bulk Edit</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="replace-text-tags">Replace Text</button>' +
							(isDesktopApp ? '<button type="button" class="pk_mtw_chip" data-mt-action="batch-rename-files">Rename Files</button>' : '') +
						'</div>' +
						'<div class="pk_mtw_assets pk_mtf_assets">' + renderAssetsHTML ( state ) + '</div>'
				};
			}

			return {
				title: 'Panel',
				subtitle: '',
				html: ''
			};
		};

		q.handleFloatingPanelAction = function ( action, payload ) {
			return handleAction ( action, payload || {}, payload || {} );
		};

		q.handleFloatingPanelInput = function ( payload ) {
			if (!payload) return false;
			return handleInput ({
				value: payload.value,
				'data-mt-track-id': payload.trackId,
				'data-mt-prop': payload.prop,
				'data-mt-master': payload.masterKey
			});
		};

		q.handleFloatingPanelChange = function ( payload ) {
			if (!payload) return false;
			return handleTagChange ({
				value: payload.value,
				'data-mt-action': payload.action,
				'data-mt-asset-id': payload.assetId,
				'data-mt-tag': payload.tag
			});
		};

		function render () {
			var state = multitrack.getState ();
			shell.classList.toggle ('pk_act', !!state.visible);
			shell.querySelector('[data-mt-action="toggle-workspace"]').textContent = state.visible ? 'Hide Workspace' : 'Show Workspace';
			renderToolbar();
			renderTransportInfo(state);
			renderTracks(state);
			renderDock('left', leftDock, state);
			renderDock('right', rightDock, state);
			renderDock('bottom', bottomDock, state);
			renderStatusBar(state);
			play_mix_btn = shell.querySelector('.pk_mtw_macrobar [data-mt-action="play-mix"]');
			stop_mix_btn = shell.querySelector('.pk_mtw_macrobar [data-mt-action="stop-mix"]');

			if (play_mix_btn) play_mix_btn.classList.toggle('pk_act', !!isMixPlaying);
			if (stop_mix_btn) stop_mix_btn.classList.toggle('pk_act', !!isMixPlaying);
			if (app.ui && app.ui.syncAdaptiveLayout) app.ui.syncAdaptiveLayout ( false );
		}

		shell.addEventListener ('mousedown', function ( e ) {
			var target = e.target.closest('[data-mt-action="drag-clip"]');
			if (!target) return ;
			if (startClipDrag(target)) {
				e.preventDefault();
				e.stopPropagation();
			}
		});

		shell.addEventListener ('click', function ( e ) {
			var target = e.target.closest('[data-mt-action]');
			if (!target) return ;

			var action = target.getAttribute('data-mt-action');
			if (handleAction(action, target, {
				keepSelection: e.shiftKey || e.ctrlKey || e.metaKey,
				lane: target.closest ? target.closest('.pk_mtt_laneinner') : null
			})) {
				e.preventDefault();
			}
		});

		shell.addEventListener ('input', function ( e ) {
			handleInput ( e.target );
		});

		shell.addEventListener ('change', function ( e ) {
			handleTagChange ( e.target );
		});

		app.listenFor ('DidMultitrackChange', render);
		app.listenFor ('DidMultitrackPlaybackState', function ( val ) {
			isMixPlaying = !!val;
			render();
		});

		setupContextMenu();
		render ();
	}

	PKAE._deps.multitrackUI = PKMultitrackUI;

})( window, document, PKAudioEditor );
