# RECwerk

RECwerk is a native-first waveform and audio editor for Linux, Windows, macOS, and the web. It takes the fast editing core of **AudioMass**, wraps it in a Syntrillium-inspired desktop interface, and adds the workflow features needed for practical restoration, capture, and quick destructive editing.

Live web version:
https://flarkflarkflark.github.io/RECwerk/

## Features

- Native Electron desktop app with a matching static web build
- Fast stereo and mono waveform editing
- Real-time recording with monitoring controls
- Real-time FX preview for EQ, compression, delay, reverb, bitcrusher, chorus, and more
- Vinyl click detection and removal workflow
- WAV, MP3, OGG, FLAC, AIFF support
- Recent files, RECwerk project saves, local drafts, and direct export
- Clickable selection timing fields for precise edits

## Getting Started

### Desktop development

```bash
npm install
env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron .
```

### Static web version

```bash
python3 -m http.server 8080
```

Then open:
`http://localhost:8080`

## Release Targets

RECwerk is configured for single-file or drag-and-run style distribution:

- Linux: `AppImage`
- Windows: `portable`
- macOS: `zip`

Build commands:

```bash
npm run build:linux
npm run build:win
npm run build:mac
```

Notes:

- Linux builds locally on Linux.
- Windows builds are intended to run in CI on Windows runners.
- macOS builds should run on macOS. electron-builder documents that macOS builds and signing are macOS-only.

## GitHub Pages and Releases

This repository includes GitHub Actions workflows for:

- Deploying the static app to GitHub Pages
- Building tagged releases for Linux, Windows, and macOS

Tag a release with:

```bash
git tag v1.0.0
git push origin main --tags
```

The release workflow will build platform artifacts and attach them to the GitHub release automatically.

## Credits

RECwerk is developed by **flarkAUDIO**.

The editing engine is based on **AudioMass**, originally created by **Pantelis Kalogiros**. RECwerk extends that foundation into a desktop-oriented toolchain while preserving the fast, direct editing model that made AudioMass compelling in the browser.
