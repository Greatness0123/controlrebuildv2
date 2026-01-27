# Backend Interactions Mapping: Control Rebuild v2

This document maps how the Python backend scripts interact with other components and assets within the application.

## 1. `act_backend.py` (The Executor)

### Interactions with Electron (via `BackendManager`)
- **Communication Channel**: Standard I/O (stdin/stdout).
- **Inbound (stdin)**:
    - `execute_task`: Receives task text and file attachments.
    - `cancel_task`: Receives signal to stop execution.
- **Outbound (stdout)**:
    - `action_start`: Notifies UI that a step is beginning.
    - `action_step`: Sends progress updates for multi-step tasks.
    - `action_complete`: Notifies UI of step success/failure.
    - `ai_response`: Sends final text response from the AI.
    - `task_start` / `task_complete`: Lifecycle events for the entire user request.
    - `error`: Reports backend exceptions.

### Interactions with System Assets & Elements
- **Screen Capture**: Uses `mss` library to capture the primary monitor.
- **Input Simulation**: Uses `pyautogui` to move mouse, click, type, and press hotkeys.
- **Clipboard**: Uses `pyperclip` to read/write to the system clipboard.
- **Terminal**: Spawns `subprocess` to execute shell/PowerShell commands.
- **File System**:
    - Reads from `tmp/` for attachments sent by the frontend.
    - Writes/Deletes screenshots in `screenshots/` directory.
- **Gemini API**: Communicates with Google's Generative AI over HTTPS.

---

## 2. `ask_backend.py` (The Consultant)

### Interactions with Electron (via `BackendManager`)
- **Communication Channel**: Standard I/O (stdin/stdout).
- **Inbound (stdin)**:
    - `ask_question`: Receives query and attachments.
- **Outbound (stdout)**:
    - `ai_response`: Sends text response.
    - `error`: Reports issues.

### Interactions with System Assets & Elements
- **Screen Capture**: Uses `mss` to take screenshots when the AI requests observation.
- **Terminal**: Executes read-only commands (e.g., `tasklist`, `pmset`) via `subprocess` to gather system context.
- **Gemini API**: Sends text and image data for analysis.

---

## 3. `wakeword_helper.py` (The Listener)

### Interactions with Electron (via `WakewordManager`)
- **Communication Channel**: Standard I/O (stdout).
- **Outbound (stdout)**:
    - `WAKEWORD_HELPER_STARTED`: Confirmation of successful initialization.
    - `DETECTED`: Signal sent when the "Computer" wake word is heard.
    - `PORCUPINE_MISSING`: Error signal if dependencies are not met.

### Interactions with System Assets & Elements
- **Audio Hardware**: Uses `pyaudio` to open a stream from the default microphone.
- **Porcupine Engine**: Uses the Picovoice Porcupine library to process audio buffers.
- **Model File**: Loads `assets/wakeword/hey-control_en_windows_v4_0_0.ppn`.

---

## 4. Interaction Summary Table

| Component | Language | Library Equivalent (JS) | Primary Interaction |
| :--- | :--- | :--- | :--- |
| **Automation** | Python (`pyautogui`) | `nut-js` or `robotjs` | System Input |
| **Screen Capture** | Python (`mss`) | `screenshot-desktop` or `nut-js` | System Output |
| **AI Integration** | Python (`google-generativeai`) | `@google/generative-ai` | Network |
| **Wake Word** | Python (`pvporcupine`) | `@picovoice/porcupine-node` | Audio Input |
| **STT Server** | Python (`vosk`) | *N/A (Excluded from conversion)* | WebSocket |

---

## Functional Flow Mapping
1. **Request**: `ChatWindow.js` (Renderer) → `main.js` (Main) → `BackendManager.js` (Main).
2. **Processing**: `BackendManager.js` → `act_backend.py` (Python).
3. **Observation**: `act_backend.py` → `mss` (Screenshot) → `Gemini` (Analysis).
4. **Execution**: `act_backend.py` → `pyautogui` (Action) → System.
5. **Verification**: `act_backend.py` → `mss` (New Screenshot) → `Gemini` (Verify).
6. **Reporting**: `act_backend.py` → stdout → `BackendManager.js` → IPC → `ChatWindow.js`.
