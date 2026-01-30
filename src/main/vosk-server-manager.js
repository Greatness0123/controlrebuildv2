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
     * Check if server is ready
     */
    async waitForServer(maxAttempts = 30, delayMs = 1000) {
        // Simple socket check or wait for log output
        // For v2, we can just wait a bit as it starts fast
        return new Promise(resolve => setTimeout(() => resolve(true), 2000));
    }

    /**
     * Check if port is in use (simple check)
     */
    async isPortInUse(port) {
        return new Promise((resolve) => {
            const net = require('net');
            const server = net.createServer();
            server.once('error', (err) => {
                if (err.code === 'EADDRINUSE') resolve(true);
                else resolve(false);
            });
            server.once('listening', () => {
                server.close();
                resolve(false);
            });
            server.listen(port, '127.0.0.1');
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

            // Check if port 2700 is already in use
            if (await this.isPortInUse(this.port)) {
                console.log(`[Vosk] Port ${this.port} is already in use, assuming server is already running externally or lingering.`);
                this.isRunning = true;
                return true;
            }

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
            const ready = await this.waitForServer();

            if (ready) {
                this.isRunning = true;
                console.log(`Vosk server started successfully at ${this.host}:${this.port}`);
                return true;
            } else {
                this.stop();
                throw new Error('Server did not respond in time');
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
