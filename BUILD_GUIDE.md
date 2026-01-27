# Building and Bundling Control

This guide explains how to bundle the Control application into a standalone executable.

## Prerequisites

1.  **Node.js & npm**: Ensure you have Node.js installed.
2.  **Python 3.10+**: Required for the Vosk STT server and EdgeTTS bridge.
3.  **Dependencies**:
    -   `pip install vosk websockets edge-tts`
    -   `npm install`

## Bundling with Electron Builder

The project is configured to use `electron-builder` for packaging.

### 1. Development Build (Test before bundling)
```bash
npm start
```

### 2. Package for your current platform
```bash
npm run pack
```
This generates an unpacked version of the app in the `dist/` folder.

### 3. Create a distributable installer
```bash
npm run dist
```
This will create an installer (e.g., `.exe` for Windows, `.dmg` for macOS, `.deb/AppImage` for Linux) in the `dist/` folder.

## Special Considerations for Python Dependencies

The application relies on a local Python environment for two specific features:
1.  **Vosk STT Server**: `vosk_server_v2.py`
2.  **EdgeTTS**: Used via a bridge in `src/main/edge-tts.js`

### Strategy A: System Python (Recommended for simplicity)
The bundled app will attempt to find `python` or `python3` on the user's system path. Ensure the user has the required packages installed:
```bash
pip install vosk websockets edge-tts
```

## Important: Environment Variables (.env)

The application requires API keys (like `GEMINI_API_KEY` and `PORCUPINE_ACCESS_KEY`) to function correctly. When bundled as an executable, the app searches for a `.env` file in the following locations:

1.  **Next to the executable**: Place your `.env` file in the same folder as `Control.exe` (Windows) or the app bundle (macOS/Linux).
2.  **App Data folder**: `%APPDATA%/Control/.env` (Windows) or `~/.config/Control/.env` (Linux).

If the backends (Act/Ask) are "thinking" forever, it usually means the `.env` file is missing or the API key is invalid.

### Automated Key Management (Firebase)

The application now supports fetching API keys directly from Firebase. If keys are found in the Firebase `config/api_keys` document, they will be fetched on startup and cached locally in `api_keys.json` in the user data folder.

To upload your keys to Firebase once, you can use the provided script:
```bash
node scripts/upload-keys.js YOUR_GEMINI_KEY YOUR_PORCUPINE_KEY
```

### Strategy B: Bundling Python (Advanced)
If you wish to bundle a portable Python environment with the app:
1.  Download a portable Python distribution.
2.  Place it in the `extraResources` directory (defined in `package.json`).
3.  Update `src/main/vosk-server-manager.js` and `src/main/edge-tts.js` to point to the bundled executable relative to `process.resourcesPath`.

## Vosk Model
Ensure the Vosk acoustic model is placed in `assets/vosk-model/` before bundling. `electron-builder` is configured to include the `assets` folder in the `extraResources`.

## Build Scripts in `package.json`
-   `npm run dev`: Starts Electron in development mode.
-   `npm run build`: Placeholder for full build pipeline.
-   `npm run dist`: Full packaging and installer generation.
