const path = require('path');
const fs = require('fs');
const WakewordHelper = require('./backends/wakeword-helper');
const { ipcMain } = require('electron');

class WakewordManager {
    constructor() {
        const { app } = require('electron');
        this.isRunning = false;
        this.isEnabled = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.retryTimeout = null;
        this.logFile = path.join(app.getPath('userData'), 'wakeword.log');
        this.devToolsWindows = [];

        // Initialize helper with logger that writes to file and devtools
        this.helper = new WakewordHelper({
            logger: (msg, level = 'log') => this.logWithDevTools(msg, level)
        });
    }

    registerDevToolsWindow(window) {
        if (!this.devToolsWindows.includes(window)) {
            this.devToolsWindows.push(window);
        }
    }

    sendToDevTools(msg, level = 'log') {
        try {
            this.devToolsWindows.forEach(win => {
                if (win && !win.isDestroyed()) {
                    try {
                        win.webContents.send('devtools-log', { message: msg, level, timestamp: new Date().toISOString() });
                    } catch (e) {
                        // Window might be closed, ignore
                    }
                }
            });
        } catch (e) {
            // Silently fail
        }
    }

    logToFile(msg) {
        try {
            const timestamp = new Date().toISOString();
            fs.appendFileSync(this.logFile, `[${timestamp}] ${msg}\n`);
        } catch (e) {
            console.error('Failed to write to wakeword log file', e);
        }
    }

    logWithDevTools(msg, level = 'log') {
        console.log(`[WakewordManager] ${msg}`);
        this.logToFile(msg);
        this.sendToDevTools(msg, level);
    }

    async start() {
        if (this.isRunning) return;
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }

        this.logWithDevTools(`Starting wake word detection (attempt ${this.retryCount + 1}/${this.maxRetries + 1})...`, 'info');

        try {
            await this.helper.start(
                () => {
                    // Detected
                    this.logWithDevTools('Wake word DETECTED', 'success');
                    process.emit && process.emit('hotkey-triggered', { event: 'wakeword-detected' });
                },
                (err) => {
                    // Error during loop
                    this.logWithDevTools(`Helper error during operation: ${err}`, 'error');

                    // Critical failure in the loop - mark as not running to allow auto-retry
                    this.isRunning = false;
                    this.handleRetry();
                }
            );
            this.isRunning = true;
            this.retryCount = 0; // Reset retry count on successful start
            this.logWithDevTools('Wake word detection started successfully', 'success');
        } catch (err) {
            this.logWithDevTools(`Failed to start wake word helper: ${err.message || err}`, 'error');
            this.isRunning = false;
            this.handleRetry();
        }
    }

    handleRetry() {
        if (!this.isEnabled || this.isRunning) return;

        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            // Exponential backoff: 2s, 4s, 8s, 16s, 32s...
            const delay = Math.pow(2, this.retryCount) * 1000;

            this.logWithDevTools(`Scheduling retry in ${delay/1000}s (retry ${this.retryCount}/${this.maxRetries})`, 'warn');

            this.retryTimeout = setTimeout(async () => {
                this.retryTimeout = null;
                if (this.isEnabled && !this.isRunning) {
                    await this.start();
                }
            }, delay);
        } else {
            this.logWithDevTools('Maximum retry attempts reached. Wake word detection disabled to prevent system lag.', 'error');
            this.isEnabled = false;
            // Notify UI
            try {
                process.emit && process.emit('wakeword-error', {
                    message: 'Wake word detection failed repeatedly and has been disabled.'
                });
            } catch (e) {}
        }
    }

    stop() {
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
        if (!this.isRunning) return;
        this.helper.stop();
        this.isRunning = false;
        this.logWithDevTools('Wake word detection stopped', 'info');
    }

    async enable(enabled) {
        const wasEnabled = this.isEnabled;
        this.isEnabled = !!enabled;

        if (this.isEnabled) {
            if (!wasEnabled || !this.isRunning) {
                this.retryCount = 0; // Reset retry count when manually enabling
                await this.start();
            }
        } else {
            this.stop();
        }
    }
}

module.exports = WakewordManager;
