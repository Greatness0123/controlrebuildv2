const { Porcupine } = require("@picovoice/porcupine-node");
const { PvRecorder } = require("@picovoice/pvrecorder-node");
const path = require("path");
const fs = require("fs");

class WakewordHelper {
  constructor(options = {}) {
    this.accessKey = options.accessKey || process.env.PORCUPINE_ACCESS_KEY;

    // ASAR-aware path resolution
    const isProd = !require("electron-is-dev");
    let baseDir;

    if (isProd) {
      // In production, assets are in extraResources (process.resourcesPath/assets)
      baseDir = path.join(process.resourcesPath, "assets");
      // Fallback: check if they are inside unpacked asar
      if (!fs.existsSync(baseDir)) {
        baseDir = path.join(process.resourcesPath, "app.asar.unpacked/assets");
      }
    } else {
      baseDir = path.join(__dirname, "../../../assets");
    }

    this.wakewordDir = path.join(baseDir, "wakeword");
    this.modelPath = options.modelPath || this.findModelPath();
    this.porcupine = null;
    this.recorder = null;
    this.isListening = false;
    this.lastDetection = 0;
  }

  findModelPath() {
    const platform = process.platform;
    let platformSuffix = "windows";
    if (platform === "darwin") platformSuffix = "mac";
    else if (platform === "linux") platformSuffix = "linux";

    const possibleNames = [
        `hey-control_en_${platformSuffix}_v4_0_0.ppn`,
        "hey-control_en_windows_v4_0_0.ppn", // fallback to windows name if user only has that
        "hey-control.ppn"
    ];

    for (const name of possibleNames) {
        const p = path.join(this.wakewordDir, name);
        if (fs.existsSync(p)) {
            console.log(`[WAKEWORD JS] Found model: ${name}`);
            return p;
        }
    }

    // Fallback: find any .ppn file in the directory
    try {
      if (fs.existsSync(this.wakewordDir)) {
        const files = fs.readdirSync(this.wakewordDir);
        const ppnFile = files.find(f => f.endsWith(".ppn"));
        if (ppnFile) {
          console.log(`[WAKEWORD JS] Found alternative model: ${ppnFile}`);
          return path.join(this.wakewordDir, ppnFile);
        }
      }
    } catch (e) {
      console.error("[WAKEWORD JS] Error searching for model:", e);
    }

    return path.join(this.wakewordDir, possibleNames[0]); // Return first choice if none found
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
