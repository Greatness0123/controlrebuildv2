const path = require('path');
const fs = require('fs');
const WakewordHelper = require('./backends/wakeword-helper');

class WakewordManager {
    constructor() {
        this.isRunning = false;
        this.isEnabled = false;
        this.helper = new WakewordHelper();
    }

    start() {
        if (this.isRunning) return;

        this.helper.start(
            () => {
                // Detected
                process.emit && process.emit('hotkey-triggered', { event: 'wakeword-detected' });
            },
            (err) => {
                // Error
                console.error('[WakewordManager] Helper error:', err);
                this.isRunning = false;
            }
        );
        this.isRunning = true;
    }

    stop() {
        if (!this.isRunning) return;
        this.helper.stop();
        this.isRunning = false;
    }

    enable(enabled) {
        this.isEnabled = !!enabled;
        if (this.isEnabled) this.start(); else this.stop();
    }
}

module.exports = WakewordManager;
