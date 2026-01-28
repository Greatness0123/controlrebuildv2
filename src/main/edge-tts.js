const path = require('path');
const fs = require('fs');
const os = require('os');
const say = require('say');
const { EventEmitter } = require('events');
const { spawn, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class EdgeTTSManager extends EventEmitter {
    constructor() {
        super();
        this.enabled = false;
        this.isSpeaking = false;
        this.queue = [];
        this.useOfflineFallback = false;
        this.voice = 'en-US-AriaNeural';
        this.offlineVoice = null;
        this.rate = 1.0;
        this.volume = 1.0;
        this.currentProcess = null;
        this.pythonExe = null;

        console.log('[EdgeTTS] Initialized with robust Python-bridge implementation');
    }

    enable(enabled) {
        this.enabled = !!enabled;
        console.log('[EdgeTTS] enabled:', this.enabled);

        if (!enabled && this.isSpeaking) {
            this.stop();
        }
    }

    isEnabled() {
        return this.enabled;
    }

    setVoice(voice) {
        this.voice = voice;
        console.log('[EdgeTTS] Voice set to:', voice);
    }

    setRate(rate) {
        this.rate = Math.max(0.5, Math.min(2.0, rate));
        console.log('[EdgeTTS] Rate set to:', this.rate);
    }

    setVolume(volume) {
        this.volume = Math.max(0.0, Math.min(1.0, volume));
        console.log('[EdgeTTS] Volume set to:', this.volume);
    }

    speak(text) {
        if (!this.enabled || !text || !text.trim()) {
            console.log('[EdgeTTS] speak() - enabled:', this.enabled, 'text length:', text?.length || 0);
            return;
        }

        console.log('[EdgeTTS] Speaking:', text.substring(0, 50) + '...');

        const cleanedText = this.cleanTextForSpeech(text);

        if (!cleanedText) {
            console.log('[EdgeTTS] Cleaned text is empty, skipping');
            return;
        }

        this.queue.push(cleanedText);
        console.log('[EdgeTTS] Added to queue, queue length:', this.queue.length);

        if (!this.isSpeaking) {
            this.processQueue();
        }
    }

    cleanTextForSpeech(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/`(.*?)`/g, '$1')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
            .replace(/[_~]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async processQueue() {
        if (this.queue.length === 0) {
            this.isSpeaking = false;
            console.log('[EdgeTTS] Queue empty');
            this.emit('queue-empty');
            return;
        }

        this.isSpeaking = true;
        const text = this.queue.shift();

        try {
            if (this.useOfflineFallback) {
                await this.speakOffline(text);
            } else {
                await this.speakOnline(text);
            }
        } catch (error) {
            console.error('[EdgeTTS] TTS error:', error);
            if (!this.useOfflineFallback) {
                try {
                    console.log('[EdgeTTS] Online failed, trying offline fallback');
                    await this.speakOffline(text);
                } catch (fallbackError) {
                    console.error('[EdgeTTS] Offline TTS also failed:', fallbackError);
                }
            }
        }

        this.processQueue();
    }

    async findPython() {
        if (this.pythonExe) return this.pythonExe;
        const cmds = ['python', 'python3', 'py'];
        for (const cmd of cmds) {
            try {
                await execAsync(`${cmd} -c "import edge_tts"`);
                this.pythonExe = cmd;
                console.log('[EdgeTTS] Using python:', cmd);
                return cmd;
            } catch (e) {}
        }
        return null;
    }

    async speakOnline(text) {
        return new Promise(async (resolve, reject) => {
            try {
                const python = await this.findPython();
                if (!python) {
                    return reject(new Error('Python with edge-tts not found'));
                }

                const tempDir = path.join(os.tmpdir(), 'control-tts');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }

                const audioFile = path.join(tempDir, `tts-${Date.now()}.mp3`);
                console.log('[EdgeTTS] Generating audio via edge-tts (python) for voice:', this.voice);

                // Build rate string (+0%, -10%, etc.)
                const ratePercentage = Math.round((this.rate - 1.0) * 100);
                const rateStr = (ratePercentage >= 0 ? '+' : '') + ratePercentage + '%';

                // We use the edge-tts CLI directly if available
                const args = [
                    '-m', 'edge_tts',
                    '--voice', this.voice,
                    '--rate', rateStr,
                    '--text', text,
                    '--write-media', audioFile
                ];

                const ttsProcess = spawn(python, args);

                ttsProcess.on('close', async (code) => {
                    if (code === 0) {
                        console.log('[EdgeTTS] Audio generated successfully, playing...');
                        this.emit('speaking', text);
                        try {
                            await this.playAudioFile(audioFile);
                            this.cleanup(audioFile);
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    } else {
                        reject(new Error(`edge-tts process exited with code ${code}`));
                    }
                });

                ttsProcess.on('error', (err) => {
                    reject(err);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async speakOffline(text) {
        return new Promise((resolve, reject) => {
            const options = {
                voice: this.offlineVoice,
                speed: this.rate
            };

            console.log('[EdgeTTS] Using offline TTS');
            this.emit('speaking', text);

            say.speak(text, options.voice, options.speed, (error) => {
                if (error) {
                    console.error('[EdgeTTS] Offline TTS error:', error);
                    reject(error);
                } else {
                    console.log('[EdgeTTS] Offline TTS completed');
                    this.emit('stopped');
                    resolve();
                }
            });
        });
    }

    playAudioFile(audioFile) {
        return new Promise((resolve, reject) => {
            let player;
            let completed = false;

            const cleanup = () => {
                if (completed) return;
                completed = true;
                this.emit('stopped');
            };

            try {
                if (process.platform === 'win32') {
                    console.log('[EdgeTTS] Playing MP3 on Windows via PowerShell');

                    const powerShellCmd = `
Add-Type -AssemblyName presentationCore
$mediaPlayer = New-Object System.Windows.Media.MediaPlayer
$mediaPlayer.Open([Uri]::new('${audioFile.replace(/\\/g, '\\\\').replace(/'/g, "''")}'))
$mediaPlayer.Play()
while ($mediaPlayer.NaturalDuration.HasTimeSpan -eq $false) { Start-Sleep -Milliseconds 100 }
$duration = $mediaPlayer.NaturalDuration.TimeSpan.TotalSeconds
Start-Sleep -Seconds ([Math]::Ceiling($duration))
$mediaPlayer.Close()
`;

                    player = spawn('powershell.exe', [
                        '-NoProfile',
                        '-NonInteractive',
                        '-Command',
                        powerShellCmd
                    ], {
                        windowsHide: true,
                        stdio: 'ignore'
                    });

                } else if (process.platform === 'darwin') {
                    player = spawn('afplay', [audioFile]);
                } else {
                    const players = ['paplay', 'aplay', 'ffplay'];
                    const tryPlayer = (index) => {
                        if (index >= players.length) {
                            completed = true;
                            reject(new Error('No audio player found on Linux'));
                            return;
                        }
                        const playerCmd = players[index];
                        let args = [audioFile];
                        if (playerCmd === 'ffplay') args = ['-nodisp', '-autoexit', '-loglevel', 'quiet', audioFile];

                        player = spawn(playerCmd, args);
                        player.on('error', () => tryPlayer(index + 1));
                        player.on('exit', (code) => {
                            if (!completed) {
                                completed = true;
                                cleanup();
                                resolve();
                            }
                        });
                    };
                    tryPlayer(0);
                    return;
                }

                this.currentProcess = player;

                player.on('error', (error) => {
                    if (!completed) {
                        completed = true;
                        cleanup();
                        reject(error);
                    }
                });

                player.on('exit', (code) => {
                    if (!completed) {
                        completed = true;
                        cleanup();
                        resolve();
                    }
                });

            } catch (error) {
                if (!completed) {
                    completed = true;
                    reject(error);
                }
            }
        });
    }

    stop() {
        this.queue = [];

        if (this.currentProcess) {
            try {
                this.currentProcess.kill();
                this.currentProcess = null;
            } catch (error) {
                console.error('[EdgeTTS] Failed to kill playback process:', error);
            }
        }

        try {
            say.stop();
        } catch (error) {
            console.error('[EdgeTTS] Failed to stop offline TTS:', error);
        }

        this.isSpeaking = false;
        this.emit('stopped');
    }

    cleanup(...files) {
        files.forEach(file => {
            try {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            } catch (error) {
                console.error('[EdgeTTS] Cleanup error:', error);
            }
        });
    }

    async getAvailableVoices() {
        // Return standard Edge TTS voices
        return [
            'en-US-JennyNeural',
            'en-US-GuyNeural',
            'en-US-AriaNeural',
            'en-US-DavisNeural',
            'en-GB-SoniaNeural',
            'en-GB-RyanNeural',
            'en-AU-NatashaNeural',
            'en-AU-WilliamNeural'
        ];
    }
}

module.exports = EdgeTTSManager;
