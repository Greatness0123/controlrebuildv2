# Control Application Build Guide

This guide explains how to build the Control application into executable files (.exe, .dmg, .appimage) for Windows, macOS, and Linux.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Python Script Conversion](#python-script-conversion)
3. [Building Executables](#building-executables)
4. [Platform-Specific Instructions](#platform-specific-instructions)
5. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

1. **Node.js and npm** (v16 or higher)
   ```bash
   node --version
   npm --version
   ```

2. **Python 3.8+** (for converting Python scripts)
   ```bash
   python --version
   ```

3. **PyInstaller** (for converting Python to executables)
   ```bash
   pip install pyinstaller
   ```

4. **electron-builder** (already in devDependencies)
   ```bash
   npm install
   ```

### Platform-Specific Requirements

#### Windows (.exe)
- Windows 10/11
- Visual Studio Build Tools (for native modules)
- Windows SDK

#### macOS (.dmg)
- macOS 10.13 or higher
- Xcode Command Line Tools
- Code signing certificate (optional, for distribution)

#### Linux (.appimage)
- Linux distribution (Ubuntu, Debian, Fedora, etc.)
- Required libraries: `libnss3`, `libatk-bridge2.0-0`, `libdrm2`, `libxkbcommon0`, `libxcomposite1`, `libxdamage1`, `libxrandr2`, `libgbm1`, `libxss1`, `libasound2`

---

## Python Script Conversion

The application uses several Python scripts that need to be converted to executables before bundling:

### Python Scripts to Convert

1. **`vosk_server_v2.py`** - Vosk speech recognition server
2. **`act_backend.py`** - ACT mode backend
3. **`ask_backend.py`** - ASK mode backend
4. **`assets/wakeword/wakeword_helper.py`** - Wake word detection helper

### Conversion Steps

#### Step 1: Install PyInstaller
```bash
pip install pyinstaller
```

#### Step 2: Convert Each Python Script

**For `vosk_server_v2.py`:**
```bash
pyinstaller --onefile --name vosk_server_v2 --hidden-import=vosk --hidden-import=websockets --add-data "assets/vosk-model;assets/vosk-model" vosk_server_v2.py
```

**For `act_backend.py`:**
```bash
pyinstaller --onefile --name act_backend --hidden-import=google.generativeai --hidden-import=pyautogui --hidden-import=pil --add-data "assets;assets" act_backend.py
```

**For `ask_backend.py`:**
```bash
pyinstaller --onefile --name ask_backend --hidden-import=google.generativeai ask_backend.py
```

**For `wakeword_helper.py`:**
```bash
pyinstaller --onefile --name wakeword_helper --hidden-import=pvporcupine --hidden-import=pyaudio assets/wakeword/wakeword_helper.py
```

#### Step 3: Update File References

After conversion, update the following files to use the executables instead of Python scripts:

**File: `src/main/vosk-server-manager.js`**
```javascript
// OLD:
this.serverScriptPath = path.join(__dirname, '../../vosk_server_v2.py');

// NEW (Windows):
this.serverScriptPath = path.join(__dirname, '../../dist/vosk_server_v2.exe');

// NEW (macOS/Linux):
this.serverScriptPath = path.join(__dirname, '../../dist/vosk_server_v2');
```

**File: `src/main/backend-manager-fixed.js`**
```javascript
// OLD:
const actScript = path.join(__dirname, '../../act_backend.py');
const askScript = path.join(__dirname, '../../ask_backend.py');

// NEW (Windows):
const actScript = path.join(__dirname, '../../dist/act_backend.exe');
const askScript = path.join(__dirname, '../../dist/ask_backend.exe');

// NEW (macOS/Linux):
const actScript = path.join(__dirname, '../../dist/act_backend');
const askScript = path.join(__dirname, '../../dist/ask_backend');
```

**File: `src/main/wakeword-manager.js` (if exists)**
```javascript
// OLD:
const wakewordScript = path.join(__dirname, '../../assets/wakeword/wakeword_helper.py');

// NEW (Windows):
const wakewordScript = path.join(__dirname, '../../dist/wakeword_helper.exe');

// NEW (macOS/Linux):
const wakewordScript = path.join(__dirname, '../../dist/wakeword_helper');
```

#### Step 4: Platform Detection

Create a helper function to detect the platform and use the correct executable:

```javascript
// In vosk-server-manager.js, backend-manager-fixed.js, etc.
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

function getExecutablePath(scriptName) {
    const basePath = path.join(__dirname, '../../dist');
    if (isWindows) {
        return path.join(basePath, `${scriptName}.exe`);
    }
    return path.join(basePath, scriptName);
}

// Usage:
this.serverScriptPath = getExecutablePath('vosk_server_v2');
```

#### Step 5: Update Python Execution

Replace Python execution with direct executable calls:

**OLD:**
```javascript
this.serverProcess = spawn(this.pythonExePath, [
    this.serverScriptPath,
    '--host', this.host,
    '--port', this.port.toString(),
    '--model', modelPath
]);
```

**NEW:**
```javascript
this.serverProcess = spawn(this.serverScriptPath, [
    '--host', this.host,
    '--port', this.port.toString(),
    '--model', modelPath
]);
```

---

## Building Executables

### Step 1: Build Python Executables

First, convert all Python scripts to executables (see above). The executables will be in the `dist/` directory.

### Step 2: Update package.json Build Configuration

Ensure your `package.json` includes the Python executables in the build:

```json
{
  "build": {
    "extraResources": [
      {
        "from": "dist/",
        "to": "dist/",
        "filter": ["**/*.exe", "**/*"]
      },
      {
        "from": "assets/",
        "to": "assets/",
        "filter": ["**/*"]
      }
    ]
  }
}
```

### Step 3: Build Electron Application

#### Windows (.exe)
```bash
npm run build
# or
npm run dist
```

This creates:
- `dist/Control Setup x.x.x.exe` - Installer
- `dist/Control x.x.x.exe` - Portable executable

#### macOS (.dmg)
```bash
npm run build
```

This creates:
- `dist/Control-x.x.x.dmg` - Disk image

#### Linux (.appimage)
```bash
npm run build
```

This creates:
- `dist/Control-x.x.x.AppImage` - AppImage file

---

## Platform-Specific Instructions

### Windows

1. **Install Visual Studio Build Tools:**
   - Download from: https://visualstudio.microsoft.com/downloads/
   - Install "Desktop development with C++" workload

2. **Build:**
   ```bash
   npm run build
   ```

3. **Output Location:**
   - `dist/Control Setup x.x.x.exe` (installer)
   - `dist/Control x.x.x.exe` (portable)

### macOS

1. **Install Xcode Command Line Tools:**
   ```bash
   xcode-select --install
   ```

2. **Code Signing (Optional):**
   - Get a Developer ID certificate from Apple
   - Update `package.json`:
   ```json
   {
     "build": {
       "mac": {
         "identity": "Developer ID Application: Your Name (TEAM_ID)"
       }
     }
   }
   ```

3. **Build:**
   ```bash
   npm run build
   ```

4. **Output Location:**
   - `dist/Control-x.x.x.dmg`

### Linux

1. **Install Required Libraries:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxss1 libasound2

   # Fedora
   sudo dnf install -y nss atk libdrm libxkbcommon libXcomposite libXdamage libXrandr mesa-libgbm libXScrnSaver alsa-lib
   ```

2. **Build:**
   ```bash
   npm run build
   ```

3. **Output Location:**
   - `dist/Control-x.x.x.AppImage`

---

## File Replacement Guide

### Files to Update After Python Conversion

1. **`src/main/vosk-server-manager.js`**
   - Line ~20: Update `serverScriptPath` to use executable
   - Line ~93: Remove Python execution, use executable directly

2. **`src/main/backend-manager-fixed.js`**
   - Line ~15-20: Update script paths to executables
   - Line ~180-200: Update process spawning to use executables

3. **`src/main/wakeword-manager.js`** (if exists)
   - Update wakeword helper path to executable

### Example Replacements

**Before (Python):**
```javascript
const scriptPath = path.join(__dirname, '../../vosk_server_v2.py');
this.serverProcess = spawn('python', [scriptPath, '--host', '127.0.0.1']);
```

**After (Executable - Windows):**
```javascript
const scriptPath = path.join(__dirname, '../../dist/vosk_server_v2.exe');
this.serverProcess = spawn(scriptPath, ['--host', '127.0.0.1']);
```

**After (Executable - macOS/Linux):**
```javascript
const scriptPath = path.join(__dirname, '../../dist/vosk_server_v2');
this.serverProcess = spawn(scriptPath, ['--host', '127.0.0.1']);
```

---

## Troubleshooting

### Python Executables Not Found

**Problem:** Application can't find Python executables after build.

**Solution:**
1. Ensure executables are in `dist/` directory
2. Check `extraResources` in `package.json` includes `dist/`
3. Verify executable paths use `process.resourcesPath` in production:
   ```javascript
   const isDev = require('electron-is-dev');
   const execPath = isDev 
     ? path.join(__dirname, '../../dist/vosk_server_v2.exe')
     : path.join(process.resourcesPath, 'dist/vosk_server_v2.exe');
   ```

### Missing Dependencies in Python Executables

**Problem:** PyInstaller executables fail with "ModuleNotFoundError".

**Solution:**
1. Add missing modules to `--hidden-import`:
   ```bash
   pyinstaller --hidden-import=missing_module script.py
   ```
2. Create a `hook` file if needed (advanced)

### Large Executable Sizes

**Problem:** Python executables are very large (>100MB).

**Solution:**
1. Use `--exclude-module` to remove unused modules
2. Consider using `--onedir` instead of `--onefile` (creates folder with dependencies)

### Electron Builder Fails

**Problem:** Build process fails with errors.

**Solution:**
1. Clear cache: `rm -rf node_modules dist`
2. Reinstall: `npm install`
3. Check Node.js version compatibility
4. Verify all dependencies are installed

### Code Signing Issues (macOS)

**Problem:** macOS build fails due to code signing.

**Solution:**
1. For development, disable code signing in `package.json`:
   ```json
   {
     "build": {
       "mac": {
         "identity": null
       }
     }
   }
   ```
2. For distribution, ensure valid Developer ID certificate

---

## Quick Reference

### Build Commands
```bash
# Install dependencies
npm install
pip install pyinstaller

# Convert Python scripts
pyinstaller --onefile vosk_server_v2.py
pyinstaller --onefile act_backend.py
pyinstaller --onefile ask_backend.py

# Build Electron app
npm run build        # Full build
npm run dist         # Distribution build
npm run pack         # Pack without installer
```

### Output Locations
- Windows: `dist/Control Setup x.x.x.exe`
- macOS: `dist/Control-x.x.x.dmg`
- Linux: `dist/Control-x.x.x.AppImage`

### Key Files to Modify
1. `src/main/vosk-server-manager.js`
2. `src/main/backend-manager-fixed.js`
3. `package.json` (build configuration)
4. Python scripts → Executables in `dist/`

---

## Additional Resources

- [PyInstaller Documentation](https://pyinstaller.org/)
- [electron-builder Documentation](https://www.electron.build/)
- [Electron Packaging Guide](https://www.electronjs.org/docs/latest/tutorial/application-distribution)

