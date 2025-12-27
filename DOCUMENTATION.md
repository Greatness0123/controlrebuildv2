# Control - Comprehensive Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [API Documentation](#api-documentation)
6. [Security](#security)
7. [Troubleshooting](#troubleshooting)
8. [Development Guide](#development-guide)
9. [Deployment](#deployment)

## Overview

Control is an advanced AI-powered desktop application that enables users to control their computer through natural language commands, voice input, and intelligent automation. The application combines a Python backend for computer control with an Electron frontend for a modern user interface.

### Key Features

- **Natural Language Control**: Execute computer tasks using conversational commands
- **Voice Input**: Full voice control with transcription and wake word detection
- **Visual Feedback**: Real-time task progress with visual effects
- **Security**: PIN protection and Windows invisibility features
- **Web Dashboard**: User management and subscription system

## Architecture

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Dashboard │    │   Electron App  │    │  Python Backend │
│                 │    │                 │    │                 │
│ • User Auth     │◄──►│ • Main Window   │◄──►│ • AI Processing │
│ • User ID System│    │ • Chat UI       │    │ • Computer Ctrl │
│ • Plans/ billing│    │ • Settings      │    │ • Screenshot    │
│                 │    │ • Security      │    │ • Verification  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Component Breakdown

#### Backend (Python)
- **AI Processing**: Google Generative AI for understanding commands
- **Computer Vision**: Screen analysis and UI element detection
- **Action Execution**: Mouse, keyboard, and application control
- **Verification**: Real-time verification of completed actions

#### Frontend (Electron)
- **Main Process**: Application lifecycle and system integration
- **Renderer Process**: User interface and interactions
- **IPC Communication**: Secure frontend-backend communication
- **Window Management**: Advanced window handling system

#### Web Dashboard
- **User Management**: Registration, authentication, and profiles
- **Database**: Firebase integration (dummy implementation)
- **Subscription System**: Free and Pro plan management

## Installation

### System Requirements

- **Operating System**: Windows 10+, macOS 10.14+, or Ubuntu 18.04+
- **Node.js**: Version 16.0 or higher
- **Python**: Version 3.8 or higher
- **Memory**: Minimum 4GB RAM (8GB recommended)
- **Storage**: 500MB available space

### Step-by-Step Installation

#### 1. Prerequisites Setup

**Node.js Installation:**
```bash
# Download and install from https://nodejs.org
# Verify installation
node --version
npm --version
```

**Python Installation:**
```bash
# Windows: Download from python.org
# macOS: brew install python3
# Ubuntu: sudo apt install python3 python3-pip

# Verify installation
python --version
pip --version
```

#### 2. Application Setup

```bash
# Clone the repository
git clone <repository-url>
cd Control

# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

#### 3. Backend Configuration

Create `requirements.txt`:
```txt
google-generativeai
pillow
mss
pyperclip
pyautogui
python-dotenv
```

#### 4. Environment Configuration

Create `.env` file:
```env
# Google AI Configuration
GOOGLE_API_KEY=your_google_api_key_here

# Application Settings
DEBUG=false
LOG_LEVEL=INFO

# Security Settings
ENABLE_PIN_PROTECTION=true
DEFAULT_PIN=1234

# Voice Settings
ENABLE_VOICE_ACTIVATION=true
WAKE_WORD=Computer
```

## Configuration

### Application Settings

#### Main Configuration (`src/main/config.js`)

```javascript
module.exports = {
    app: {
        name: 'Control',
        version: '1.0.0',
        isDevelopment: process.env.NODE_ENV === 'development'
    },
    
    windows: {
        main: {
            transparent: true,
            alwaysOnTop: true,
            skipTaskbar: true
        },
        chat: {
            width: 400,
            height: 600,
            resizable: true
        }
    },
    
    hotkeys: {
        toggleChat: 'CommandOrControl+Space',
        stopTask: 'Alt+Z',
        toggleInteraction: 'CommandOrControl+Shift+I'
    },
    
    security: {
        enablePinProtection: true,
        pinLength: 4,
        maxAttempts: 3
    }
};

#### Wake-word / Voice Activation

We recommend using a local wake-word engine for voice activation to keep audio processing private and responsive. Two common options are:

- Picovoice / Porcupine (Picovoice): lightweight, low-latency wake-word detection, can run locally on Windows, macOS and Linux. Requires integration via the Picovoice SDK and a wake-word model file. Be sure to review licensing and distribution terms.
- VOSK / VAD + keyword spotting: open-source alternative using a voice-activity-detector and keyword spotting model. Larger footprint but fully open-source.

Implementation notes:

- The frontend should run a small native process or Node native addon to listen for the wake word and notify the main process when detected. This avoids passing audio to external services by default.
- When wake-word is enabled, the settings should block voice capture until the user has unlocked the app with the security PIN (if enabled), to prevent accidental recording.
- Document how to add a wake-word model (e.g., a .ppn file for Picovoice) and where to place it in the app resources.

```

#### Backend Configuration

```python
# backend_config.py
import os

class Config:
    # AI Configuration
    GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
    MODEL_NAME = 'gemini-pro'
    
    # Computer Vision
    SCREENSHOT_QUALITY = 95
    ANALYSIS_TIMEOUT = 30
    
    # Action Verification
    VERIFICATION_TIMEOUT = 10
    RETRY_ATTEMPTS = 3
    
    # Security
    ENABLE_LOGGING = True
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
```

### Security Configuration

#### PIN Protection

```javascript
// Security settings
const securityConfig = {
    pinProtection: {
        enabled: true,
        minLength: 4,
        maxLength: 4,
        maxAttempts: 3,
        lockoutDuration: 300000 // 5 minutes
    },
    
    invisibility: {
        enabled: true,
        hideFromScreenshots: true,
        hideFromScreenRecording: true,
        hideFromScreenSharing: true
    }
};
```

## API Documentation

### Frontend-Backend Communication

#### Message Protocol

All communication between frontend and backend uses structured JSON messages:

```javascript
// Task Request
{
    "type": "task_request",
    "query": "string",
    "context": {
        "user_id": "string",
        "session_id": "string",
        "timestamp": "ISO8601"
    }
}

// AI Response
{
    "type": "ai_response",
    "text": "string",
    "is_action": boolean,
    "confidence": number,
    "suggestions": ["string"]
}

// Action Start
{
    "type": "action_start",
    "action_id": "string",
    "description": "string",
    "estimated_duration": number
}

// Action Complete
{
    "type": "action_complete",
    "action_id": "string",
    "success": boolean,
    "details": "string",
    "verification": {
        "method": "string",
        "result": "boolean"
    }
}
```

#### IPC API

**Main Process API:**
```javascript
// Window Management
ipcMain.handle('show-window', (event, windowType) => { ... });
ipcMain.handle('hide-window', (event, windowType) => { ... });
ipcMain.handle('toggle-chat', () => { ... });

// Security
ipcMain.handle('verify-pin', (event, pin) => { ... });
ipcMain.handle('enable-security-pin', (event, enabled) => { ... });

// Backend Control
ipcMain.handle('execute-task', async (event, task) => { ... });
ipcMain.handle('stop-task', () => { ... });
```

**Renderer API (via preload):**
```javascript
// Chat Window
window.chatAPI = {
    executeTask: (task) => ipcRenderer.invoke('execute-task', task),
    stopTask: () => ipcRenderer.invoke('stop-task'),
    onAIResponse: (callback) => ipcRenderer.on('ai-response', callback)
};

// Settings Window
window.settingsAPI = {
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings'),
    verifyPin: (pin) => ipcRenderer.invoke('verify-pin', pin)
};
```

### Backend Action API

#### Supported Actions

```python
# Screenshot Action
{
    "action": "screenshot",
    "parameters": {
        "region": {"x": 0, "y": 0, "width": 1920, "height": 1080},
        "quality": 95
    },
    "verification": {
        "expected_outcome": "Screenshot captured successfully",
        "verification_method": "file_check",
        "success_indicators": ["screenshot_file_exists"]
    }
}

# Click Action
{
    "action": "click",
    "parameters": {
        "x": 100,
        "y": 200,
        "button": "left",
        "double_click": false
    },
    "verification": {
        "expected_outcome": "UI element clicked",
        "verification_method": "visual",
        "success_indicators": ["button_pressed", "window_opened"]
    }
}

# Type Action
{
    "action": "type",
    "parameters": {
        "text": "Hello World",
        "speed": 0.1
    },
    "verification": {
        "expected_outcome": "Text typed successfully",
        "verification_method": "text_check",
        "success_indicators": ["text_appears_in_target"]
    }
}
```

## Security

### Security Features

#### 1. PIN Protection

```javascript
// PIN Implementation
class SecurityManager {
    async setPin(pin) {
        // Validate PIN format
        if (!/^\d{4}$/.test(pin)) {
            throw new Error('PIN must be 4 digits');
        }
        
        // Hash and store PIN
        const hash = crypto.createHash('sha256').update(pin).digest('hex');
        await this.storePinHash(hash);
        
        return { success: true };
    }
    
    async verifyPin(inputPin) {
        const storedHash = await this.getStoredPinHash();
        const inputHash = crypto.createHash('sha256').update(inputPin).digest('hex');
        return inputHash === storedHash;
    }
}
```

#### 2. Windows Invisibility

Windows provides some APIs and techniques to reduce the chance that an overlay is included in ordinary screen-capture or screen-recording workflows, but there is **no 100% reliable** way to prevent capture in all cases (drivers, OS versions and privileged capture tools can bypass protections). Use these features responsibly and disclose behavior to users.

Recommended practices (Windows):

- Use a frameless, transparent, always-on-top overlay and control click-through behavior (already implemented in `WindowManager.createMainWindow`).
- Use native Windows API `SetWindowDisplayAffinity` (WDA_MONITOR) to signal the OS to exclude the window from most screen capture APIs. This requires a small native helper or Node native addon to call from Electron (cannot be done directly from JS).
- Keep sensitive UI content minimal and document limitations clearly.

Example (conceptual):

```c
// C/C++ helper: call SetWindowDisplayAffinity(hwnd, WDA_MONITOR)
// Build as a small helper executable or native addon and call it when the overlay starts.
```

Ethics & compliance:

- Do not use invisibility features to hide malicious behavior. Only use for legitimate UX goals with user consent.
- Document the feature in privacy documentation and allow users to disable it.


#### 3. Secure IPC

```javascript
// Secure IPC Implementation
const secureIpc = {
    allowedChannels: [
        'execute-task',
        'verify-pin',
        'show-window'
    ],
    
    validateChannel(channel) {
        return this.allowedChannels.includes(channel);
    },
    
    sanitizeData(data) {
        // Remove sensitive information
        const sanitized = { ...data };
        delete sanitized.password;
        delete sanitized.pin;
        return sanitized;
    }
};
```

### Security Best Practices

1. **PIN Management**
   - Use strong PINs (avoid 1234, 0000)
   - Change PINs regularly
   - Enable PIN lockout after failed attempts

2. **Data Protection**
   - All sensitive data encrypted at rest
   - Secure IPC communication
   - No data sent to external servers

3. **System Security**
   - Principle of least privilege
   - Regular security updates
   - Audit logging for all actions

## Troubleshooting

### Common Issues and Solutions

#### 1. Application Won't Start

**Symptoms:**
- Application window doesn't appear
- Error messages on startup
- Process exits immediately

**Solutions:**
```bash
# Check Node.js version
node --version  # Should be 16+

# Check Python version
python --version  # Should be 3.8+

# Verify dependencies
npm list
pip list

# Check permissions
# On Windows: Run as administrator
# On macOS: Allow in Security & Privacy
# On Linux: Check file permissions
```

#### 2. Backend Not Responding

**Symptoms:**
- Commands not executing
- No responses from AI
- Timeout errors

**Solutions:**
```bash
# Check Python backend
python backend_modified.py --test

# Verify API keys
echo $GOOGLE_API_KEY

# Check logs
tail -f control.log

# Restart backend
npm run restart-backend
```

#### 3. Voice Input Not Working

**Symptoms:**
- Microphone button not responding
- No transcription
- Wake word not detected

**Solutions:**
```javascript
// Check microphone permissions
navigator.permissions.query({ name: 'microphone' })
    .then(result => {
        console.log('Microphone permission:', result.state);
    });

// Test audio input
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
// Check stream properties
```

#### 4. Hotkeys Not Working

**Symptoms:**
- Global hotkeys not responding
- Conflicts with other applications
- Inconsistent behavior

**Solutions:**
```javascript
// Check registered hotkeys
const registered = globalShortcut.isRegistered('CommandOrControl+Space');
console.log('Hotkey registered:', registered);

// Re-register hotkeys
hotkeyManager.unregisterAll();
hotkeyManager.setupHotkeys();
```

### Debug Mode

Enable comprehensive debugging:

```bash
# Environment variables
export DEBUG=true
export LOG_LEVEL=debug

# Run with debug flags
npm run dev -- --debug --verbose

# Backend debug
python backend_modified.py --debug --log-level DEBUG
```

### Log Analysis

**Application Logs:**
```bash
# View main logs
tail -f logs/app.log

# View backend logs
tail -f control.log

# Error logs
tail -f logs/error.log
```

**Log Formats:**
```
2024-01-15 10:30:45 - INFO - [MAIN] - Application started
2024-01-15 10:30:46 - DEBUG - [WINDOW] - Created main window
2024-01-15 10:30:47 - ERROR - [BACKEND] - Failed to execute action
```

## Development Guide

### Development Setup

#### 1. Development Environment

```bash
# Install development dependencies
npm install --dev

# Set up development scripts
npm run dev:watch
npm run dev:debug

# Enable hot reload
export HOT_RELOAD=true
npm run dev
```

#### 2. Code Structure

```
src/
├── main/                 # Electron main process
│   ├── main.js          # Application entry point
│   ├── window-manager.js # Window management
│   ├── hotkey-manager.js # Global hotkeys
│   ├── security-manager.js # Security features
│   └── backend-manager.js # Backend integration
├── renderer/             # Frontend UI
│   ├── main-overlay.html # Transparent overlay
│   ├── chat-window.html  # Chat interface
│   ├── settings-modal.html # Settings panel
│   └── entry-window.html # Authentication window
├── preload/              # Security preload scripts
│   ├── main-preload.js   # Main window API
│   ├── chat-preload.js   # Chat window API
│   └── settings-preload.js # Settings API
└── assets/               # Application assets
    ├── icons/            # Application icons
    └── sounds/           # Audio files
```

#### 3. Adding New Features

**New Backend Action:**
```python
# Add to backend_modified.py
async def execute_custom_action(params):
    try:
        # Implementation
        result = await perform_custom_task(params)
        
        return {
            "type": "action_complete",
            "action_id": params["action_id"],
            "success": True,
            "details": "Custom action completed successfully"
        }
    except Exception as e:
        return {
            "type": "action_complete",
            "action_id": params["action_id"],
            "success": False,
            "details": str(e)
        }
```

**New Frontend Component:**
```javascript
// New component in src/renderer/
class NewComponent {
    constructor() {
        this.element = document.getElementById('new-component');
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.element.addEventListener('click', () => {
            this.handleClick();
        });
    }
    
    handleClick() {
        // Handle component interaction
        if (window.chatAPI) {
            window.chatAPI.executeTask({
                type: 'custom_action',
                parameters: {}
            });
        }
    }
}
```

### Testing

#### 1. Unit Tests

```bash
# Run backend tests
python -m pytest tests/backend/

# Run frontend tests
npm test

# Integration tests
npm run test:integration
```

#### 2. Manual Testing

**Test Checklist:**
- [ ] Application starts successfully
- [ ] All windows open correctly
- [ ] Hotkeys function properly
- [ ] Backend communication works
- [ ] Voice input operates
- [ ] Security features engage
- [ ] Settings save/load correctly

## Deployment

### Production Build

#### 1. Build Preparation

```bash
# Install production dependencies
npm ci --production

# Optimize assets
npm run optimize:assets

# Generate icons
npm run generate:icons
```

#### 2. Backend Packaging

```bash
# Create executable
python -m PyInstaller \
    --onefile \
    --windowed \
    --name backend_modified \
    --add-data "assets;assets" \
    backend_modified.py

# Sign executable (Windows)
signtool sign /f certificate.pfx /p password dist/backend_modified.exe

# Notarize (macOS)
xcrun altool --notarize-app \
    --primary-bundle-id "com.computeruseagent.app" \
    --username "developer@company.com" \
    --password "app-password" \
    --file dist/ComputerUseAgent.dmg
```

#### 3. Frontend Build

```bash
# Build for all platforms
npm run build:win
npm run build:mac
npm run build:linux

# Create installer
npm run dist:win
npm run dist:mac
npm run dist:linux
```

### Distribution

#### 1. Version Management

```bash
# Update version
npm version patch  # 1.0.1
npm version minor  # 1.1.0
npm version major  # 2.0.0

# Create release
npm run release
```

#### 2. Auto-Update Configuration

```javascript
// updater.js
const { autoUpdater } = require('electron-updater');

autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-available', () => {
    // Notify user of available update
});

autoUpdater.on('update-downloaded', () => {
    // Prompt user to restart
});
```

### Maintenance

#### 1. Monitoring

```javascript
// Error tracking
const errorTracker = {
    reportError(error, context) {
        console.error('Application Error:', error);
        // Send to error tracking service
    }
};

// Performance monitoring
const performanceMonitor = {
    trackMetric(name, value) {
        console.log(`Performance: ${name} = ${value}`);
        // Send to monitoring service
    }
};
```

#### 2. Updates

```bash
# Check for updates
npm run check-updates

# Update dependencies
npm update

# Security updates
npm audit fix
```

This comprehensive documentation provides all the information needed to install, configure, develop, and maintain the Control application.