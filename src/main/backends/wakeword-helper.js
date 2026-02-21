const path = require("path");
const fs = require("fs");
const { app } = require('electron');

let Porcupine, PvRecorder;
let nativeModulePath = null;
const nativeModuleLogs = [];
const nativeModuleLogger = (msg, level = 'info') => {
  console.log(`[WAKEWORD JS] [${level.toUpperCase()}] ${msg}`);
  nativeModuleLogs.push({ msg: `[NATIVE] ${msg}`, level });
};

const isPackaged = app.isPackaged;

// In production, we MUST load from app.asar.unpacked because Picovoice
// needs real filesystem paths for its .pv files.
if (isPackaged) {
    nativeModuleLogger('App is packaged, prioritizing app.asar.unpacked for native modules');
    const possibleUnpackedPaths = [
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
        path.join(path.dirname(app.getPath('exe')), 'resources', 'app.asar.unpacked', 'node_modules'),
        path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'node_modules')
    ];

    for (const unpackedPath of possibleUnpackedPaths) {
        try {
            nativeModuleLogger(`Trying unpacked path: ${unpackedPath}`);
            const porcupinePkg = require(path.join(unpackedPath, '@picovoice/porcupine-node'));
            const pvrecorderPkg = require(path.join(unpackedPath, '@picovoice/pvrecorder-node'));

            Porcupine = porcupinePkg.Porcupine;
            PvRecorder = pvrecorderPkg.PvRecorder;

            if (Porcupine && PvRecorder) {
                nativeModuleLogger(`Native modules successfully loaded from: ${unpackedPath}`);
                nativeModulePath = unpackedPath;
                break;
            }
        } catch (innerErr) {
            nativeModuleLogger(`Failed to load from ${unpackedPath}: ${innerErr.message}`, 'warn');
        }
    }
}

// Fallback to standard require if not packaged or if unpacked loading failed
if (!Porcupine || !PvRecorder) {
    try {
        nativeModuleLogger('Attempting standard require for native modules');
        Porcupine = require("@picovoice/porcupine-node").Porcupine;
        PvRecorder = require("@picovoice/pvrecorder-node").PvRecorder;
        nativeModuleLogger('Native modules loaded via standard require');
    } catch (e) {
        nativeModuleLogger(`Standard require failed: ${e.message}`, 'error');
    }
}

if (!Porcupine || !PvRecorder) {
    nativeModuleLogger('CRITICAL: Failed to load native modules (Porcupine/PvRecorder). Wakeword will not function.', 'error');
}

class WakewordHelper {
  constructor(options = {}) {
    this.logger = options.logger || console.log;
    this.porcupineParamsPath = this.resolvePorcupineParamsPath();

    // Flush any logs collected during native module loading
    if (nativeModuleLogs.length > 0) {
      nativeModuleLogs.forEach(logEntry => {
        if (this.logger) {
          this.logger(logEntry.msg, logEntry.level);
        }
      });
      nativeModuleLogs.length = 0; // Clear them
    }

    this.accessKey = options.accessKey || process.env.PORCUPINE_ACCESS_KEY;
    this.modelPath = options.modelPath || this.resolveModelPath();
    this.porcupine = null;
    this.recorder = null;
    this.isListening = false;
    this.lastDetection = 0;
  }

  log(msg, level = 'info') {
    if (this.logger) {
      this.logger(`[HELPER] ${msg}`, level === 'log' ? 'info' : level);
    }
  }

  resolvePorcupineParamsPath() {
    // Priority 1: Check if we have a successful unpacked native module path
    if (nativeModulePath) {
      const p = path.join(nativeModulePath, '@picovoice/porcupine-node/lib/common/porcupine_params.pv');
      if (fs.existsSync(p)) {
        this.log(`Found Porcupine params in unpacked path: ${p}`);
        return p;
      }
    }

    // Priority 2: Standard location in node_modules (might be in ASAR, which is what we want to avoid)
    try {
      // Use require.resolve to find the package directory if not already known
      const porcupineDir = path.dirname(require.resolve('@picovoice/porcupine-node/package.json'));
      const p = path.join(porcupineDir, 'lib/common/porcupine_params.pv');
      if (fs.existsSync(p)) {
        return p;
      }
    } catch (e) {}

    return null;
  }

  resolveModelPath() {
    const isPackaged = app.isPackaged;

    // Detect platform and set the appropriate suffix
    const platform = process.platform;
    let platformSuffix = "windows";
    let osName = "Windows";
    
    if (platform === "darwin") {
      platformSuffix = "mac";
      osName = "macOS";
    } else if (platform === "linux") {
      platformSuffix = "linux";
      osName = "Linux";
    }

    this.log(`Detected OS: ${osName} (platform: ${platform})`);
    this.log(`Architecture: ${process.arch}`);
    this.log(`App packaged: ${isPackaged}`);

    // Build list of model file names for this platform
    const possibleNames = [
      `hey-control_en_${platformSuffix}_v4_0_0.ppn`,
      // Fallback names if exact platform suffix doesn't match
      `hey-control_${platformSuffix}.ppn`,
      `hey-control_en_${platformSuffix}.ppn`,
      "hey-control_en_windows_v4_0_0.ppn",
      "hey-control.ppn"
    ];

    this.log(`Looking for model files: ${possibleNames.join(', ')}`);

    // Build list of search directories
    const searchDirs = [];
    if (isPackaged) {
      // 1. extraResources (standard for electron-builder)
      searchDirs.push(path.join(process.resourcesPath, "assets/wakeword"));
      searchDirs.push(path.join(process.resourcesPath, "wakeword"));
      // 2. Unpacked ASAR (in case it was put there)
      searchDirs.push(path.join(process.resourcesPath, "app.asar.unpacked/assets/wakeword"));
      searchDirs.push(path.join(process.resourcesPath, "app.asar.unpacked/wakeword"));

      // Mac specific path
      if (process.platform === 'darwin') {
          searchDirs.push(path.join(path.dirname(process.resourcesPath), "Resources/assets/wakeword"));
      }
    } else {
      // Development
      searchDirs.push(path.join(__dirname, "../../../assets/wakeword"));
    }
    // 3. Current Working Directory (portable fallback)
    searchDirs.push(path.join(process.cwd(), "assets/wakeword"));
    searchDirs.push(path.join(process.cwd(), "wakeword"));

    this.log("Searching for model file...");
    this.log(`Search directories: ${searchDirs.join(', ')}`);

    let foundPath = null;
    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) {
        this.log(`Directory does not exist: ${dir}`);
        continue;
      }

      this.log(`Checking directory: ${dir}`);

      // Try exact names first
      for (const name of possibleNames) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          this.log(`SUCCESS: Found model at ${p}`);
          foundPath = p;
          break;
        } else {
          this.log(`Not found: ${p}`);
        }
      }

      if (!foundPath) {
        // Try finding ANY .ppn file in this dir
        try {
          const files = fs.readdirSync(dir);
          this.log(`Files in directory: ${files.join(', ')}`);
          const ppnFile = files.find(f => f.endsWith(".ppn"));
          if (ppnFile) {
            foundPath = path.join(dir, ppnFile);
            this.log(`SUCCESS: Found alternative model ${ppnFile} at ${foundPath}`);
          }
        } catch (e) {
          this.log(`Error reading dir ${dir}:`, e.message);
        }
      }

      if (foundPath) break;
    }

    if (foundPath) {
      // CRITICAL FIX: If the path is inside app.asar (not unpacked) or a read-only resource,
      // some native libraries fail. Best practice is to copy it to userData.
      try {
        const userDataPath = app.getPath('userData');
        const targetDir = path.join(userDataPath, 'models');
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const targetPath = path.join(targetDir, path.basename(foundPath));

        // Copy if not exists or if source is newer
        const shouldCopy = !fs.existsSync(targetPath) ||
                           fs.statSync(foundPath).mtime > fs.statSync(targetPath).mtime;

        if (shouldCopy) {
          this.log(`Copying model to persistent storage: ${targetPath}`);
          fs.copyFileSync(foundPath, targetPath);
        }

        return targetPath;
      } catch (copyErr) {
        this.log(`Failed to copy model to userData, using original path: ${copyErr.message}`);
        return foundPath;
      }
    }

    const fallbackPath = path.join(searchDirs[0] || "", possibleNames[0]);
    this.log(`ERROR: No model file found. Fallback to: ${fallbackPath}`);
    return fallbackPath;
  }

  async start(onDetected, onError) {
    if (this.isListening) {
      this.log("Already listening");
      return;
    }

    try {
      this.log("Initializing Porcupine...");
      this.log(`OS: ${process.platform}, Arch: ${process.arch}`);

      // AGGRESSIVE KEY DISCOVERY
      let currentKey = process.env.PORCUPINE_ACCESS_KEY || this.accessKey;

      if (currentKey) {
        this.log(`Found access key in process.env or local state (starts with: ${currentKey.substring(0, 5)}...)`);
      } else {
        this.log('Access key not found in process.env, checking secondary sources...');

        // 1. Try Firebase local cache
        try {
          const firebaseService = require('../firebase-service');
          const cachedUser = firebaseService.checkCachedUser();
          if (cachedUser) {
            currentKey = cachedUser.picovoiceKey || cachedUser.porcupine_access_key;
            if (currentKey) {
              this.log(`Recovered key from Firebase user cache (starts with: ${currentKey.substring(0, 5)}...)`);
              process.env.PORCUPINE_ACCESS_KEY = currentKey;
            }
          }
        } catch (e) {
          this.log(`Firebase cache check failed: ${e.message}`, 'warn');
        }

        // 2. Try SettingsManager (global)
        if (!currentKey) {
          try {
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');
            if (fs.existsSync(settingsPath)) {
              const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
              if (settings.userDetails) {
                currentKey = settings.userDetails.picovoiceKey || settings.userDetails.porcupine_access_key;
                if (currentKey) {
                  this.log(`Recovered key from global settings.json (starts with: ${currentKey.substring(0, 5)}...)`);
                }
              }
            }
          } catch (e) {
            this.log(`SettingsManager file check failed: ${e.message}`, 'warn');
          }
        }

        // 3. Try scanning for ANY user settings file
        if (!currentKey) {
          try {
            const userDataDir = app.getPath('userData');
            const files = fs.readdirSync(userDataDir);
            const userSettingsFiles = files.filter(f => f.startsWith('settings_') && f.endsWith('.json'));

            for (const f of userSettingsFiles) {
              const p = path.join(userDataDir, f);
              const settings = JSON.parse(fs.readFileSync(p, 'utf8'));
              currentKey = settings.picovoiceKey || settings.porcupine_access_key;
              if (currentKey) {
                this.log(`Recovered key from user settings file: ${f} (starts with: ${currentKey.substring(0, 5)}...)`);
                break;
              }
            }
          } catch (e) {
            this.log(`Scanning user settings failed: ${e.message}`, 'warn');
          }
        }
      }

      this.accessKey = currentKey;

      if (!currentKey) {
        this.log('CRITICAL: Picovoice access key is MISSING from all sources.', 'error');
        throw new Error("Picovoice access key missing. Please set your key in Settings.");
      }

      this.log(`Loading model from: ${this.modelPath}`);
      if (!fs.existsSync(this.modelPath)) {
        // One last try: relative to process.cwd()
        const altPath = path.join(process.cwd(), "assets/wakeword/hey-control_en_windows_v4_0_0.ppn");
        if (fs.existsSync(altPath)) {
            this.modelPath = altPath;
            this.log(`Found model at alternative location: ${altPath}`);
        } else {
            throw new Error(`Model file not found at ${this.modelPath}. Please ensure the app assets are correctly installed.`);
        }
      }

      try {
          this.log(`Initializing Porcupine with key: ${currentKey.substring(0, 5)}...`);
          this.log(`Model path: ${this.modelPath}`);

          if (!Porcupine) {
            throw new Error("Porcupine native module not loaded. This usually means the library is not compatible with your system or was not correctly unpacked.");
          }

          // Diagnostic: check if model exists
          if (!fs.existsSync(this.modelPath)) {
              this.log(`CRITICAL: Model file DOES NOT exist at ${this.modelPath}`, 'error');
              throw new Error(`Model file missing: ${this.modelPath}`);
          }

          // Note: Porcupine for Node.js handles ASAR unpacking for its native module,
          // but the model file MUST be on disk (not in ASAR).
          // We explicitly pass porcupineParamsPath to ensure it's loaded from the real filesystem.
          this.log(`Using Porcupine params from: ${this.porcupineParamsPath || 'DEFAULT'}`);

          this.porcupine = new Porcupine(
            currentKey,
            [this.modelPath],
            [0.5],
            this.porcupineParamsPath
          );
          this.log("Porcupine engine initialized successfully");
      } catch (e) {
          // Log the actual error for dev/production debugging (it will show up in wakeword.log)
          const detailedError = e.message || String(e);
          this.log(`Porcupine initialization error details: ${detailedError}`, 'error');

          // If it's already one of our specific errors, re-throw it
          if (detailedError.includes('native module not loaded') || detailedError.includes('Model file missing')) {
            throw e;
          }

          // Distinguish between invalid key and other issues
          const isKeyError = detailedError.includes('Invalid') ||
                             detailedError.includes('AccessKey') ||
                             detailedError.includes('parse') ||
                             detailedError.includes('Unauthorized');

          const msg = isKeyError ? 'Invalid Picovoice key' : `Wakeword engine failed to start: ${detailedError}`;

          if (isKeyError) {
              try { process.emit && process.emit('wakeword-invalid-key', { message: 'Invalid Picovoice key' }); } catch (err) {}
          }

          throw new Error(msg);
      }

      const frameLength = this.porcupine.frameLength;

      this.log("Initializing PvRecorder...");
      try {
          if (!PvRecorder) throw new Error("PvRecorder module not loaded");

          const devices = PvRecorder.getAvailableDevices();
          this.log(`Available audio devices: ${devices.length} found`);
          devices.forEach((d, i) => this.log(`Device ${i}: ${d}`));

          if (devices.length === 0) {
              throw new Error("No audio input devices found. Please connect a microphone.");
          }

          // Use default device (-1)
          this.recorder = new PvRecorder(frameLength, -1);
          this.recorder.start();
          this.log("PvRecorder started successfully");
      } catch (e) {
          this.log(`PvRecorder initialization failed: ${e.message || e}`, 'error');
          throw e;
      }

      this.isListening = true;
      this.log(`Started listening with PvRecorder for wake word: ${path.basename(this.modelPath)}`);

      const processFrame = () => {
        if (!this.isListening || !this.recorder || !this.porcupine || this.isStopping) return;

        this.recorder.read()
          .then(frame => {
            if (!this.isListening || !this.porcupine || !this.recorder || this.isStopping) return;
            const result = this.porcupine.process(frame);

            if (result >= 0) {
              const now = Date.now();
              if (now - this.lastDetection > 1500) { // 1.5s cooldown
                this.lastDetection = now;
                this.log("Wake word DETECTED");
                onDetected();
              }
            }

            // Continue processing
            if (this.isListening) {
              setImmediate(processFrame);
            }
          })
          .catch(err => {
            this.log(`Recording loop error: ${err.message || err}`, 'error');
            if (onError) onError(err);
          });
      };

      // Start the loop
      processFrame();
      return true;

    } catch (err) {
      this.log(`Failed to start: ${err.message}`, 'error');
      // Re-throw to let the caller know initialization failed
      throw err;
    }
  }

  async validateAccessKey(accessKey) {
    try {
      if (!Porcupine) {
        return { success: false, message: 'Native module not loaded. Check system compatibility.' };
      }

      const keyToTest = accessKey || this.accessKey || process.env.PORCUPINE_ACCESS_KEY;
      this.log('validateAccessKey called, hasKey=', !!keyToTest);
      if (!keyToTest) return { success: false, message: 'Missing Picovoice access key' };

      if (!fs.existsSync(this.modelPath)) {
        return { success: false, message: 'Wakeword model file missing' };
      }

      // Try to instantiate Porcupine briefly to validate key
      const testPorcupine = new Porcupine(
        keyToTest,
        [this.modelPath],
        [0.5],
        this.porcupineParamsPath
      );
      testPorcupine.release();
      this.log('validateAccessKey: key appears valid');
      return { success: true };
    } catch (e) {
      const detailedError = e.message || String(e);
      this.log(`validateAccessKey error: ${detailedError}`, 'error');

      const isKeyError = detailedError.includes('Invalid') ||
                         detailedError.includes('AccessKey') ||
                         detailedError.includes('parse') ||
                         detailedError.includes('Unauthorized');

      return {
        success: false,
        message: isKeyError ? 'Invalid Picovoice key' : `Validation failed: ${detailedError}`
      };
    }
  }

  stop() {
    this.isListening = false;
    this.isStopping = true;

    try {
        if (this.recorder) {
            this.log("Stopping PvRecorder...");
            try {
                this.recorder.stop();
            } catch (e) {
                this.log(`Error during recorder stop: ${e.message}`, 'warn');
            }

            try {
                this.recorder.release();
            } catch (e) {
                this.log(`Error during recorder release: ${e.message}`, 'warn');
            }
            this.recorder = null;
        }

        if (this.porcupine) {
            this.log("Releasing Porcupine...");
            try {
                this.porcupine.release();
            } catch (e) {
                this.log(`Error during porcupine release: ${e.message}`, 'warn');
            }
            this.porcupine = null;
        }
    } catch (err) {
        this.log(`Critical error during stop: ${err.message}`, 'error');
    } finally {
        this.isStopping = false;
        this.log("Stopped listening");
    }
  }
}

module.exports = WakewordHelper;
