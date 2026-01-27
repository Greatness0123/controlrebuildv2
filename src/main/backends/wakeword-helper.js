const { Porcupine } = require("@picovoice/porcupine-node");
const mic = require("mic");
const path = require("path");
const fs = require("fs");

class WakewordHelper {
  constructor(options = {}) {
    this.accessKey = options.accessKey || process.env.PORCUPINE_ACCESS_KEY;
    this.modelPath = options.modelPath || path.join(__dirname, "../../../assets/wakeword/hey-control_en_windows_v4_0_0.ppn");
    this.porcupine = null;
    this.micInstance = null;
    this.isListening = false;
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

      this.micInstance = mic({
        rate: this.porcupine.sampleRate,
        channels: '1',
        debug: false,
        exitOnSilence: 0
      });

      const micInputStream = this.micInstance.getAudioStream();

      let frameAccumulator = [];

      micInputStream.on('data', (data) => {
        const int16Data = new Int16Array(data.buffer, data.byteOffset, data.length / 2);

        for (let i = 0; i < int16Data.length; i++) {
          frameAccumulator.push(int16Data[i]);

          if (frameAccumulator.length === this.porcupine.frameLength) {
            const result = this.porcupine.process(new Int16Array(frameAccumulator));
            if (result >= 0) {
              console.log("[WAKEWORD JS] DETECTED");
              onDetected();
            }
            frameAccumulator = [];
          }
        }
      });

      micInputStream.on('error', (err) => {
        console.error("[WAKEWORD JS] Mic error:", err);
        if (onError) onError(err);
      });

      this.micInstance.start();
      this.isListening = true;
      console.log("[WAKEWORD JS] Started listening for wake word");

    } catch (err) {
      console.error("[WAKEWORD JS] Failed to start:", err);
      if (onError) onError(err);
    }
  }

  stop() {
    if (this.micInstance) {
      this.micInstance.stop();
    }
    if (this.porcupine) {
      this.porcupine.release();
    }
    this.isListening = false;
    console.log("[WAKEWORD JS] Stopped listening");
  }
}

module.exports = WakewordHelper;
