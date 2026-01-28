# Conversion and Reintegration Report: Python to JavaScript

This report details the "surgery" performed to convert the core Python backends into native JavaScript modules within the Control application.

## 1. Backend Conversions

### `ask_backend.py` → `src/main/backends/ask-backend.js`
- **Library Replacements**:
    - `google.generativeai` → `@google/generative-ai`
    - `mss` → `screenshot-desktop`
    - `subprocess` → `child_process.exec`
- **Functional Reintegration**:
    - Preserved the system prompt and dual-mode capability (Chat and System Analysis).
    - Reimplemented the screenshot and command request logic using native Node.js asynchronous patterns.
    - Preserved the 5-iteration loop for deep analysis.
    - Added dynamic API key support via `dotenv` and request-time overrides.

### `act_backend.py` → `src/main/backends/act-backend.js`
- **Library Replacements**:
    - `pyautogui` → `@computer-use/nut-js`
    - `mss` → `screenshot-desktop`
    - `google.generativeai` → `@google/generative-ai`
    - `Pillow (PIL)` → `jimp`
    - `pyperclip` → `clipboardy`
- **Functional Reintegration**:
    - Preserved the extensive `SYSTEM_PROMPT` for high-performance automation.
    - Reimplemented coordinate mapping and action execution (click, type, drag, etc.).
    - Ported the `ActionVerifier` logic to verify successes using screenshots and Gemini.
    - Integrated the recovery strategy for failed steps.

### `wakeword_helper.py` → `src/main/backends/wakeword-helper.js`
- **Library Replacements**:
    - `pvporcupine` → `@picovoice/porcupine-node`
    - `pyaudio` → `@picovoice/pvrecorder-node` (native high-performance audio capture)
- **Functional Reintegration**:
    - Maintained compatibility with the existing `.ppn` model.
    - Streamlined the detection loop using `pvrecorder` for efficient, non-blocking audio capture without system-level dependencies like `sox`.
    - Implemented a 1.5s detection cooldown to ensure stable "always-on" listening.

## 2. Reintegration into Electron

### `BackendManager` Refactor
- **Old Approach**: Spawned separate Python processes and communicated via JSON over stdin/stdout.
- **New Approach**: Direct instantiation of JavaScript classes.
- **Benefits**:
    - Lower memory overhead (no need for separate Python interpreters).
    - Faster communication (direct method calls instead of string serialization/deserialization over pipes).
    - Unified error handling within the Node.js event loop.
    - Shared environment variables and configuration (integrated `dotenv`).

### `WakewordManager` Refactor
- **Old Approach**: Monitored a Python helper process.
- **New Approach**: Uses the `WakewordHelper` module directly.
- **Benefits**:
    - More reliable microphone access.
    - Faster detection-to-UI response time.

### `edge-tts.js` Refactor
- **Old Approach**: Generated and spawned temporary Python scripts to use the `edge-tts` Python library.
- **New Approach**: Uses a robust Node-to-Python bridge for the `edge-tts` library to resolve WebSocket connection issues found in native JS alternatives, while using system-native players (PowerShell, afplay, paplay) for playback.
- **Benefits**: Reliable connectivity, high-quality audio generation, and reduced disk I/O.

## 3. Workflow Preservation
Every functional prompt, action type, and verification method from the original Python code has been accurately represented in the JavaScript version. The transition is transparent to the user, as the IPC events sent to the frontend remain identical.
