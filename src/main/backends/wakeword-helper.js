const { Porcupine } = require("@picovoice/porcupine-node");
const { PvRecorder } = require("@picovoice/pvrecorder-node");
const path = require("path");
const fs = require("fs");

class WakewordHelper {
  constructor(options = {}) {
    this.accessKey = options.accessKey || process.env.PORCUPINE_ACCESS_KEY;
    this.modelPath = options.modelPath || path.join(__dirname, "../../../assets/wakeword/hey-control_en_windows_v4_0_0.ppn");
    this.porcupine = null;
    this.recorder = null;
    this.isListening = false;
    this.lastDetection = 0;
  }

  async start(onDetected, onError) {
    if (this.isListening) return;

    try {
      if (!this.accessKey) {
        throw new Error("Porcupine Access Key missing. Please set PORCUPINE_ACCESS_KEY environment variable.");
      }

      if (!fs.existsSync(this.modelPath)) {
        throw new Error(`Model file not found: ${this.modelPath}`);
      }

      this.porcupine = new Porcupine(this.accessKey, [this.modelPath], [0.5]);

      const frameLength = this.porcupine.frameLength;
      this.recorder = new PvRecorder(frameLength);
      this.recorder.start();

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
