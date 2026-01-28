const { Porcupine } = require("@picovoice/porcupine-node");
const { PvRecorder } = require("@picovoice/pvrecorder-node");
const path = require("path");
const fs = require("fs");

class WakewordHelper {
  constructor(options = {}) {
    this.accessKey = options.accessKey || process.env.PORCUPINE_ACCESS_KEY;

    // ASAR-aware path resolution
    const isProd = !require("electron-is-dev");
    const baseDir = isProd
      ? path.join(process.resourcesPath, "assets")
      : path.join(__dirname, "../../../assets");

    this.modelPath = options.modelPath || path.join(baseDir, "wakeword/hey-control_en_windows_v4_0_0.ppn");
    this.porcupine = null;
    this.recorder = null;
    this.isListening = false;
    this.lastDetection = 0;
  }

  async start(onDetected, onError) {
    if (this.isListening) return;

    try {
      console.log("[WAKEWORD JS] Initializing Porcupine...");

      // Refresh access key from environment if missing
      if (!this.accessKey) {
        this.accessKey = process.env.PORCUPINE_ACCESS_KEY;
      }

      if (!this.accessKey) {
        throw new Error("Porcupine Access Key missing. Please set PORCUPINE_ACCESS_KEY environment variable.");
      }

      console.log(`[WAKEWORD JS] Loading model from: ${this.modelPath}`);
      if (!fs.existsSync(this.modelPath)) {
        throw new Error(`Model file not found: ${this.modelPath}`);
      }

      try {
          this.porcupine = new Porcupine(this.accessKey, [this.modelPath], [0.5]);
          console.log("[WAKEWORD JS] Porcupine engine initialized successfully");
      } catch (e) {
          console.error("[WAKEWORD JS] Porcupine initialization failed:", e);
          throw e;
      }

      const frameLength = this.porcupine.frameLength;

      console.log("[WAKEWORD JS] Initializing PvRecorder...");
      try {
          const devices = PvRecorder.getAvailableDevices();
          console.log(`[WAKEWORD JS] Available audio devices: ${devices.join(', ')}`);

          this.recorder = new PvRecorder(frameLength);
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
