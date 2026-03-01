(function ( w, d ) {
	'use strict';

	var _v = '0.9',
		_id = -1;

	function PKAE () {
		var q = this; // keeping track of current context

		q.el = null; // reference of main html element
		q.id = ++_id; // auto incremental id
		q._deps = {}; // dependencies
		q.isDesktopApp = !!(w.process && w.process.versions && w.process.versions.electron);
		q.isWebApp = !q.isDesktopApp;

		w.PKAudioList[q.id] = q;

		var events = {};

		q.fireEvent = function ( eventName, value, value2 ) {
			var group = events[eventName];
			if (!group) return (false);

			var l = group.length;
			while (l-- > 0) {
				group[l] && group[l] ( value, value2 );
			}
		};

		q.listenFor = function ( eventName, callback ) {
			if (!events[eventName])
				events[eventName] = [ callback ];
			else
				events[eventName].unshift ( callback  );
		};

		q.stopListeningFor = function ( eventName, callback ) {
			var group = events[eventName];
			if (!group) return (false);

			var l = group.length;
			while (l-- > 0) {
				if (group[l] && group[l] === callback) {
					group[l] = null; break;
				}
			}
		};

		q.stopListeningForName = function ( eventName ) {
			var group = events[eventName];
			if (!group) return (false);
			events[eventName] = null;
		};

		q.init = function ( el_id ) {
			var el = d.getElementById( el_id );
			if (!el) {
				console.log ('invalid element');
				return ;
			}
			q.el = el;

			// init libraries
			q.ui     = new q._deps.ui ( q ); q._deps.uifx ( q );
			q.engine = new q._deps.engine ( q );
			q.state  = new q._deps.state ( 4, q );
			q.rec    = new q._deps.rec ( q );
			q.fls    = new q._deps.fls ( q );

			window.isDirty = false;
			q.listenFor('DidStateChange', function() {
				window.isDirty = true;
			});
			q.listenFor('StateClearAll', function() {
				window.isDirty = false;
			});

			// Recent Files logic
			q.getRecentFiles = function() {
				var recent = localStorage.getItem('pk_recent_files');
				return recent ? JSON.parse(recent) : [];
			};

			q.addRecentFile = function(fileName, filePath) {
				var recent = q.getRecentFiles();
				// Verwijder als het al bestaat (om bovenaan te zetten)
				recent = recent.filter(function(f) { return f.name !== fileName; });
				recent.unshift({ name: fileName, path: filePath, timestamp: new Date().getTime() });
				// Maximaal 10 recente bestanden
				if (recent.length > 10) recent.pop();
				localStorage.setItem('pk_recent_files', JSON.stringify(recent));
				q.fireEvent('DidUpdateRecentFiles', recent);
			};

			q.listenFor('DidLoadFile', function(fileName, filePath) {
				if (fileName) q.addRecentFile(fileName, filePath);
			});

			q.isProjectFile = function(fileName) {
				return !!fileName && /\.recwerk$/i.test(fileName);
			};

			q._showProjectOpenError = function(fileName, err) {
				console.error('Failed to open RECwerk project:', err);
				q.fireEvent('ShowError', 'Could not open RECwerk project "' + (fileName || 'project.recwerk') + '".');
			};

			q._loadProjectFromText = function(projectText, fileName, filePath) {
				var project = null;

				try {
					project = JSON.parse(projectText);
				} catch (err) {
					q._showProjectOpenError(fileName, err);
					return false;
				}

				if (!project || !Array.isArray(project.channels) || project.channels.length === 0) {
					q._showProjectOpenError(fileName, new Error('Missing channel data'));
					return false;
				}

				var sampleRate = project.sampleRate / 1;
				if (!sampleRate || !isFinite(sampleRate) || sampleRate <= 0) {
					q._showProjectOpenError(fileName, new Error('Invalid sample rate'));
					return false;
				}

				var channelBuffers = [];
				var frameCount = -1;

				for (var i = 0; i < project.channels.length; ++i) {
					var channelData = project.channels[i];
					if (!Array.isArray(channelData) && !ArrayBuffer.isView(channelData)) {
						q._showProjectOpenError(fileName, new Error('Invalid channel data'));
						return false;
					}

					var floatChannel = Float32Array.from(channelData);
					if (frameCount === -1) frameCount = floatChannel.length;
					else if (floatChannel.length !== frameCount) {
						q._showProjectOpenError(fileName, new Error('Mismatched channel lengths'));
						return false;
					}

					channelBuffers.push(floatChannel.buffer);
				}

				q.engine.currentFileName = fileName || project.name || 'project.recwerk';
				q.engine.currentFilePath = filePath || '';
				q.engine.wavesurfer.backend._add = 0;
				q.engine.LoadDB({
					id: project.name || q.engine.currentFileName,
					name: project.name || q.engine.currentFileName,
					data: channelBuffers,
					chans: channelBuffers.length,
					samplerate: sampleRate,
					durr: frameCount > -1 ? frameCount / sampleRate : 0
				});

				return true;
			};

			q.OpenLocalFile = function(fileData, fileName, filePath) {
				if (q.isProjectFile(fileName)) {
					if (typeof fileData === 'string') {
						return q._loadProjectFromText(fileData, fileName, filePath);
					}

					if (fileData instanceof Blob) {
						fileData.text().then(function(text) {
							q._loadProjectFromText(text, fileName, filePath);
						}).catch(function(err) {
							q._showProjectOpenError(fileName, err);
						});
						return true;
					}

					try {
						var bytes = ArrayBuffer.isView(fileData)
							? new Uint8Array(fileData.buffer, fileData.byteOffset, fileData.byteLength)
							: new Uint8Array(fileData);
						var text = new TextDecoder('utf-8').decode(bytes);
						return q._loadProjectFromText(text, fileName, filePath);
					} catch (err) {
						q._showProjectOpenError(fileName, err);
						return false;
					}
				}

				if (fileData instanceof Blob) {
					q.engine.LoadArrayBuffer(fileData, fileName, filePath);
					return true;
				}

				q.engine.LoadArrayBuffer(new Blob([fileData]), fileName, filePath);
				return true;
			};

			q.listenFor('RequestSaveProject', function() {
				if (!q.engine.is_ready) return;
				
				var buffer = q.engine.wavesurfer.backend.buffer;
				var channels = [];
				for (var i = 0; i < buffer.numberOfChannels; i++) {
					channels.push(Array.from(buffer.getChannelData(i)));
				}
				
				var project = {
					name: "RECwerk Project",
					version: "1.0",
					sampleRate: buffer.sampleRate,
					channels: channels,
					timestamp: new Date().getTime()
				};
				
				var projectData = JSON.stringify(project);

				// Probeer Electron native save dialog
				if (window.process && window.process.versions && window.process.versions.electron) {
					try {
						const { ipcRenderer } = require('electron');
						const fs = require('fs');
						
						ipcRenderer.invoke('show-save-dialog', {
							title: 'Save RECwerk Project',
							defaultPath: 'project.recwerk',
							filters: [{ name: 'RECwerk Projects', extensions: ['recwerk'] }]
						}).then(result => {
							if (!result.canceled && result.filePath) {
								fs.writeFileSync(result.filePath, projectData);
								OneUp('Project Saved Successfully');
								window.isDirty = false;
							}
						}).catch(err => {
							console.error('IPC save dialog failed:', err);
						});
						
						return;
					} catch (e) {
						console.error('Electron save failed, falling back to download:', e);
					}
				}

				// Fallback naar browser download
				var blob = new Blob([projectData], {type: "application/json"});
				var url = URL.createObjectURL(blob);
				var a = document.createElement("a");
				a.href = url;
				a.download = "project.recwerk";
				a.click();
				window.isDirty = false;
			});

			if (w.location.href.split('local=')[1]) {
				var sess = w.location.href.split('local=')[1];

				q.fls.Init (function () {
					q.fls.GetSession (sess, function ( e ) {
						if(e && e.id === sess )
						{
							q.engine.LoadDB ( e );
						}
					});
				});
			}

			return (q);
		};

		// check if we are mobile and hide tooltips on hover
		q.isMobile = (/iphone|ipod|ipad|android/).test
			(navigator.userAgent.toLowerCase ());
	};

	!w.PKAudioList && (w.PKAudioList = []);

	// ideally we do not want a global singleto refferencing our audio tool
	// but since this is a limited demo we can safely do it.
	w.PKAudioEditor = new PKAE ();

	PKAudioList.push (w.PKAudioEditor); // keeping track in the audiolist array of our instance

})( window, document );
