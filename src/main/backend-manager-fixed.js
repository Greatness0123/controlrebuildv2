const path = require('path');
const fs = require('fs');
const ActBackend = require('./backends/act-backend');
const AskBackend = require('./backends/ask-backend');
const { app } = require('electron');

class BackendManager {
    constructor() {
        this.actBackend = null;
        this.askBackend = null;
        this.isRunning = false;
        this.isReady = false;
        this.currentTask = null;
        this.messageHandlers = new Map();
        this.readyPromise = null;
        this.readyResolve = null;
        this.setupMessageHandlers();
    }

    logToFile(msg) {
        try {
            const logDir = app.getPath('userData');
            const logPath = path.join(logDir, 'backend-manager.log');
            const timestamp = new Date().toISOString();
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
            if (global.windowManager) {
                global.windowManager.hideWindow('chat');
            }
        });

        this.messageHandlers.set('action_step', (data) => {
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
            if (global.windowManager) {
                global.windowManager.hideWindow('chat');
            }
        });

        this.messageHandlers.set('task_complete', (data) => {
            this.currentTask = null;
            this.broadcastToWindows('task-complete', data);
            this.hideVisualEffects();
            if (global.windowManager) {
                setTimeout(() => {
                    global.windowManager.showWindow('chat');
                }, 500);
            }
        });

        this.messageHandlers.set('error', (data, source) => {
            this.broadcastToWindows('backend-error', data);
            if (source === 'ACT' && this.currentTask) {
                this.stopTask();
            }
        });
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
            console.log('Starting JS Act and Ask Backends...');
            this.logToFile('Starting JS Act and Ask Backends...');

            this.isReady = false;
            this.actBackend = new ActBackend();
            this.askBackend = new AskBackend();

            this.isRunning = true;
            this.isReady = true;
            if (this.readyResolve) {
                this.readyResolve();
                this.readyResolve = null;
            }
            console.log('Both JS Act and Ask backends started successfully');
            this.logToFile('Both JS Act and Ask backends started successfully');
            return { success: true };

        } catch (err) {
            console.error('startBackend error:', err);
            this.logToFile(`startBackend error: ${err}`);
            return { success: false, error: String(err) };
        }
    }

    handleFrontendMessage(message, source) {
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            try { handler(message.data, source); } catch (e) { console.error('handler error', e); }
        }
    }

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
            await this.startBackend();
            if (!this.isRunning) throw new Error('Backends not running');
        }

        const backend = mode === 'ask' ? this.askBackend : this.actBackend;
        const targetLabel = mode === 'ask' ? 'ASK' : 'ACT';

        if (!backend) throw new Error(`${targetLabel} backend is not initialized`);

        try {
            const tmpDir = path.join(app.getPath('userData'), 'tmp');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

            const processedAttachments = [];
            if (task && task.attachments && Array.isArray(task.attachments)) {
                for (const at of task.attachments) {
                    try {
                        let filePath = null;
                        let fileName = at.name || 'unknown_file';
                        const safeName = `${Date.now()}-${fileName}`.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                        filePath = path.join(tmpDir, safeName);

                        if (at.data && Array.isArray(at.data)) {
                            fs.writeFileSync(filePath, Buffer.from(at.data));
                        } else if (at.path) {
                            filePath = at.path;
                        } else if (at.data && typeof at.data === 'string') {
                            const b64 = at.data.startsWith('data:') ? at.data.replace(/^data:.*;base64,/, '') : at.data;
                            fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
                        }

                        if (filePath) {
                            processedAttachments.push({ name: fileName, path: filePath, type: at.type || 'application/octet-stream' });
                        }
                    } catch (attErr) {
                        console.error(`[BackendManager] Failed to process attachment: ${attErr}`);
                    }
                }
            }

            const onResponse = (data) => this.handleFrontendMessage({ type: 'ai_response', data }, targetLabel);
            const onError = (data) => this.handleFrontendMessage({ type: 'error', data }, targetLabel);
            const onEvent = (type, data) => this.handleFrontendMessage({ type, data }, targetLabel);

            backend.processRequest(task.text, processedAttachments, (typeOrData, data) => {
                if (typeof typeOrData === 'string') {
                    onEvent(typeOrData, data);
                } else {
                    onResponse(typeOrData);
                }
            }, onError, task.api_key);

            return { success: true, task };
        } catch (err) {
            console.error('executeTask error:', err);
            return { success: false, error: String(err) };
        }
    }

    stopTask() {
        console.log('[BackendManager] stopTask() called. currentTask:', this.currentTask);
        let taskStopped = false;

        if (this.actBackend) {
            try {
                this.actBackend.stopTask();
                taskStopped = true;
            } catch (e) { console.error('[BackendManager] Error stopping actBackend:', e); }
        }

        if (this.askBackend) {
            // Ask backend might not have stopTask but let's be safe
            try { if (this.askBackend.stopTask) this.askBackend.stopTask(); } catch (e) { }
        }

        const task = this.currentTask || 'Current Task';
        this.currentTask = null;

        this.broadcastToWindows('task-stopped', { task });
        this.hideVisualEffects();

        if (global.windowManager) {
            setTimeout(() => {
                if (global.windowManager) global.windowManager.showWindow('chat');
            }, 300);
        }

        return { success: true, task };
    }

    stopBackend() {
        if (this.actBackend && this.actBackend.stopTask) this.actBackend.stopTask();
        this.isRunning = false;
        this.actBackend = null;
        this.askBackend = null;
        this.currentTask = null;
    }

    showVisualEffects() { if (global.windowManager) global.windowManager.showVisualEffect('task-active'); }
    hideVisualEffects() { if (global.windowManager) global.windowManager.showVisualEffect('task-inactive'); }

    broadcastToWindows(channel, data) {
        if (global.windowManager) {
            const windows = global.windowManager.getAllWindows();
            windows.forEach(w => { if (w && !w.isDestroyed()) w.webContents.send(channel, data); });
        }
    }

    getStatus() {
        return { isRunning: this.isRunning, currentTask: this.currentTask };
    }
}

module.exports = BackendManager;
