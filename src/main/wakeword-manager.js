const path = require('path');
const fs = require('fs');
const WakewordHelper = require('./backends/wakeword-helper');

class WakewordManager {
    constructor() {
        const { app } = require('electron');
        this.isRunning = false;
        this.isEnabled = false;
        this.helper = new WakewordHelper();
        this.logFile = path.join(app.getPath('userData'), 'wakeword-manager.log');
    }

    logToFile(msg) {
        try {
            const timestamp = new Date().toISOString();
            fs.appendFileSync(this.logFile, `[${timestamp}] ${msg}\n`);
        } catch (e) {
            console.error('Failed to write to wakeword log file', e);
        }
    }

    async start() {
        if (this.isRunning) return;

        console.log('[WakewordManager] Starting wake word detection...');
        this.logToFile('Starting wake word detection...');

        try {
            await this.helper.start(
                () => {
                    // Detected
                    console.log('[WakewordManager] Wake word DETECTED');
                    this.logToFile('Wake word DETECTED');
                    process.emit && process.emit('hotkey-triggered', { event: 'wakeword-detected' });
                },
                (err) => {
                    // Error during loop
                    console.error('[WakewordManager] Helper error during operation:', err);
                    this.logToFile(`Helper error during operation: ${err}`);

                    // Critical failure in the loop - mark as not running to allow auto-retry
                    this.isRunning = false;

                    setTimeout(() => {
                        if (this.isEnabled && !this.isRunning) {
                            console.log('[WakewordManager] Restarting wake word after operational error...');
                            this.start();
                        }
                    }, 5000);
                }
            );
            this.isRunning = true;
            console.log('[WakewordManager] Wake word detection started successfully');
            this.logToFile('Wake word detection started successfully');
        } catch (err) {
            console.error('[WakewordManager] Failed to start wake word helper:', err);
            this.logToFile(`Failed to start wake word helper: ${err}`);
            this.isRunning = false;

            // Auto-retry after failure
            setTimeout(() => {
                if (this.isEnabled && !this.isRunning) {
                    console.log('[WakewordManager] Retrying wake word start...');
                    this.start();
                }
            }, 5000);
        }
    }

    stop() {
        if (!this.isRunning) return;
        this.helper.stop();
        this.isRunning = false;
        console.log('[WakewordManager] Wake word detection stopped');
    }

    async enable(enabled) {
        this.isEnabled = !!enabled;
        if (this.isEnabled) {
            await this.start();
        } else {
            this.stop();
        }
    }
}

module.exports = WakewordManager;
