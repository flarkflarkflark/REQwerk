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

	function buildTimelineTicks ( duration ) {
		var html = '';
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
		try {
			if (isDesktopApp) {
				ipcRenderer = require('electron').ipcRenderer;
				pathModule = require('path');
			}
		} catch (err) {}

		function getAttr ( target, key ) {
			if (!target) return null;
			if (target.getAttribute) return target.getAttribute ( key );
			return target[ key ] != null ? target[ key ] : null;
		}

		var shell = d.createElement ('section');
		shell.className = 'pk_mtw';
			shell.innerHTML =
			'<div class="pk_mtw_hd">' +
				'<div>' +
					'<h2>Multitrack Workspace</h2>' +
					'<p>Track lanes, mixer strips, master channel, and a RECwerk asset library for tagging and vinyl-transfer prep.</p>' +
				'</div>' +
				'<div class="pk_mtw_actions">' +
					'<button type="button" class="pk_mtw_btn" data-mt-action="toggle-workspace">Show Workspace</button>' +
					'<button type="button" class="pk_mtw_btn" data-mt-action="play-mix">Play Mix</button>' +
					'<button type="button" class="pk_mtw_btn" data-mt-action="stop-mix">Stop Mix</button>' +
					'<button type="button" class="pk_mtw_btn" data-mt-action="render-mix">Render To Editor</button>' +
					'<button type="button" class="pk_mtw_btn" data-mt-action="add-track">Add Track</button>' +
					'<button type="button" class="pk_mtw_btn" data-mt-action="add-current-file">Add Current File</button>' +
					'<button type="button" class="pk_mtw_btn" data-mt-action="new-vinyl">New Vinyl Entry</button>' +
					'<button type="button" class="pk_mtw_btn" data-mt-action="open-mixer-window">Open Mixer Window</button>' +
					'<button type="button" class="pk_mtw_btn" data-mt-action="open-library-window">Open Library Window</button>' +
				'</div>' +
			'</div>' +
			'<div class="pk_mtw_main">' +
				'<div class="pk_mtw_timeline">' +
					'<div class="pk_mtw_panelhd">' +
						'<strong>Timeline</strong>' +
						'<div class="pk_mtw_panelactions">' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="toggle-mixer">Mixer</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="open-mixer-window">Mixer Window</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="toggle-library">Library</button>' +
							'<button type="button" class="pk_mtw_chip" data-mt-action="open-library-window">Library Window</button>' +
						'</div>' +
					'</div>' +
					'<div class="pk_mtw_tracks"></div>' +
				'</div>' +
				'<aside class="pk_mtw_mixer">' +
					'<div class="pk_mtw_panelhd"><strong>Mixer</strong><span>Master + per-track strip</span><div class="pk_mtw_panelactions"><button type="button" class="pk_mtw_chip" data-mt-action="open-mixer-window">Pop Out</button></div></div>' +
					'<div class="pk_mtm_strips"></div>' +
				'</aside>' +
				'</div>' +
				'<div class="pk_mtw_library">' +
					'<div class="pk_mtw_panelhd"><strong>RECwerk Asset Library</strong><span>Tag imported files, vinyl takes, and recording passes.</span><div class="pk_mtw_panelactions"><button type="button" class="pk_mtw_chip" data-mt-action="open-library-window">Pop Out</button></div></div>' +
					'<div class="pk_mtw_batchbar">' +
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
					'<div class="pk_mtw_assets"></div>' +
				'</div>';

		app.ui.audioContainer.appendChild ( shell );

		var track_list = shell.querySelector('.pk_mtw_tracks');
		var mixer_list = shell.querySelector('.pk_mtm_strips');
		var asset_list = shell.querySelector('.pk_mtw_assets');
		var play_mix_btn = shell.querySelector('[data-mt-action="play-mix"]');
		var stop_mix_btn = shell.querySelector('[data-mt-action="stop-mix"]');
		var dragState = null;

		function showBulkEditModal () {
			var assets = multitrack.getSelectedAssets();
			if (!assets.length) {
				alert('Select assets first.');
				return ;
			}

			var rows = '';
			for (var i = 0; i < assets.length; ++i) {
				var asset = assets[i];
				rows += '<tr>' +
					'<td>' + escapeHTML(asset.name) + '</td>' +
					'<td><input class="pk_mtw_bulkinput" data-asset-id="' + asset.id + '" data-bulk-tag="title" value="' + escapeHTML(asset.tags.title) + '"></td>' +
					'<td><input class="pk_mtw_bulkinput" data-asset-id="' + asset.id + '" data-bulk-tag="artist" value="' + escapeHTML(asset.tags.artist) + '"></td>' +
					'<td><input class="pk_mtw_bulkinput" data-asset-id="' + asset.id + '" data-bulk-tag="album" value="' + escapeHTML(asset.tags.album) + '"></td>' +
					'<td><input class="pk_mtw_bulkinput" data-asset-id="' + asset.id + '" data-bulk-tag="track" value="' + escapeHTML(asset.tags.track) + '"></td>' +
					'<td><input class="pk_mtw_bulkinput" data-asset-id="' + asset.id + '" data-bulk-tag="year" value="' + escapeHTML(asset.tags.year) + '"></td>' +
					'<td><input class="pk_mtw_bulkinput" data-asset-id="' + asset.id + '" data-bulk-tag="genre" value="' + escapeHTML(asset.tags.genre) + '"></td>' +
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

		function stopClipDrag () {
			if (!dragState) return ;
			document.removeEventListener('mousemove', onClipDragMove, false);
			document.removeEventListener('mouseup', stopClipDrag, false);
			document.removeEventListener('mouseleave', stopClipDrag, false);
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
					clips += '<button type="button" class="pk_mtt_clip" data-mt-action="edit-clip" data-track-id="' + track.id + '" data-clip-id="' + clip.id + '" style="left:' + clipLeft.toFixed(4) + '%; width:' + clipWidth.toFixed(4) + '%; border-color:' + track.color + '; box-shadow: inset 0 0 0 1px ' + track.color + ';">' +
						'<span class="pk_mtt_grab" data-mt-action="drag-clip" data-track-id="' + track.id + '" data-clip-id="' + clip.id + '">::</span>' +
						'<strong>' + escapeHTML(clip.name) + '</strong>' +
						'<span>Start ' + ((clip.start || 0).toFixed(2)) + 's / Dur ' + (clip.duration ? clip.duration.toFixed(2) + 's' : 'clip') + '</span>' +
					'</button>';
				}

				if (!clips) {
					clips = '<div class="pk_mtt_empty">Drop in files from the asset library or add the currently opened editor file.</div>';
				}

					html += '<div class="pk_mtt_row' + (selected ? ' pk_sel' : '') + '">' +
					'<div class="pk_mtt_meta">' +
						'<button type="button" class="pk_mtt_trackbtn" data-mt-action="select-track" data-track-id="' + track.id + '">' +
							'<span class="pk_mtt_color" style="background:' + track.color + ';"></span>' +
							'<span class="pk_mtt_name">' + escapeHTML(track.name) + '</span>' +
							'<span class="pk_mtt_state">' + (audible ? 'Live' : 'Muted') + '</span>' +
						'</button>' +
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
				html += '<div class="pk_mtm_strip' + (track.id === state.selectedTrackId ? ' pk_sel' : '') + '">' +
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

		function renderMixer ( state ) {
			mixer_list.innerHTML = renderMixerHTML ( state );
		}

		function renderAssetsHTML ( state ) {
			if (!state.assets.length) {
				return '<div class="pk_mtw_assetempty">Imported files, recorded takes and vinyl entries will appear here. Tag them first, then route them into tracks.</div>';
			}

			var html = '';
			for (var i = 0; i < state.assets.length; ++i) {
				var asset = state.assets[i];
				var isSelected = state.selectedAssetIds && state.selectedAssetIds.indexOf(asset.id) > -1;
				html += '<article class="pk_mtw_asset' + (asset.id === state.selectedAssetId ? ' pk_sel' : '') + '">' +
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

		function renderAssets ( state ) {
			asset_list.innerHTML = renderAssetsHTML ( state );
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

		function handleAction ( action, target, options ) {
			options = options || {};
			var track_id = getAttr(target, 'data-track-id') || options.trackId || '';
			var asset_id = getAttr(target, 'data-asset-id') || options.assetId || '';

			if (action === 'toggle-workspace') {
				multitrack.toggleWorkspace ();
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
			if (action === 'toggle-library') {
				multitrack.toggleLibrary ();
				return true;
			}
			if (action === 'add-track') {
				multitrack.addTrack ();
				return true;
			}
			if (action === 'select-track') {
				multitrack.setSelectedTrack ( track_id );
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
					alert ('Open a file in the editor first, then send it into a multitrack lane.');
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
					if (window.OneUp) {
						OneUp('Wrote tags to ' + asset.name, 1400);
					}
				}).catch(function (err) {
					console.error(err);
					alert('Could not write tags to file: ' + asset.path);
				});
				return true;
			}
			if (action === 'new-vinyl') {
				var name = prompt ('Name this vinyl entry:', 'RECwerk Vinyl Transfer');
				if (name !== null) {
					multitrack.createVinylEntry ( name );
				}
				return true;
			}
			if (action === 'drag-clip') {
				var lane = options.lane || (target && target.closest ? target.closest('.pk_mtt_laneinner') : null);
				if (!lane) return true;
				dragState = {
					trackId: track_id,
					clipId: getAttr(target, 'data-clip-id') || options.clipId,
					lane: lane,
					duration: parseFloat(getAttr(lane, 'data-timeline-duration')) || multitrack.getTimelineDuration()
				};
				document.addEventListener('mousemove', onClipDragMove, false);
				document.addEventListener('mouseup', stopClipDrag, false);
				document.addEventListener('mouseleave', stopClipDrag, false);
				return true;
			}
			if (action === 'edit-clip') {
				var track = multitrack.getTrack(track_id);
				if (!track) return true;
				var clip_id = getAttr(target, 'data-clip-id') || options.clipId;
				var clip = null;
				for (var i = 0; i < track.clips.length; ++i) {
					if (track.clips[i].id === clip_id) {
						clip = track.clips[i];
						break;
					}
				}
				if (!clip) return true;

				var startValue = prompt('Clip start in seconds:', clip.start || 0);
				if (startValue === null) return true;
				var durationValue = prompt('Clip duration in seconds:', clip.duration || 0);
				if (durationValue === null) return true;
				var parsedStart = parseFloat(startValue);
				var parsedDuration = parseFloat(durationValue);
				if (!isNaN(parsedStart) && !isNaN(parsedDuration) && parsedStart >= 0 && parsedDuration >= 0) {
					multitrack.updateClip(track.id, clip.id, {
						start: parsedStart,
						duration: parsedDuration
					});
				}
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
			if (getAttr(target, 'data-mt-action') === 'toggle-asset-selection') {
				return true;
			}
			var asset_id = getAttr(target, 'data-mt-asset-id');
			var tag = getAttr(target, 'data-mt-tag');
			if (!asset_id || !tag) return false;

			multitrack.updateAssetTag ( asset_id, tag, target.value );
			return true;
		}

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
			shell.querySelector('.pk_mtw_mixer').classList.toggle ('pk_hide', !state.mixerVisible);
			shell.querySelector('.pk_mtw_library').classList.toggle ('pk_hide', !state.libraryVisible);
			if (app.ui && app.ui.syncAdaptiveLayout) {
				app.ui.syncAdaptiveLayout ( false );
			}
			renderTracks ( state );
			renderMixer ( state );
			renderAssets ( state );
		}

		shell.addEventListener ('click', function ( e ) {
			var target = e.target.closest('[data-mt-action]');
			if (!target) return ;

			var action = target.getAttribute('data-mt-action');
			if (handleAction(action, target, {
				keepSelection: e.shiftKey || e.ctrlKey || e.metaKey,
				lane: target.closest ? target.closest('.pk_mtt_laneinner') : null
			})) {
				if (action === 'drag-clip') {
					e.preventDefault();
					e.stopPropagation();
				}
				return ;
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
			if (play_mix_btn) play_mix_btn.classList.toggle('pk_act', !!val);
			if (stop_mix_btn) stop_mix_btn.classList.toggle('pk_act', !!val);
		});
		render ();
	}

	PKAE._deps.multitrackUI = PKMultitrackUI;

})( window, document, PKAudioEditor );
