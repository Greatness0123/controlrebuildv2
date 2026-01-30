const { Porcupine } = require("@picovoice/porcupine-node");
const { PvRecorder } = require("@picovoice/pvrecorder-node");
const path = require("path");
const fs = require("fs");

class WakewordHelper {
  constructor(options = {}) {
    this.accessKey = options.accessKey || process.env.PORCUPINE_ACCESS_KEY;
    this.modelPath = options.modelPath || this.resolveModelPath();
    this.porcupine = null;
    this.recorder = null;
    this.isListening = false;
    this.lastDetection = 0;
  }

  resolveModelPath() {
    const { app } = require('electron');
    const isPackaged = app ? app.isPackaged : !require("electron-is-dev");

    const platform = process.platform;
    let platformSuffix = "windows";
    if (platform === "darwin") platformSuffix = "mac";
    else if (platform === "linux") platformSuffix = "linux";

    const possibleNames = [
      `hey-control_en_${platformSuffix}_v4_0_0.ppn`,
      "hey-control_en_windows_v4_0_0.ppn",
      "hey-control.ppn"
    ];

    const searchDirs = [];
    if (isPackaged) {
      // 1. extraResources (standard for electron-builder)
      searchDirs.push(path.join(process.resourcesPath, "assets/wakeword"));
      searchDirs.push(path.join(process.resourcesPath, "wakeword"));
      // 2. Unpacked ASAR (in case it was put there)
      searchDirs.push(path.join(process.resourcesPath, "app.asar.unpacked/assets/wakeword"));
    } else {
      // Development
      searchDirs.push(path.join(__dirname, "../../../assets/wakeword"));
    }
    // 3. Current Working Directory (portable fallback)
    searchDirs.push(path.join(process.cwd(), "assets/wakeword"));
    searchDirs.push(path.join(process.cwd(), "wakeword"));

    console.log("[WAKEWORD JS] Searching for model file...");

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) {
        console.log(`[WAKEWORD JS] Directory does not exist: ${dir}`);
        continue;
      }

      console.log(`[WAKEWORD JS] Checking directory: ${dir}`);

      // Try exact names
      for (const name of possibleNames) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          console.log(`[WAKEWORD JS] SUCCESS: Found model at ${p}`);
          return p;
        }
      }

      // Try finding ANY .ppn file in this dir
      try {
        const files = fs.readdirSync(dir);
        const ppnFile = files.find(f => f.endsWith(".ppn"));
        if (ppnFile) {
          const p = path.join(dir, ppnFile);
          console.log(`[WAKEWORD JS] SUCCESS: Found alternative model ${ppnFile} at ${p}`);
          return p;
        }
      } catch (e) {
        console.error(`[WAKEWORD JS] Error reading dir ${dir}:`, e.message);
      }
    }

    const fallbackPath = path.join(searchDirs[0] || "", possibleNames[0]);
    console.error(`[WAKEWORD JS] ERROR: No model file found. Fallback to: ${fallbackPath}`);
    return fallbackPath;
  }

  async start(onDetected, onError) {
    if (this.isListening) {
      console.log("[WAKEWORD JS] Already listening");
      return;
    }

    try {
      console.log("[WAKEWORD JS] Initializing Porcupine...");
      console.log(`[WAKEWORD JS] OS: ${process.platform}, Arch: ${process.arch}`);

      // ALWAYS use the latest key from environment/firebase
      const currentKey = process.env.PORCUPINE_ACCESS_KEY || this.accessKey;
      this.accessKey = currentKey;

      if (!currentKey) {
        throw new Error("Porcupine Access Key missing. Please set PORCUPINE_ACCESS_KEY environment variable.");
      }

      console.log(`[WAKEWORD JS] Loading model from: ${this.modelPath}`);
      if (!fs.existsSync(this.modelPath)) {
        // One last try: relative to process.cwd()
        const altPath = path.join(process.cwd(), "assets/wakeword/hey-control_en_windows_v4_0_0.ppn");
        if (fs.existsSync(altPath)) {
            this.modelPath = altPath;
            console.log(`[WAKEWORD JS] Found model at alternative location: ${altPath}`);
        } else {
            throw new Error(`Model file not found: ${this.modelPath}`);
        }
      }

      try {
          console.log(`[WAKEWORD JS] Initializing Porcupine with key: ${currentKey.substring(0, 5)}...`);
          // Note: Porcupine for Node.js handles ASAR unpacking for its native module,
          // but the model file MUST be on disk (not in ASAR).
          this.porcupine = new Porcupine(currentKey, [this.modelPath], [0.5]);
          console.log("[WAKEWORD JS] Porcupine engine initialized successfully");
      } catch (e) {
          console.error("[WAKEWORD JS] Porcupine initialization failed:", e);
          if (e.message.includes("Invalid AccessKey")) {
              console.error("[WAKEWORD JS] Check your Picovoice Access Key.");
          }
          throw e;
      }

      const frameLength = this.porcupine.frameLength;

      console.log("[WAKEWORD JS] Initializing PvRecorder...");
      try {
          const devices = PvRecorder.getAvailableDevices();
          console.log(`[WAKEWORD JS] Available audio devices: ${devices.length} found`);
          devices.forEach((d, i) => console.log(`[WAKEWORD JS] Device ${i}: ${d}`));

          // Use default device (-1)
          this.recorder = new PvRecorder(frameLength, -1);
          this.recorder.start();
          console.log("[WAKEWORD JS] PvRecorder started successfully");
      } catch (e) {
          console.error("[WAKEWORD JS] PvRecorder initialization failed:", e);
          throw e;
      }

      this.isListening = true;
      console.log(`[WAKEWORD JS] Started listening with PvRecorder for wake word: ${path.basename(this.modelPath)}`);

      const processFrame = async () => {
        if (!this.isListening) return;

        try {
          const frame = await this.recorder.read();
          const result = this.porcupine.process(frame);

          if (result >= 0) {
            const now = Date.now();
            if (now - this.lastDetection > 1500) { // 1.5s cooldown
              this.lastDetection = now;
              console.log("[WAKEWORD JS] DETECTED");
              onDetected();
            }
          }

          // Continue processing
          setImmediate(processFrame);
        } catch (err) {
          console.error("[WAKEWORD JS] Recording error:", err);
          if (onError) onError(err);
        }
      };

      processFrame();

    } catch (err) {
      console.error("[WAKEWORD JS] Failed to start:", err);
      if (onError) onError(err);
    }
  }

  stop() {
    this.isListening = false;
    if (this.recorder) {
      this.recorder.stop();
      this.recorder.release();
      this.recorder = null;
    }
    if (this.porcupine) {
      this.porcupine.release();
      this.porcupine = null;
    }
    console.log("[WAKEWORD JS] Stopped listening");
  }
}

module.exports = WakewordHelper;
