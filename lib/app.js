(function ( w, d ) {
	'use strict';

	var _v = '0.9',
		_id = -1;

	function PKAE () {
		var q = this; // keeping track of current context
		var defaultWindowTitle = 'RECwerk Editor | Waveform and Audio Editor';

		q.el = null; // reference of main html element
		q.id = ++_id; // auto incremental id
		q._deps = {}; // dependencies
		q.isDesktopApp = !!(w.process && w.process.versions && w.process.versions.electron);
		q.isWebApp = !q.isDesktopApp;
		q.features = {
			multitrack: false
		};

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
			q.multitrack = null;
			q.multitrackEngine = null;
			q.multitrackUI = null;

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
				q._setWindowTitle(fileName);
			});

			q.isProjectFile = function(fileName) {
				return !!fileName && /\.recwerk$/i.test(fileName);
			};

			q._setWindowTitle = function(fileName, prefix) {
				var nextTitle = defaultWindowTitle;
				if (fileName) {
					nextTitle = (prefix ? prefix + ' ' : '') + fileName + ' | RECwerk Editor';
				}
				d.title = nextTitle;
				if (!q.isDesktopApp) return;

				try {
					var ipcRenderer = require('electron').ipcRenderer;
					ipcRenderer.send('set-window-title', nextTitle);
				} catch (err) {}
			};

			q._setProjectLoadProgress = function(percent) {
				q.fireEvent('DidProgressModal', Math.max(0, Math.min(100, percent >> 0)));
			};

			q._beginProjectLoad = function(fileName) {
				q.fireEvent('WillDownloadFile');
				q._setProjectLoadProgress(0);
				q._setWindowTitle(fileName || 'project.recwerk', 'Opening');
			};

			q._finishProjectLoad = function() {
				q.fireEvent('DidDownloadFile');
			};

			q._showProjectOpenError = function(fileName, err) {
				console.error('Failed to open RECwerk project:', err);
				q._finishProjectLoad();
				q._setWindowTitle(q.engine && q.engine.currentFileName ? q.engine.currentFileName : '');
				q.fireEvent('ShowError', 'Could not open RECwerk project "' + (fileName || 'project.recwerk') + '".');
			};

			q._streamProjectFile = function(filePath, handlers) {
				return new Promise(function(resolve, reject) {
					var fs = null;
					try {
						fs = require('fs');
					} catch (err) {
						reject(err);
						return;
					}

					var stream = fs.createReadStream(filePath, {
						encoding: 'utf8',
						highWaterMark: 1024 * 1024
					});
					var headerBuffer = '';
					var headerParsed = false;
					var bracketDepth = 0;
					var channelIndex = -1;
					var sampleIndex = 0;
					var numberToken = '';
					var channelLengths = [];
					var meta = {
						name: '',
						sampleRate: 0,
						channelCount: 0,
						frameCount: 0
					};
					var completed = false;
					var totalBytes = 0;
					var bytesRead = 0;

					try {
						totalBytes = fs.statSync(filePath).size || 0;
					} catch (err2) {}

					function fail(err) {
						if (completed) return;
						completed = true;
						stream.destroy();
						reject(err);
					}

					function flushNumber() {
						if (!numberToken) return;

						var value = Number(numberToken);
						numberToken = '';

						if (!isFinite(value)) {
							throw new Error('Invalid project sample value');
						}

						if (handlers && handlers.onValue) {
							handlers.onValue(channelIndex, sampleIndex, value);
						}

						++sampleIndex;
					}

					function closeChannel() {
						channelLengths[channelIndex] = sampleIndex;
						if (handlers && handlers.onChannelEnd) {
							handlers.onChannelEnd(channelIndex, sampleIndex);
						}
					}

					function parseHeader(headerText) {
						var rateMatch = /"(sampleRate|samplerate)"\s*:\s*([0-9.+\-eE]+)/.exec(headerText);
						if (!rateMatch) {
							throw new Error('Invalid sample rate');
						}

						meta.sampleRate = rateMatch[2] / 1;
						if (!meta.sampleRate || !isFinite(meta.sampleRate) || meta.sampleRate <= 0) {
							throw new Error('Invalid sample rate');
						}

						var nameMatch = /"name"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(headerText);
						if (nameMatch) {
							try {
								meta.name = JSON.parse('"' + nameMatch[1] + '"');
							} catch (err) {
								meta.name = '';
							}
						}
					}

					function scanChunk(text) {
						for (var i = 0; i < text.length; ++i) {
							var ch = text[i];

							if (ch === '[') {
								if (bracketDepth === 1) {
									++channelIndex;
									sampleIndex = 0;
									if (handlers && handlers.onChannelStart) {
										handlers.onChannelStart(channelIndex);
									}
								}

								++bracketDepth;
								continue;
							}

							if (ch === ']') {
								flushNumber();

								if (bracketDepth === 2) {
									closeChannel();
								}

								--bracketDepth;
								if (bracketDepth === 0) {
									meta.channelCount = channelLengths.length;
									meta.frameCount = channelLengths.length ? channelLengths[0] : 0;

									for (var j = 1; j < channelLengths.length; ++j) {
										if (channelLengths[j] !== meta.frameCount) {
											throw new Error('Mismatched channel lengths');
										}
									}

									completed = true;
									stream.destroy();
									resolve(meta);
									return;
								}

								continue;
							}

							if (ch === ',') {
								flushNumber();
								continue;
							}

							if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
								continue;
							}

							numberToken += ch;
						}
					}

					stream.on('data', function(chunk) {
						if (completed) return;

						try {
							bytesRead += chunk.length || 0;
							if (handlers && handlers.onProgress && totalBytes > 0) {
								handlers.onProgress(bytesRead, totalBytes);
							}
							if (!headerParsed) {
								headerBuffer += chunk;
								var match = /"(channels|data)"\s*:\s*\[/.exec(headerBuffer);
								if (!match) {
									if (headerBuffer.length > 1024 * 1024) {
										throw new Error('Invalid project structure');
									}
									return;
								}

								parseHeader(headerBuffer.slice(0, match.index + match[0].length));
								chunk = headerBuffer.slice(match.index + match[0].length);
								headerBuffer = '';
								headerParsed = true;
								bracketDepth = 1;
							}

							scanChunk(chunk);
						} catch (err) {
							fail(err);
						}
					});

					stream.on('error', fail);
					stream.on('close', function() {
						if (!completed) {
							reject(new Error('Unexpected end of project file'));
						}
					});
				});
			};

			q._prepareDecodedProjectLoad = function(fileName, filePath) {
				q.engine.is_ready = false;
				q.engine.currentFileName = fileName || 'project.recwerk';
				q.engine.currentFilePath = filePath || '';
				q.engine.wavesurfer.backend._add = 0;
				q.engine.wavesurfer.regions && q.engine.wavesurfer.regions.clear();
				q.fireEvent('DidUnloadFile');
			};

			q._loadProjectFromDesktopPath = function(filePath, fileName) {
				var wavesurfer = q.engine.wavesurfer;
				q._beginProjectLoad(fileName);

				q._streamProjectFile(filePath, {
					onProgress: function(bytesRead, totalBytes) {
						q._setProjectLoadProgress(1 + ((bytesRead / totalBytes) * 47));
					}
				}).then(function(meta) {
					q._setProjectLoadProgress(48);
					var buffer = wavesurfer.backend.ac.createBuffer(
						meta.channelCount,
						meta.frameCount,
						meta.sampleRate
					);
					var channelTargets = [];

					for (var i = 0; i < meta.channelCount; ++i) {
						channelTargets.push(buffer.getChannelData(i));
					}

					return q._streamProjectFile(filePath, {
						onValue: function(channel, index, value) {
							channelTargets[channel][index] = value;
						},
						onProgress: function(bytesRead, totalBytes) {
							q._setProjectLoadProgress(50 + ((bytesRead / totalBytes) * 49));
						}
					}).then(function() {
						q._setProjectLoadProgress(100);
						q._prepareDecodedProjectLoad(fileName || meta.name || 'project.recwerk', filePath);
						wavesurfer.loadDecodedBuffer(buffer);
						return true;
					});
				}).catch(function(err) {
					q._showProjectOpenError(fileName, err);
				});

				return true;
			};

			q._loadProjectFromText = function(projectText, fileName, filePath) {
				var project = null;
				q._beginProjectLoad(fileName);

				try {
					project = JSON.parse(projectText);
				} catch (err) {
					q._showProjectOpenError(fileName, err);
					return false;
				}

				var projectChannels = project && Array.isArray(project.channels) ? project.channels : null;
				if (!projectChannels && project && Array.isArray(project.data)) {
					projectChannels = project.data;
				}

				if (!project || !projectChannels || projectChannels.length === 0) {
					q._showProjectOpenError(fileName, new Error('Missing channel data'));
					return false;
				}

				var sampleRate = (project.sampleRate || project.samplerate) / 1;
				if (!sampleRate || !isFinite(sampleRate) || sampleRate <= 0) {
					q._showProjectOpenError(fileName, new Error('Invalid sample rate'));
					return false;
				}

				var frameCount = -1;

				for (var i = 0; i < projectChannels.length; ++i) {
					var channelData = projectChannels[i];
					if (!Array.isArray(channelData) && !ArrayBuffer.isView(channelData)) {
						q._showProjectOpenError(fileName, new Error('Invalid channel data'));
						return false;
					}

					var channelLength = channelData.length >>> 0;
					if (frameCount === -1) frameCount = channelLength;
					else if (channelLength !== frameCount) {
						q._showProjectOpenError(fileName, new Error('Mismatched channel lengths'));
						return false;
					}
				}

				q._prepareDecodedProjectLoad(fileName || project.name || 'project.recwerk', filePath);
				q.engine.LoadDB({
					id: project.name || q.engine.currentFileName,
					name: project.name || q.engine.currentFileName,
					data: projectChannels,
					chans: projectChannels.length,
					samplerate: sampleRate,
					durr: frameCount > -1 ? frameCount / sampleRate : 0
				});
				q._setProjectLoadProgress(100);

				return true;
			};

			q.OpenLocalFile = function(fileData, fileName, filePath) {
				if (q.isProjectFile(fileName)) {
					if (q.isDesktopApp && filePath) {
						return q._loadProjectFromDesktopPath(filePath, fileName);
					}

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
