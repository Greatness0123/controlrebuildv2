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

      this.micInstance = mic({
        rate: this.porcupine.sampleRate,
        channels: '1',
        debug: false,
        exitOnSilence: 0,
        endian: 'little',
        bitwidth: '16',
        encoding: 'signed-integer'
      });

      const micInputStream = this.micInstance.getAudioStream();

      let frameAccumulator = new Int16Array(this.porcupine.frameLength);
      let accumulatorIndex = 0;

      micInputStream.on('data', (data) => {
        // data is a Buffer (Uint8Array)
        const frameLength = this.porcupine.frameLength;

        for (let i = 0; i < data.length; i += 2) {
          if (i + 1 < data.length) {
            // Read 16-bit signed integer (little-endian)
            const sample = data.readInt16LE(i);
            frameAccumulator[accumulatorIndex++] = sample;

            if (accumulatorIndex === frameLength) {
              const result = this.porcupine.process(frameAccumulator);
              if (result >= 0) {
                const now = Date.now();
                if (now - this.lastDetection > 1500) { // 1.5s cooldown
                  this.lastDetection = now;
                  console.log("[WAKEWORD JS] DETECTED");
                  onDetected();
                }
              }
              // Reset accumulator but we don't need to re-allocate
              accumulatorIndex = 0;
            }
          }
        }
      });

      micInputStream.on('error', (err) => {
        console.error("[WAKEWORD JS] Mic error:", err);
        if (onError) onError(err);
      });

      this.micInstance.start();
      this.isListening = true;
      console.log("[WAKEWORD JS] Started listening for wake word: " + path.basename(this.modelPath));

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
