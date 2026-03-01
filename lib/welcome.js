(function ( w, d, PKAE ) {
	'use strict';

	var ipcRenderer = null;
	try {
		if (w.process && w.process.versions && w.process.versions.electron) {
			ipcRenderer = require('electron').ipcRenderer;
		}
	} catch (e) {}

	function getSkipWelcomeSetting () {
		if (ipcRenderer) {
			return ipcRenderer.invoke('get-setting', 'pk_skip_welcome').then(function (val) {
				return val === '1';
			}).catch(function () {
				return w.localStorage && w.localStorage.getItem('pk_skip_welcome') === '1';
			});
		}

		return Promise.resolve(w.localStorage && w.localStorage.getItem('pk_skip_welcome') === '1');
	}

	function setSkipWelcomeSetting (enabled) {
		if (w.localStorage) {
			if (enabled) w.localStorage.setItem('pk_skip_welcome', '1');
			else w.localStorage.removeItem('pk_skip_welcome');
		}

		if (ipcRenderer) {
			return ipcRenderer.invoke('set-setting', 'pk_skip_welcome', enabled ? '1' : null).catch(function () {
				return false;
			});
		}

		return Promise.resolve(true);
	}

	var Wlc = function () {
		var body_str = 'Tips:<br/>Please keep in mind that most key shortcuts rely on the <strong>Shift + key</strong> combo. (eg Shift+Z for undo, Shift+C copy, Shift+X cut... etc )<br/><br/>';
		var isDesktopApp = !!PKAE.isDesktopApp;
		var intro = '';
		var followup = '';

		if (PKAE.isMobile) {
			body_str = 'Tips:<br/>Please make sure your device is not in silent mode. You might need to physically flip the silent switch. '+
			'<img src="img/phone-switch.jpg" style="max-width:224px;max-height:126px;width:40%;margin: 10px auto; display: block;"/>'+
			'<br/><br/>';
		}

		if (isDesktopApp) {
			intro = '<strong>RECwerk</strong> is a native desktop evolution of the <a href="https://github.com/pkalogiros/audiomass" target="_blank" style="color:#99FF00">AudioMass</a> engine by Pantelis Kalogiros.<br /><br />'+
				'It runs natively on your system with low-latency audio, real-time monitoring, and a classic Syntrillium-inspired interface.';
			followup = 'You can load any common audio format and perform operations such as fade in, cut, trim, change the volume, and apply a plethora of real-time audio effects.<br/><br/>';
		} else {
			intro = '<strong>RECwerk Web</strong> brings the RECwerk waveform editor into the browser for quick editing, sample playback, and restoration tests.<br /><br />'+
				'Use it to open local audio and preview the RECwerk workflow before moving to the native desktop builds.';
			followup = 'For recording, portable desktop builds, and the full native workflow, use the Linux, Windows, or macOS releases from GitHub.<br/><br/>';
		}

		var md = new PKSimpleModal({
			title: '<font style="font-size:15px">Welcome to ' + (isDesktopApp ? 'RECwerk' : 'RECwerk Web') + '</font>',
			ondestroy: function( q ) {
				PKAE.ui.InteractionHandler.on = false;
				PKAE.ui.KeyHandler.removeCallback ('modalTemp');

				var cb = q.el_body.querySelector('#pk_skip_welcome_cb');
				setSkipWelcomeSetting(!!(cb && cb.checked));
			},
			body:'<div style="overflow:auto;-webkit-overflow-scrolling:touch;max-width:580px;width:calc(100vw - 40px);max-height:calc(100vh - 340px);min-height:110px;font-size:13px; color:#95c6c6;padding-top:7px;">'+
				'<img src="img/logo.svg" style="width:100%; max-width:400px; margin: 0 auto 20px auto; display: block;" />' +
				intro +
				'<br/><br/><br/>'+
				body_str+
				followup +
				'<div style="margin-top:20px; color:#fff; font-weight:normal; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 4px;">' +
				'<input type="checkbox" id="pk_skip_welcome_cb" style="vertical-align: middle; margin-right: 8px; cursor:pointer;" /> ' +
				'<label for="pk_skip_welcome_cb" style="vertical-align: middle; cursor:pointer; user-select: none;">Don\'t show this again</label></div>'+
				'</div>',
			setup:function( q ) {
				PKAE.ui.InteractionHandler.checkAndSet ('modal');
				PKAE.ui.KeyHandler.addCallback ('modalTemp', function ( e ) {
					q.Destroy ();
				}, [27]);

				// Direct opslaan bij klikken
				setTimeout(function() {
					var skip_el = q.el_body.querySelector('#pk_skip_welcome_cb');
					if (skip_el) {
						getSkipWelcomeSetting().then(function (enabled) {
							skip_el.checked = !!enabled;
						});

						skip_el.onclick = function() {
							setSkipWelcomeSetting(this.checked);
						};
					}
				}, 50);

				var scroll = q.el_body.getElementsByTagName('div')[0];
				scroll.addEventListener ('touchstart', function(e){ e.stopPropagation (); }, false);
				scroll.addEventListener ('touchmove', function(e){ e.stopPropagation (); }, false);
			}
		});
		md.Show ();
		document.getElementsByClassName('pk_modal_cancel')[0].innerHTML = '&nbsp; &nbsp; &nbsp; OK &nbsp; &nbsp; &nbsp;';
	};

	PKAE._deps.Wlc = Wlc;

	// Start de welcome screen als er geen skip-vinkje is
	setTimeout(function () {
		getSkipWelcomeSetting().then(function (skip) {
			if (skip) return ;
			Wlc ();
		});
	}, 500);

})( window, document, PKAudioEditor );
