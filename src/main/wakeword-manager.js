const path = require('path');
const fs = require('fs');
const WakewordHelper = require('./backends/wakeword-helper');
const { ipcMain } = require('electron');

class WakewordManager {
    constructor() {
        const { app } = require('electron');
        this.isRunning = false;
        this.isEnabled = false;
        this.helper = new WakewordHelper();
        this.logFile = path.join(app.getPath('userData'), 'wakeword-manager.log');
        this.devToolsWindows = [];
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

        this.logWithDevTools('Starting wake word detection...', 'info');

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

                    setTimeout(() => {
                        if (this.isEnabled && !this.isRunning) {
                            this.logWithDevTools('Restarting wake word after operational error...', 'warn');
                            this.start();
                        }
                    }, 5000);
                }
            );
            this.isRunning = true;
            this.logWithDevTools('Wake word detection started successfully', 'success');
        } catch (err) {
            this.logWithDevTools(`Failed to start wake word helper: ${err}`, 'error');
            this.isRunning = false;

            // Auto-retry after failure
            setTimeout(() => {
                if (this.isEnabled && !this.isRunning) {
                    this.logWithDevTools('Retrying wake word start...', 'warn');
                    this.start();
                }
            }, 5000);
        }
    }

    stop() {
        if (!this.isRunning) return;
        this.helper.stop();
        this.isRunning = false;
        this.logWithDevTools('Wake word detection stopped', 'info');
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
