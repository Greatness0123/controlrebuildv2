const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class WakewordManager {
    constructor() {
        this.isRunning = false;
        this.isEnabled = false;
        this.proc = null;
    }

    start() {
        if (this.isRunning) return;

        // Look for a local porcupine/picovoice helper binary in assets/wakeword
        const pyHelper = path.join(__dirname, '../../assets/wakeword/wakeword_helper.py');
        const nativeHelper = path.join(__dirname, '../../assets/wakeword/porcupine');

        let spawnArgs = null;
        let cmd = null;

        if (fs.existsSync(pyHelper)) {
            cmd = 'python';
            spawnArgs = [pyHelper, '--model', path.join(__dirname, '../../assets/wakeword/hey-control_en_windows_v4_0_0.ppn')];
            
            // Add access key if available from environment variable
            const accessKey = process.env.PORCUPINE_ACCESS_KEY;
            if (accessKey) {
                spawnArgs.push('--access-key', accessKey);
            }
        } else if (fs.existsSync(nativeHelper)) {
            cmd = nativeHelper;
            spawnArgs = [];
        } else {
            console.warn('Wakeword helper not found; running placeholder');
            this.isRunning = true;
            return;
        }

        try {
            this.proc = spawn(cmd, spawnArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

            this.proc.stdout.on('data', (buf) => {
                const s = buf.toString().trim();
                console.log('Wakeword stdout:', s);
                if (/DETECTED|detected|wakeword/i.test(s)) {
                    process.emit && process.emit('hotkey-triggered', { event: 'toggle-chat' });
                }
                if (/PORCUPINE_MISSING/i.test(s) || /Porcupine\/PyAudio not installed/i.test(s)) {
                    console.warn('Wakeword helper missing dependencies');
                }
            });

            this.proc.stderr.on('data', (buf) => console.error('Wakeword stderr:', buf.toString()));
            this.proc.on('exit', () => { this.isRunning = false; this.proc = null; });
            this.isRunning = true;
            console.log('Wakeword helper started');
        } catch (e) {
            console.error('Failed to spawn wakeword helper', e);
            this.isRunning = true; // fallback
        }
    }

    stop() {
        if (!this.isRunning) return;
        if (this.proc) {
            try { this.proc.kill(); } catch (e) {}
            this.proc = null;
        }
        this.isRunning = false;
    }

    enable(enabled) {
        this.isEnabled = !!enabled;
        if (this.isEnabled) this.start(); else this.stop();
    }
}

module.exports = WakewordManager;
