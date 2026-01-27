# Codebase Analysis: Control Rebuild v2

## Overview
Control is a high-performance, AI-powered desktop application designed for GUI automation, task execution, and intelligent assistance. It allows users to control their computer using natural language (text or voice), powered by Google's Gemini AI.

## Project Structure

### 1. Root Directory
- `act_backend.py`: The core automation engine. Handles complex task planning, coordinate calculation, and execution using PyAutoGUI and Gemini.
- `ask_backend.py`: The information retrieval engine. Handles queries, screen analysis (for information), and system status checks.
- `vosk_server_v2.py`: A local WebSocket server for Speech-to-Text (STT) using the Vosk engine.
- `requirements.txt` & `vosk-requirements.txt`: Python dependencies for the backends.
- `package.json`: Node.js configuration and dependencies for the Electron frontend.

### 2. `src/main/` (Electron Main Process)
This directory contains the "brain" of the desktop application, managing window lifecycles, system integration, and communication with the backends.
- `main.js`: Entry point. Initializes all managers and sets up IPC handlers.
- `window-manager.js`: Handles creation, visibility, and properties of various app windows (Chat, Overlay, Settings, etc.).
- `backend-manager-fixed.js`: Orchestrates the Python backend processes, handles request/response flow, and manages attachments.
- `security-manager-fixed.js`: Manages the 4-digit PIN system, encryption, and application locking mechanism.
- `wakeword-manager.js`: Manages the lifecycle of the wake word detection process.
- `vosk-server-manager.js`: Manages the local Vosk STT server.
- `edge-tts.js`: Integration with Microsoft Edge TTS for high-quality voice responses.
- `hotkey-manager.js`: Registers and manages global system hotkeys (e.g., `Ctrl+Space`).
- `settings-manager.js`: Persists and retrieves user configuration.
- `firebase-service.js`: Handles interaction with Firebase for user authentication and rate limiting.

### 3. `src/renderer/` (Frontend UI)
Contains the user interface components.
- `main-overlay.html`: The floating bubble/button that remains on top.
- `chat-window.html/js`: The primary interaction interface for text and voice commands.
- `entry-window.html/js`: The authentication/login screen.
- `settings-modal.html/js`: Configuration interface for security, voice, and system settings.

### 4. `src/preload/` (Security Layer)
Preload scripts that bridge the gap between the isolated renderer processes and the main process using `contextBridge`.

### 5. `assets/`
- `wakeword/`: Contains the Porcupine wake word model (`.ppn`) and a Python helper script.
- `icons/`: Application icons in various formats.
- `vosk-model/` (Expected to exist): The acoustic model for speech recognition.

### 6. `website/`
A web-based dashboard for user management, subscription tracking, and documentation.

## Software Functionality

### Core Modes
1. **Act Mode**: Specifically for executing actions on the computer. It takes a screenshot, analyzes it, creates a plan, and executes actions (click, type, drag, etc.) with verification.
2. **Ask Mode**: For general questions or analysis of the current screen state without performing system actions.

### Voice Interaction
- **Wake Word**: Users can say "Computer" (default) to activate the assistant.
- **STT**: Uses a local Vosk server for real-time transcription.
- **TTS**: Uses Edge TTS to speak back to the user.

### Security
- **Overlay Protection**: The app can be made "invisible" to screen recording.
- **PIN Lock**: Secure access to the assistant's capabilities.

### Automation Workflow
1. User provides input (Text/Voice).
2. `BackendManager` routes the request to the appropriate backend.
3. Backend (Python) processes the request using Gemini API.
4. If in **Act Mode**, the backend executes system calls via PyAutoGUI.
5. Response is sent back to the Electron frontend via stdout (JSON).
6. UI updates and voice response is played.

## Summary
The software is a sophisticated integration of Electron for a modern, transparent UI and Python for powerful, AI-driven system automation. The modular design separates concerns like window management, security, and AI processing, allowing for a robust and extensible platform.
