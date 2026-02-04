# Application Architecture

## Overview
Control is an agentic AI application built with Electron. It provides two main modes: **Ask** (informational) and **Act** (automation). It features voice activation, text-to-speech, and desktop automation.

## Core Components

### 1. Main Process (`src/main/main.js`)
The backbone of the application. It manages:
- **Window Lifecycle**: Handled by `WindowManager`.
- **Global Hotkeys**: Managed by `HotkeyManager`.
- **Security & PIN**: Managed by `SecurityManager`.
- **Backend Execution**: Orchestrated by `BackendManager`.
- **Voice Activation**: Handled by `WakewordManager`.

### 2. Backends (`src/main/backends/`)
- **Ask Backend (`ask-backend.js`)**: Uses Gemini to answer questions, analyze screenshots, and run read-only system commands.
- **Act Backend (`act-backend.js`)**: Uses Gemini and `nut-js` to perform GUI automation (clicks, typing, drags).
- **Firebase Service (`firebase-service.js`)**: Handles authentication, user stats, rate limiting, and API key management (including rotation).

### 3. Voice & Audio
- **Wake Word Detection**: Uses Picovoice Porcupine and PvRecorder.
- **Speech-To-Text (STT)**: Uses a local Vosk server (Python-based) connected via WebSockets for real-time streaming.
- **Text-To-Speech (TTS)**: Uses `edge-tts` (Python) via a Node.js bridge for high-quality voice responses.

### 4. Renderer Process (`src/renderer/`)
- **Chat Window**: The primary user interface. Handles message history, file attachments, and voice recording.
- **Main Overlay**: A transparent, always-on-top window that hosts the floating button and visual effects (edge glow).
- **Settings Modal**: Allows users to customize hotkeys, voice settings, and security.

## Communication Flow

1. **User Input**: User types a message or speaks the wake word.
2. **IPC Trigger**: The renderer sends an `execute-task` event to the Main process.
3. **Backend Manager**: Forwards the task to either `AskBackend` or `ActBackend`.
4. **AI Processing**: The backend calls Gemini API. If a quota error occurs, `FirebaseService` rotates the API key.
5. **Execution Loop**:
   - In **Ask** mode: AI may request screenshots or system info.
   - In **Act** mode: AI generates actions (clicks, etc.), which are executed via `nut-js` and verified with screenshots.
6. **Feedback**: Results are sent back to the renderer via IPC for display and spoken via TTS.

## Data Persistence
- **Local Settings**: Stored in `userData/settings.json`.
- **User Cache**: Stored in `userData/cached_user.json`.
- **API Keys**: Cached in `userData/api_keys.json` after being fetched from Firebase.
- **Logs**: `backend-manager.log`, `wakeword.log`, and `firebase.log` in the `userData` folder.

## Production Troubleshooting

### 1. Database/Firebase Issues
If you see "Database connection failed" or connection errors:
- Ensure `firebase-service-account.json` is present in the `resources/config` folder of your installation.
- The application now searches multiple locations (Resources, AppPath, UserData) for the service account.
- Check `firebase.log` in `userData` for detailed path discovery logs.
- The app features local fallback for rate limiting and API keys if Firebase is unreachable.

### 2. Wake Word / Picovoice Issues
If the wake word is not detected or the key is reported as invalid:
- Check `wakeword.log` for initialization errors.
- Ensure a microphone is connected and recognized by the OS.
- If running the executable, ensure native modules are correctly unpacked in `app.asar.unpacked`.

### 3. Stuck "Thinking"
If the app gets stuck on "Thinking":
- Check the status bar for error messages.
- The UI is designed to clear the thinking state on any backend error (see `onBackendError` in `chat-window.js`).
- Key rotation happens automatically on 429 errors to help recover from quota limits.
