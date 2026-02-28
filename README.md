# RECwerk
**Powerful native desktop audio and waveform editor.**

RECwerk is a high-performance audio editing suite for Linux, Windows, and macOS. It is a native desktop evolution of the brilliant **AudioMass** engine, modernized with a classic Syntrillium-inspired aesthetic and expanded with professional features like real-time monitoring and stereo recording.

**Live Web Version:** [https://flarkflarkflark.github.io/RECwerk/](https://flarkflarkflark.github.io/RECwerk/)

---

## :: Features ::
*   **Native Desktop Experience**: Fast, low-latency performance using Electron.
*   **Syntrillium Aesthetic**: A classic look-and-feel inspired by Cool Edit Pro 2.1.
*   **Advanced Recording**: Support for Mono/Stereo recording with real-time hardware monitoring (up to 200% volume).
*   **Real-time FX Preview**: Listen to effects (Reverb, Compressor, EQ, Chorus, Bitcrusher) live before applying them.
*   **Vinyl Restoration**: Integrated click and pop removal tools for audio cleanup.
*   **Multi-format Support**: Native handling of WAV, MP3, OGG, FLAC, and AIFF.
*   **Interactive UI**: Clickable selection values for precise timing adjustments.

---

## :: Getting Started ::

### 1. Running the Native App (Linux/Arch)
1. Clone this repository.
2. Ensure you have Electron installed (`sudo pacman -S electron`).
3. Run the launcher: `./RECwerk`.

### 2. Running Locally (Web Version)
1. Navigate to the project root.
2. Run a simple web server:
   *   Python: `python3 -m http.server 8080`
   *   Go: `go run tools/recwerk-server.go`
3. Navigate to `http://localhost:8080` in your browser.

---

## :: Building & Publishing ::

RECwerk uses **electron-builder** for packaging native applications.

```bash
# Install dependencies
npm install

# Build for Windows
npm run build:win

# Build for Linux (AppImage)
npm run build:linux

# Build for macOS (Requires a Mac)
npm run build:mac
```

---

## :: Credits & Story ::

RECwerk is developed by **flarkAUDIO**. 

The soul of this project is based on the **AudioMass** engine, originally created by **Pantelis Kalogiros**. We stand on the shoulders of giants and honor his philosophy of creating fast, efficient, and dependency-free audio tools. RECwerk takes this vision "out of the browser tab" and delivers it as a true desktop DAW.

---
*RECwerk - Professional Audio, Native Speed.*
