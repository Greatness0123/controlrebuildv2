const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');

class BackendManager {
    constructor() {
        this.actProcess = null;
        this.askProcess = null;
        this.isRunning = false;
        this.isReady = false;
        this.currentTask = null;
        this.messageHandlers = new Map();
        this.readyPromise = null;
        this.readyResolve = null;
        this.setupMessageHandlers();
    }

    logToFile(msg) {
        const logPath = path.join(__dirname, '../../backend-manager.log');
        const timestamp = new Date().toISOString();
        try {
            fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
        } catch (e) {
            console.error('Failed to write to log file', e);
        }
    }

    setupMessageHandlers() {
        this.messageHandlers.set('ai_response', (data) => {
            this.broadcastToWindows('ai-response', data);
            this._emit('ai-response', data);
        });

        this.messageHandlers.set('action_start', (data) => {
            this.broadcastToWindows('action-start', data);
            this.showVisualEffects();
            // Hide chat window to not obstruct AI actions
            if (global.windowManager) {
                global.windowManager.hideWindow('chat');
            }
        });

        this.messageHandlers.set('action_step', (data) => {
            // Send step progress to frontend
            this.broadcastToWindows('action-step', data);
            console.log(`[ACTION] Step ${data.step}/${data.total_steps}: ${data.description}`);
        });

        this.messageHandlers.set('action_complete', (data) => {
            this.broadcastToWindows('action-complete', data);
        });

        this.messageHandlers.set('task_start', (data) => {
            this.currentTask = data.task;
            this.broadcastToWindows('task-start', data);
            if (data.show_effects) this.showVisualEffects();
            // Hide chat window to not obstruct AI actions
            if (global.windowManager) {
                global.windowManager.hideWindow('chat');
            }
        });

        this.messageHandlers.set('task_complete', (data) => {
            this.currentTask = null;
            this.broadcastToWindows('task-complete', data);
            this.hideVisualEffects();
            // Show chat window again when task completes
            if (global.windowManager) {
                setTimeout(() => {
                    global.windowManager.showWindow('chat');
                }, 500);
            }
        });

        this.messageHandlers.set('transcription_result', (data) => {
            this.broadcastToWindows('transcription-result', data);
        });

        this.messageHandlers.set('error', (data, source) => {
            this.broadcastToWindows('backend-error', data);

            // Auto-stop task if error comes from ACT backend while a task is running
            if (source === 'ACT' && this.currentTask) {
                console.log('[BackendManager] Error received from ACT backend, auto-stopping task...');
                this.stopTask();
            }
        });
    }

    getPythonCommandSync() {
        const candidates = process.platform === 'win32'
            ? ['python', 'python3', 'py', 'python.exe']
            : ['python3', 'python'];

        for (const cmd of candidates) {
            try {
                // Check version
                const versionRes = spawnSync(cmd, ['--version'], { stdio: 'ignore', timeout: 2000 });
                if (versionRes && versionRes.status === 0) {
                    // Check critical dependencies
                    const depRes = spawnSync(cmd, ['-c', 'import websockets; import vosk'], { stdio: 'ignore', timeout: 3000 });
                    if (depRes && depRes.status === 0) {
                        console.log(`Found valid Python with dependencies: ${cmd}`);
                        return cmd;
                    }
                }
            } catch (e) {
                // continue
            }
        }

        console.warn('Could not find Python with websockets/vosk installed, defaulting to python');
        this.logToFile('Could not find Python with websockets/vosk installed, defaulting to python');
        return 'python';
    }

    waitForReady() {
        if (this.isReady) {
            return Promise.resolve();
        }
        if (!this.readyPromise) {
            this.readyPromise = new Promise((resolve) => {
                this.readyResolve = resolve;
            });
        }
        return this.readyPromise;
    }

    async startBackend() {
        if (this.isRunning) return { success: true };

        try {
            const pythonCmd = this.getPythonCommandSync();

            const actScript = isDev
                ? path.join(__dirname, '../../act_backend.py')
                : path.join(process.resourcesPath, 'act_backend.py');

            const askScript = isDev
                ? path.join(__dirname, '../../ask_backend.py')
                : path.join(process.resourcesPath, 'ask_backend.py');

            console.log(`Starting Act Backend: ${pythonCmd} ${actScript}`);
            console.log(`Starting Ask Backend: ${pythonCmd} ${askScript}`);
            this.logToFile(`Starting Act Backend: ${pythonCmd} ${actScript}`);
            this.logToFile(`Starting Ask Backend: ${pythonCmd} ${askScript}`);

            this.isReady = false;
            this.actProcess = this.spawnPython(pythonCmd, actScript, 'ACT');

            // Start ASK Process
            this.askProcess = this.spawnPython(pythonCmd, askScript, 'ASK');

            // Quick health check
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Increased from 1500

            if (this.actProcess && !this.actProcess.killed && this.askProcess && !this.askProcess.killed) {
                this.isRunning = true;
                this.isReady = true;
                if (this.readyResolve) {
                    this.readyResolve();
                    this.readyResolve = null;
                }
                console.log('Both Act and Ask backends started successfully');
                this.logToFile('Both Act and Ask backends started successfully');
                return { success: true };
            }

            if ((!this.actProcess || this.actProcess.killed) && (!this.askProcess || this.askProcess.killed)) {
                this.logToFile('Both backends failed to start');
                return { success: false, error: 'Both backends failed to start' };
            }

            this.isRunning = true;
            this.isReady = true;
            if (this.readyResolve) {
                this.readyResolve();
                this.readyResolve = null;
            }
            this.logToFile('Backends started (partial)');
            return { success: true, message: 'Backends started (one might have failed, check logs)' };

        } catch (err) {
            console.error('startBackend error:', err);
            this.logToFile(`startBackend error: ${err}`);
            return { success: false, error: String(err) };
        }
    }

    spawnPython(cmd, script, label) {
        const pythonProcess = spawn(cmd, [script], {
            cwd: path.join(__dirname, '../../'),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        pythonProcess.on('error', (err) => {
            console.error(`[${label}] Process error:`, err);
        });

        pythonProcess.on('exit', (code, signal) => {
            console.log(`[${label}] Exited code=${code} signal=${signal}`);
            if (label === 'ACT') {
                this.actProcess = null;
                console.error('[ACT] Process terminated unexpectedly');
                this.logToFile('[ACT] Process terminated unexpectedly');
            }
            if (label === 'ASK') {
                this.askProcess = null;
                console.error('[ASK] Process terminated unexpectedly');
                this.logToFile('[ASK] Process terminated unexpectedly');
            }
            // If both die, mark as not running
            if (!this.actProcess && !this.askProcess) {
                this.isRunning = false;
            }
        });

        pythonProcess.stdout.on('data', (buf) => {
            const out = buf.toString();
            this.handleBackendOutput(out, label);
        });

        pythonProcess.stderr.on('data', (buf) => {
            console.error(`[${label}] Stderr:`, buf.toString());
        });

        return pythonProcess;
    }

    handleBackendOutput(output, label) {
        const lines = output.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
            if (line.startsWith('FRONTEND_MESSAGE:')) {
                try {
                    const jsonStr = line.substring('FRONTEND_MESSAGE:'.length).trim();
                    const message = JSON.parse(jsonStr);
                    // Add source label if needed, or just handle generically
                    this.handleFrontendMessage(message, label);
                } catch (e) {
                    console.error(`[${label}] Failed to parse JSON message`, e, line);
                }
            } else {
                console.log(`[${label}]:`, line);
            }
        }
    }

    handleFrontendMessage(message, source) {
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            try { handler(message.data, source); } catch (e) { console.error('handler error', e); }
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
        this._callbacks[event].forEach(cb => { try { cb(data); } catch (e) { } });
    }

    async executeTask(task, mode = 'act') {
        if (!this.isRunning) {
            console.log('Backends not running, attempting to restart...');
            this.logToFile('Backends not running, attempting to restart...');
            await this.startBackend();
            if (!this.isRunning) {
                this.logToFile('Failed to restart backends');
                throw new Error('Backends not running and failed to restart');
            }
        }

        const targetProcess = mode === 'ask' ? this.askProcess : this.actProcess;
        const targetLabel = mode === 'ask' ? 'ASK' : 'ACT';

        if (!targetProcess) throw new Error(`${targetLabel} backend is not running`);

        // Prepare request
        let requestType = mode === 'ask' ? 'ask_question' : 'execute_task';
        let requestPayload = {
            type: requestType,
            request: task,
            timestamp: new Date().toISOString()
        };

        try {
            // Ensure tmp dir for attachments if needed
            const tmpDir = path.join(__dirname, '../../tmp');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

            // Handle attachments logic (shared)
            if (task && task.attachments && Array.isArray(task.attachments)) {
                requestPayload.request.attachments = [];
                for (const at of task.attachments) {
                    if (at.data && Array.isArray(at.data)) {
                        // Raw binary data as Uint8Array array - convert directly to buffer
                        const filename = `${Date.now()}-${at.name}`.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                        const filePath = path.join(tmpDir, filename);
                        const buffer = Buffer.from(at.data);
                        fs.writeFileSync(filePath, buffer);
                        requestPayload.request.attachments.push({ name: at.name, path: filePath, type: at.type });
                    } else if (at.path) {
                        // Already a file path
                        requestPayload.request.attachments.push({ name: at.name, path: at.path, type: at.type });
                    } else if (at.data && typeof at.data === 'string' && at.data.startsWith('data:')) {
                        // Legacy base64 data URL support
                        const b64 = at.data.replace(/^data:.*;base64,/, '');
                        const filename = `${Date.now()}-${at.name}`.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                        const filePath = path.join(tmpDir, filename);
                        fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
                        requestPayload.request.attachments.push({ name: at.name, path: filePath, type: at.type });
                    } else if (at.data && typeof at.data === 'string') {
                        // Legacy base64 string (without data: prefix)
                        const filename = `${Date.now()}-${at.name}`.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                        const filePath = path.join(tmpDir, filename);
                        fs.writeFileSync(filePath, Buffer.from(at.data, 'base64'));
                        requestPayload.request.attachments.push({ name: at.name, path: filePath, type: at.type });
                    }
                }
            }

            // Handle transcription (usually routed to ACT or specific Vosk, but here sticking to pattern)
            if (task && task.type === 'transcribe') {
                // This might need specific handling, but assuming current Vosk flow sits side-by-side
                // If transcription needs to go to python, it goes to ACT usually, or we use the new vosk server
                // For now, let's assume transcription is handled via the separate Vosk server
            }

            targetProcess.stdin.write(`FRONTEND_REQUEST:${JSON.stringify(requestPayload)}\n`);
            return { success: true, task };
        } catch (err) {
            console.error('executeTask error:', err);
            return { success: false, error: String(err) };
        }
    }

    stopTask() {
        if (this.currentTask && this.actProcess && !this.actProcess.killed) {
            try {
                const cancelMessage = 'FRONTEND_REQUEST:' + JSON.stringify({
                    type: 'cancel_task',
                    timestamp: new Date().toISOString()
                }) + '\n';
                this.actProcess.stdin.write(cancelMessage);
            } catch (e) {
                console.error('[BackendManager] Failed to send cancel message:', e);
            }

            const task = this.currentTask;
            this.currentTask = null;
            this.broadcastToWindows('task-stopped', { task });
            this.hideVisualEffects();
            if (global.windowManager) {
                setTimeout(() => {
                    global.windowManager.showWindow('chat');
                }, 300);
            }
            return { success: true, task };
        }
        return { success: false, message: 'No task running' };
    }

    stopBackend() {
        const cleanup = (proc) => {
            if (proc && !proc.killed) {
                try { proc.kill('SIGTERM'); } catch (e) { }
                setTimeout(() => { try { proc && !proc.killed && proc.kill('SIGKILL'); } catch (e) { } }, 5000);
            }
        };
        cleanup(this.actProcess);
        cleanup(this.askProcess);

        this.isRunning = false;
        this.actProcess = null;
        this.askProcess = null;
        this.currentTask = null;
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
        return {
            isRunning: this.isRunning,
            currentTask: this.currentTask,
            actPid: this.actProcess ? this.actProcess.pid : null,
            askPid: this.askProcess ? this.askProcess.pid : null
        };
    }
}

module.exports = BackendManager;
