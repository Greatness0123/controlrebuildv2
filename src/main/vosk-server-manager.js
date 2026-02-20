/**
 * Vosk Server Manager
 * Manages startup and lifecycle of the Vosk STT server (streaming WebSocket version)
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
// const VoskStreamingClient = require('./vosk-streaming-client'); // Removed

class VoskServerManager {
    constructor() {
        const { app } = require('electron');
        this.serverProcess = null;
        this.client = null;
        this.port = 2700;
        this.host = '127.0.0.1';
        this.isRunning = false;
        this.pythonExePath = null;

        this.resolvePaths();

        const logDir = app.getPath('userData');
        this.logFile = path.join(logDir, 'vosk-server.log');
        this.errorFile = path.join(logDir, 'vosk-server-error.log');
    }

    resolvePaths() {
        const { app } = require('electron');
        const isPackaged = app.isPackaged;

        const searchDirs = [];
        if (isPackaged) {
            searchDirs.push(process.resourcesPath);
            searchDirs.push(path.join(process.resourcesPath, "app.asar.unpacked"));
        } else {
            searchDirs.push(path.join(__dirname, "../../"));
        }
        searchDirs.push(process.cwd());

        // Find vosk_server_v2.py
        this.serverScriptPath = null;
        for (const dir of searchDirs) {
            const p = path.join(dir, "vosk_server_v2.py");
            if (fs.existsSync(p)) {
                this.serverScriptPath = p;
                console.log(`[Vosk] Found server script at: ${p}`);
                break;
            }
        }
        if (!this.serverScriptPath) {
            this.serverScriptPath = path.join(searchDirs[0], "vosk_server_v2.py");
            console.error(`[Vosk] Server script not found. Fallback: ${this.serverScriptPath}`);
        }

        // Find vosk-model
        this.modelPath = null;
        const modelSubDirs = ["assets/vosk-model", "vosk-model"];
        for (const dir of searchDirs) {
            for (const sub of modelSubDirs) {
                const p = path.join(dir, sub);
                if (fs.existsSync(p)) {
                    this.modelPath = p;
                    console.log(`[Vosk] Found model at: ${p}`);
                    break;
                }
            }
            if (this.modelPath) break;
        }
        if (!this.modelPath) {
            this.modelPath = path.join(searchDirs[0], "assets/vosk-model");
            console.error(`[Vosk] Model not found. Fallback: ${this.modelPath}`);
        }
    }

    /**
     * Find Python executable
     */
    async findPythonExecutable() {
        try {
            // Try common Python commands
            const commands = ['python', 'python3', 'py'];
            let lastError = 'No commands tried';

            for (const cmd of commands) {
                try {
                    console.log(`[Vosk] Checking Python command: ${cmd}`);
                    const { stdout } = await exec(`${cmd} --version`, {
                        timeout: 5000
                    });

                    // Verify it has vosk and websockets installed
                    try {
                        console.log(`[Vosk] Verifying dependencies for: ${cmd}`);
                        await exec(`${cmd} -c "import vosk; import websockets"`, { timeout: 5000 });
                        console.log(`[Vosk] Found suitable Python: ${cmd}`);
                        return cmd;
                    } catch (err) {
                        console.warn(`[Vosk] Dependencies missing for ${cmd}: ${err.message}`);
                        lastError = `Dependencies (vosk, websockets) missing for ${cmd}`;
                        continue;
                    }
                } catch (err) {
                    // Command not found
                    continue;
                }
            }

            throw new Error(`No suitable Python installation found. Last error: ${lastError}. Please run: pip install vosk websockets`);
        } catch (error) {
            throw new Error(`Failed to find Python executable: ${error.message}`);
        }
    }

    /**
     * Check if server is ready by attempting a connection
     */
    async waitForServer(maxAttempts = 15, delayMs = 1000) {
        const net = require('net');
        for (let i = 0; i < maxAttempts; i++) {
            // Check if process is still alive
            if (this.serverProcess && this.serverProcess.exitCode !== null) {
                console.error(`[Vosk] Server process died during startup with code: ${this.serverProcess.exitCode}`);
                return false;
            }

            try {
                await new Promise((resolve, reject) => {
                    const socket = net.createConnection(this.port, this.host);
                    socket.on('connect', () => {
                        socket.destroy();
                        resolve();
                    });
                    socket.on('error', reject);
                    setTimeout(() => {
                        socket.destroy();
                        reject(new Error('Timeout'));
                    }, 800);
                });
                console.log(`[Vosk] Server is responding on port ${this.port}`);
                return true;
            } catch (err) {
                if (i % 3 === 0) {
                    console.log(`[Vosk] Waiting for server... (attempt ${i + 1}/${maxAttempts})`);
                }
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return false;
    }

    /**
     * Check if port is in use and try to kill the process if it is
     */
    async ensurePortAvailable(port) {
        return new Promise(async (resolve) => {
            const isUsed = await new Promise((res) => {
                const net = require('net');
                const server = net.createServer();
                server.once('error', (err) => {
                    if (err.code === 'EADDRINUSE') res(true);
                    else res(false);
                });
                server.once('listening', () => {
                    server.close();
                    res(false);
                });
                server.listen(port, this.host);
            });

            if (isUsed) {
                console.log(`[Vosk] Port ${port} is in use. Attempting to clear it...`);
                try {
                    if (process.platform === 'win32') {
                        // More robust way to find and kill process on port
                        const cmd = `for /f "tokens=5" %a in ('netstat -aon ^| findstr LISTENING ^| findstr :${port}') do taskkill /f /pid %a`;
                        execSync(cmd, { stdio: 'ignore' });
                    } else {
                        execSync(`lsof -t -i:${port} | xargs kill -9`, { stdio: 'ignore' });
                    }
                    console.log(`[Vosk] Port ${port} cleared.`);
                    resolve(true);
                } catch (e) {
                    console.error(`[Vosk] Failed to clear port ${port}:`, e.message);
                    resolve(false);
                }
            } else {
                resolve(true);
            }
        });
    }

    /**
     * Start the Vosk server
     */
    async start() {
        try {
            if (this.isRunning) {
                console.log('Vosk server already running');
                return true;
            }

            // Ensure port is available
            await this.ensurePortAvailable(this.port);

            if (!fs.existsSync(this.modelPath)) {
                console.error('[Vosk] ERROR: Vosk model not found at:', this.modelPath);
                console.error('[Vosk] Please download a model from https://alphacephei.com/vosk/models and extract it to assets/vosk-model');
                return false;
            }

            console.log('Starting Vosk server V2...');

            // Find Python
            if (!this.pythonExePath) {
                this.pythonExePath = await this.findPythonExecutable();
            }

            // Create log files
            const logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
            const errorStream = fs.createWriteStream(this.errorFile, { flags: 'a' });

            // Spawn server process
            this.serverProcess = spawn(this.pythonExePath, [
                this.serverScriptPath,
                '--host', this.host,
                '--port', this.port.toString(),
                '--model', this.modelPath
            ], {
                detached: false,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1'
                }
            });

            // Pipe output to log files
            this.serverProcess.stdout.pipe(logStream);
            this.serverProcess.stderr.pipe(errorStream);

            // Handle process errors
            this.serverProcess.on('error', (error) => {
                console.error('Failed to start Vosk server:', error);
                this.isRunning = false;
            });

            this.serverProcess.on('exit', (code, signal) => {
                console.log(`Vosk server exited with code ${code} signal ${signal}`);
                this.isRunning = false;
                this.serverProcess = null;
            });

            // Wait for server to be ready
            console.log(`[Vosk] Waiting for server to initialize (max 15s)...`);
            const ready = await this.waitForServer();

            if (ready) {
                this.isRunning = true;
                console.log(`Vosk server started successfully at ${this.host}:${this.port}`);
                return true;
            } else {
                const logs = this.getLogs();
                if (logs.errors) {
                    console.error('[Vosk] Server startup error logs:', logs.errors.slice(-500));
                }
                this.stop();
                throw new Error('Server did not respond in time. Check Python dependencies and model path.');
            }
        } catch (error) {
            console.error('Error starting Vosk server:', error.message);
            this.isRunning = false;
            return false;
        }
    }

    /**
     * Stop the Vosk server
     */
    stop() {
        try {
            if (this.serverProcess) {
                console.log('Stopping Vosk server...');

                // Try graceful shutdown first
                if (process.platform === 'win32') {
                    // Windows
                    require('child_process').exec(`taskkill /PID ${this.serverProcess.pid} /T /F`);
                } else {
                    // Unix-like
                    this.serverProcess.kill('SIGTERM');

                    // Force kill after timeout
                    setTimeout(() => {
                        if (this.serverProcess && !this.serverProcess.killed) {
                            this.serverProcess.kill('SIGKILL');
                        }
                    }, 3000);
                }

                this.serverProcess = null;
                this.isRunning = false;
                console.log('Vosk server stopped');
            }
        } catch (error) {
            console.error('Error stopping Vosk server:', error.message);
        }
    }

    /**
     * Get Vosk client
     */
    getClient() {
        return this.client;
    }

    /**
     * Check if server is running
     */
    isServerRunning() {
        return this.isRunning;
    }

    /**
     * Get server logs
     */
    getLogs() {
        try {
            const logs = fs.readFileSync(this.logFile, 'utf-8');
            const errors = fs.readFileSync(this.errorFile, 'utf-8');
            return { logs, errors };
        } catch (error) {
            return { logs: '', errors: '' };
        }
    }
}

module.exports = VoskServerManager;
