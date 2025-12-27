const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');

class BackendManager {
    constructor() {
        this.backendProcess = null;
        this.isRunning = false;
        this.currentTask = null;
        this.messageHandlers = new Map();
        this.setupMessageHandlers();
    }

    setupMessageHandlers() {
        this.messageHandlers.set('ai_response', (data) => {
            this.broadcastToWindows('ai-response', data);
            this._emit('ai-response', data);
        });

        this.messageHandlers.set('action_start', (data) => {
            this.broadcastToWindows('action-start', data);
            this.showVisualEffects();
        });

        this.messageHandlers.set('action_complete', (data) => {
            this.broadcastToWindows('action-complete', data);
        });

        this.messageHandlers.set('task_start', (data) => {
            this.currentTask = data.task;
            this.broadcastToWindows('task-start', data);
            if (data.show_effects) this.showVisualEffects();
        });

        this.messageHandlers.set('task_complete', (data) => {
            this.currentTask = null;
            this.broadcastToWindows('task-complete', data);
            this.hideVisualEffects();
        });

        this.messageHandlers.set('transcription_result', (data) => {
            this.broadcastToWindows('transcription-result', data);
        });

        this.messageHandlers.set('error', (data) => {
            this.broadcastToWindows('backend-error', data);
        });
    }

    getPythonCommandSync() {
        const candidates = ['python3', 'python', 'python.exe', 'py'];
        for (const cmd of candidates) {
            try {
                const res = spawnSync(cmd, ['--version'], { stdio: 'ignore', timeout: 2000 });
                if (res && res.status === 0) return cmd;
            } catch (e) {
                // continue
            }
        }
        return 'python';
    }

    async startBackend() {
        if (this.isRunning) return { success: true };

        try {
            const pythonCmd = this.getPythonCommandSync();
            const backendScript = isDev
                ? path.join(__dirname, '../../backend_modified.py')
                : path.join(process.resourcesPath, 'backend_modified.py');

            const packagedExe = path.join(process.resourcesPath || '', 'server.exe');
            const useExe = !isDev && fs.existsSync(packagedExe);

            console.log(`Starting backend: ${useExe ? packagedExe : pythonCmd + ' ' + backendScript}`);

            if (useExe) {
                this.backendProcess = spawn(packagedExe, [], {
                    cwd: path.join(__dirname, '../../'),
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: { ...process.env }
                });
            } else {
                this.backendProcess = spawn(pythonCmd, [backendScript], {
                    cwd: path.join(__dirname, '../../'),
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: { ...process.env, PYTHONUNBUFFERED: '1' }
                });
            }

            this.backendProcess.on('error', (err) => {
                console.error('Backend process error:', err);
                this.isRunning = false;
            });

            this.backendProcess.on('exit', (code, signal) => {
                console.log(`Backend exited code=${code} signal=${signal}`);
                this.isRunning = false;
                this.backendProcess = null;
            });

            this.backendProcess.stdout.on('data', (buf) => {
                const out = buf.toString();
                this.handleBackendOutput(out);
            });

            this.backendProcess.stderr.on('data', (buf) => {
                console.error('Backend stderr:', buf.toString());
            });

            // quick health check
            await new Promise((resolve) => setTimeout(resolve, 1500));

            if (this.backendProcess && !this.backendProcess.killed) {
                this.isRunning = true;
                console.log('Backend started successfully (fixed manager)');
                return { success: true };
            }

            return { success: false, error: 'failed to start' };
        } catch (err) {
            console.error('startBackend error:', err);
            return { success: false, error: String(err) };
        }
    }

    handleBackendOutput(output) {
        const lines = output.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
            if (line.startsWith('FRONTEND_MESSAGE:')) {
                try {
                    const jsonStr = line.substring('FRONTEND_MESSAGE:'.length).trim();
                    const message = JSON.parse(jsonStr);
                    this.handleFrontendMessage(message);
                } catch (e) {
                    console.error('Failed to parse backend JSON message', e, line);
                }
            } else {
                console.log('Backend:', line);
            }
        }
    }

    handleFrontendMessage(message) {
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            try { handler(message.data); } catch (e) { console.error('handler error', e); }
        } else {
            console.log('Unhandled backend message:', message.type);
        }
    }

    // Small event system for main to subscribe to backend messages
    on(event, cb) {
        if (!this._callbacks) this._callbacks = {};
        if (!this._callbacks[event]) this._callbacks[event] = [];
        this._callbacks[event].push(cb);
    }

    _emit(event, data) {
        if (!this._callbacks || !this._callbacks[event]) return;
        this._callbacks[event].forEach(cb => { try { cb(data); } catch (e) {} });
    }

    async executeTask(task) {
        if (!this.isRunning || !this.backendProcess) throw new Error('Backend not running');

        // If task is an object, support attachments and special types
        let request = { type: 'execute_task', request: task, timestamp: new Date().toISOString() };

        try {
            // Ensure tmp dir
            const tmpDir = path.join(__dirname, '../../tmp');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

            // Handle attachments (base64 -> file path)
            if (task && task.attachments && Array.isArray(task.attachments)) {
                request.request.attachments = [];
                for (const at of task.attachments) {
                    if (at.data) {
                        // strip data URL header if present
                        const b64 = at.data.replace(/^data:.*;base64,/, '');
                        const filename = `${Date.now()}-${at.name}`.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                        const filePath = path.join(tmpDir, filename);
                        fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
                        request.request.attachments.push({ name: at.name, path: filePath, type: at.type });
                    } else if (at.path) {
                        request.request.attachments.push({ name: at.name, path: at.path, type: at.type });
                    }
                }
            }

            // Handle transcription payloads
            if (task && task.type === 'transcribe' && task.audio && task.audio.data) {
                const b64 = task.audio.data.replace(/^data:.*;base64,/, '');
                const filename = `audio-${Date.now()}-${task.audio.name}`.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                const filePath = path.join(tmpDir, filename);
                fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
                // send a request to the backend to transcribe the file
                request = { type: 'transcribe', audio_path: filePath, timestamp: new Date().toISOString() };
            }

            this.backendProcess.stdin.write(`FRONTEND_REQUEST:${JSON.stringify(request)}\n`);
            return { success: true, task };
        } catch (err) {
            console.error('executeTask error:', err);
            return { success: false, error: String(err) };
        }
    }

    stopTask() {
        if (this.currentTask && this.backendProcess) {
            try { this.backendProcess.kill('SIGINT'); } catch (e) {}
            const task = this.currentTask; this.currentTask = null;
            this.broadcastToWindows('task-stopped', { task });
            this.hideVisualEffects();
            return { success: true, task };
        }
        return { success: false, message: 'No task running' };
    }

    stopBackend() {
        if (this.backendProcess && !this.backendProcess.killed) {
            try { this.backendProcess.kill('SIGTERM'); } catch (e) {}
            setTimeout(() => { try { this.backendProcess && !this.backendProcess.killed && this.backendProcess.kill('SIGKILL'); } catch (e) {} }, 5000);
        }
        this.isRunning = false; this.backendProcess = null; this.currentTask = null;
    }

    showVisualEffects() {
        if (global.windowManager) global.windowManager.showVisualEffect('task-active');
    }
    hideVisualEffects() {
        if (global.windowManager) global.windowManager.showVisualEffect('task-inactive');
    }

    broadcastToWindows(channel, data) {
        if (global.windowManager) {
            const windows = global.windowManager.getAllWindows();
            windows.forEach(w => { if (w && !w.isDestroyed()) w.webContents.send(channel, data); });
        }
    }

    getStatus() {
        return { isRunning: this.isRunning, currentTask: this.currentTask, pid: this.backendProcess ? this.backendProcess.pid : null };
    }
}

module.exports = BackendManager;
