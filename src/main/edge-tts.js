const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const say = require('say');
const { EventEmitter } = require('events');

class EdgeTTSManager extends EventEmitter {
    constructor() {
        super();
        this.enabled = false;
        this.isSpeaking = false;
        this.queue = [];
        this.useOfflineFallback = true;
        this.checkingAvailability = true;
        this.voice = 'en-US-AriaNeural'; // More natural, expressive voice
        this.offlineVoice = null;
        this.rate = 1.1; // Slightly faster for more responsive feel
        this.volume = 1.0;
        this.useStreaming = true; // Enable streaming for real-time playback
        this.currentProcess = null;
        this.pythonCommand = null; // Store which python command works

        console.log('[EdgeTTS] Starting availability check...');
        this.checkEdgeTTSAvailability();
    }

    async checkEdgeTTSAvailability() {
        return new Promise((resolve) => {
            this.tryPythonCheck('python', resolve);
        });
    }

    tryPythonCheck(pythonCmd, resolve) {
        try {
            console.log(`[EdgeTTS] Attempting check with command: "${pythonCmd}"`);
            const child = spawn(pythonCmd, ['-c', 'import edge_tts; print("edge_tts_available")'], {
                windowsHide: true,
                timeout: 5000
            });

            let output = '';
            let hasError = false;
            let resolved = false;

            child.stdout.on('data', (data) => {
                output += data.toString();
            });

            child.stderr.on('data', (data) => {
                console.log(`[EdgeTTS] ${pythonCmd} stderr:`, data.toString());
                hasError = true;
            });

            child.on('error', (error) => {
                if (resolved) return;
                resolved = true;
                console.log(`[EdgeTTS] ${pythonCmd} failed:`, error.message);
                if (pythonCmd === 'python') {
                    console.log('[EdgeTTS] Trying python3...');
                    this.tryPythonCheck('python3', resolve);
                } else {
                    console.log('[EdgeTTS] Both python and python3 failed, using offline fallback');
                    this.useOfflineFallback = true;
                    this.checkingAvailability = false;
                    resolve();
                }
            });

            child.on('exit', (code) => {
                if (resolved) return;
                resolved = true;
                if (code === 0 && output.includes('edge_tts_available') && !hasError) {
                    console.log(`[EdgeTTS] ✅ Edge TTS available via "${pythonCmd}"!`);
                    this.pythonCommand = pythonCmd; // ✅ Store working command
                    this.useOfflineFallback = false;
                    this.checkingAvailability = false;
                    resolve();
                } else {
                    console.log(`[EdgeTTS] ${pythonCmd} check failed (code: ${code}, hasError: ${hasError}, output: ${output})`);
                    if (pythonCmd === 'python') {
                        console.log('[EdgeTTS] Trying python3...');
                        this.tryPythonCheck('python3', resolve);
                    } else {
                        console.log('[EdgeTTS] Using offline fallback');
                        this.useOfflineFallback = true;
                        this.checkingAvailability = false;
                        resolve();
                    }
                }
            });

            setTimeout(() => {
                if (!resolved && child && !child.killed) {
                    resolved = true;
                    child.kill();
                    console.log(`[EdgeTTS] ${pythonCmd} check timed out`);
                    if (pythonCmd === 'python') {
                        this.tryPythonCheck('python3', resolve);
                    } else {
                        this.useOfflineFallback = true;
                        this.checkingAvailability = false;
                        resolve();
                    }
                }
            }, 5000);

        } catch (error) {
            console.log(`[EdgeTTS] ${pythonCmd} spawn error:`, error.message);
            if (pythonCmd === 'python') {
                this.tryPythonCheck('python3', resolve);
            } else {
                this.useOfflineFallback = true;
                resolve();
            }
        }
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
        console.log('[EdgeTTS] Checking availability:', this.checkingAvailability);
        console.log('[EdgeTTS] Using offline fallback:', this.useOfflineFallback);

        const cleanedText = this.cleanTextForSpeech(text);

        if (!cleanedText) {
            console.log('[EdgeTTS] Cleaned text is empty, skipping');
            return;
        }

        this.queue.push(cleanedText);
        console.log('[EdgeTTS] Added to queue, queue length:', this.queue.length);

        if (!this.isSpeaking) {
            if (this.checkingAvailability) {
                console.log('[EdgeTTS] Availability check in progress, waiting 500ms...');
                setTimeout(() => this.processQueue(), 500);
            } else {
                this.processQueue();
            }
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
        console.log('[EdgeTTS] Processing queue, using:', this.useOfflineFallback ? 'offline' : 'online');

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

    /**
     * ✅ IMPROVED: Better error handling and diagnostics
     */
    async speakOnline(text) {
        // Use streaming for faster, real-time playback (for shorter texts)
        // Streaming reduces latency by starting playback as audio chunks are generated
        if (this.useStreaming && text.length < 800) {
            console.log('[EdgeTTS] Using optimized streaming mode for faster response');
            return this.speakOnlineStreaming(text);
        }

        // File-based for longer texts (more reliable, but slightly slower)
        console.log('[EdgeTTS] Using file-based mode for longer text');
        return this.speakOnlineFileBased(text);
    }

    async speakOnlineStreaming(text) {
        return new Promise((resolve, reject) => {
            console.log('[EdgeTTS] Using streaming mode for real-time playback');

            // Escape text properly for Python
            const escapedText = text
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');

            const pythonScript = `
import asyncio
import edge_tts
import sys
import subprocess
import platform

async def main():
    try:
        tts = edge_tts.Communicate(
            text="""${escapedText}""",
            voice="${this.voice}",
            rate="${this.rateToString()}",
            volume="${this.volumeToString()}"
        )
        
        # Optimized streaming: Save chunks as they arrive for faster playback
        # This allows playback to start before all audio is generated
        import tempfile
        import os
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3').name
        
        # Stream and save chunks immediately
        chunk_count = 0
        with open(temp_file, 'wb') as f:
            async for chunk in tts.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                    f.flush()  # Flush immediately for faster file availability
                    chunk_count += 1
                    # Start playing after first few chunks (reduces latency)
                    if chunk_count == 3:
                        print(f"TTS_START_PLAY:{temp_file}")
        
        print(f"TTS_FILE:{temp_file}")
    except Exception as e:
        print(f"TTS_ERROR: {e}", file=sys.stderr)
        sys.exit(1)

asyncio.run(main())
`;

            const tempDir = path.join(os.tmpdir(), 'control-tts');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const scriptFile = path.join(tempDir, `stream-${Date.now()}.py`);
            fs.writeFileSync(scriptFile, pythonScript, 'utf8');

            const pythonCmd = this.pythonCommand || 'python';
            let child = spawn(pythonCmd, [scriptFile], {
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.currentProcess = child;
            this.emit('speaking', text);

            let stdout = '';
            let stderr = '';
            let errorHandled = false;

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('error', (error) => {
                if (errorHandled) return;
                errorHandled = true;
                console.error('[EdgeTTS] Streaming error:', error.message);
                this.cleanup(scriptFile, null);
                // Fallback to file-based
                this.speakOnlineFileBased(text).then(resolve).catch(reject);
            });

            child.on('exit', (code) => {
                if (errorHandled) return;
                errorHandled = true;

                if (code === 0) {
                    // Check for early playback start signal (for faster response)
                    if (stdout.includes('TTS_START_PLAY:')) {
                        const fileMatch = stdout.match(/TTS_START_PLAY:(.+)/);
                        if (fileMatch) {
                            const audioFile = fileMatch[1].trim();
                            console.log('[EdgeTTS] Starting early playback for faster response');
                            // Start playing while generation may still be continuing
                            this.playAudioFile(audioFile)
                                .then(() => {
                                    this.cleanup(scriptFile, audioFile);
                                    resolve();
                                })
                                .catch((error) => {
                                    this.cleanup(scriptFile, audioFile);
                                    reject(error);
                                });
                            return; // Don't wait for TTS_FILE message
                        }
                    }

                    // Standard file-based playback
                    if (stdout.includes('TTS_FILE:')) {
                        const fileMatch = stdout.match(/TTS_FILE:(.+)/);
                        if (fileMatch) {
                            const audioFile = fileMatch[1].trim();
                            console.log('[EdgeTTS] Playing generated audio file');
                            this.playAudioFile(audioFile)
                                .then(() => {
                                    this.cleanup(scriptFile, audioFile);
                                    resolve();
                                })
                                .catch((error) => {
                                    this.cleanup(scriptFile, audioFile);
                                    reject(error);
                                });
                        } else {
                            this.cleanup(scriptFile, null);
                            resolve();
                        }
                    } else {
                        this.cleanup(scriptFile, null);
                        resolve();
                    }
                } else {
                    console.error('[EdgeTTS] Streaming failed, falling back to file-based');
                    this.cleanup(scriptFile, null);
                    this.speakOnlineFileBased(text).then(resolve).catch(reject);
                }
            });
        });
    }

    async speakOnlineFileBased(text) {
        return new Promise((resolve, reject) => {
            const tempDir = path.join(os.tmpdir(), 'control-tts');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const audioFile = path.join(tempDir, `tts-${Date.now()}.mp3`);

            // ✅ Escape text properly for Python
            const escapedText = text
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');

            const pythonScript = `
import asyncio
import edge_tts
import sys

async def main():
    try:
        tts = edge_tts.Communicate(
            text="""${escapedText}""",
            voice="${this.voice}",
            rate="${this.rateToString()}",
            volume="${this.volumeToString()}"
        )
        await tts.save("${audioFile.replace(/\\/g, '\\\\')}")
        print("TTS_SUCCESS")
    except Exception as e:
        print(f"TTS_ERROR: {e}", file=sys.stderr)
        sys.exit(1)

asyncio.run(main())
`;

            const scriptFile = path.join(tempDir, `script-${Date.now()}.py`);
            fs.writeFileSync(scriptFile, pythonScript, 'utf8');

            console.log('[EdgeTTS] Executing online TTS with voice:', this.voice);
            console.log('[EdgeTTS] Using python command:', this.pythonCommand || 'python');

            // ✅ Use the python command that worked during availability check
            const pythonCmd = this.pythonCommand || 'python';
            let child = spawn(pythonCmd, [scriptFile], {
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.currentProcess = child;

            let stdout = '';
            let stderr = '';
            let errorHandled = false;

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('error', (error) => {
                if (errorHandled) return;
                errorHandled = true;

                console.error('[EdgeTTS] Python execution error:', error.message);
                console.error('[EdgeTTS] Stdout:', stdout);
                console.error('[EdgeTTS] Stderr:', stderr);
                this.cleanup(scriptFile, audioFile);
                reject(error);
            });

            child.on('exit', (code) => {
                if (errorHandled) return;
                errorHandled = true;

                console.log('[EdgeTTS] Python exited with code:', code);

                if (stdout) console.log('[EdgeTTS] Python stdout:', stdout.trim());
                if (stderr) console.error('[EdgeTTS] Python stderr:', stderr.trim());

                if (code === 0 && fs.existsSync(audioFile) && stdout.includes('TTS_SUCCESS')) {
                    console.log('[EdgeTTS] Audio file generated successfully');

                    // ✅ Verify file has content
                    const stats = fs.statSync(audioFile);
                    if (stats.size === 0) {
                        console.error('[EdgeTTS] Generated audio file is empty');
                        this.cleanup(scriptFile, audioFile);
                        reject(new Error('Generated audio file is empty'));
                        return;
                    }

                    console.log('[EdgeTTS] Audio file size:', stats.size, 'bytes');

                    this.playAudioFile(audioFile)
                        .then(() => {
                            this.cleanup(scriptFile, audioFile);
                            resolve();
                        })
                        .catch((error) => {
                            console.error('[EdgeTTS] Playback error:', error);
                            this.cleanup(scriptFile, audioFile);
                            reject(error);
                        });
                } else {
                    console.error('[EdgeTTS] Generation failed');
                    console.error('[EdgeTTS] - Exit code:', code);
                    console.error('[EdgeTTS] - File exists:', fs.existsSync(audioFile));
                    console.error('[EdgeTTS] - Success marker:', stdout.includes('TTS_SUCCESS'));

                    if (stderr.includes('TTS_ERROR:')) {
                        const errorMatch = stderr.match(/TTS_ERROR: (.+)/);
                        if (errorMatch) {
                            console.error('[EdgeTTS] Python error:', errorMatch[1]);
                        }
                    }

                    this.cleanup(scriptFile, audioFile);
                    reject(new Error(`Edge TTS generation failed: ${stderr || 'Unknown error'}`));
                }
            });
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
                    console.log('[EdgeTTS] Playing MP3 on Windows via Windows Media Player');

                    const powerShellCmd = `
Add-Type -AssemblyName presentationCore
$mediaPlayer = New-Object System.Windows.Media.MediaPlayer
$mediaPlayer.Open([Uri]::new('${audioFile.replace(/\\/g, '\\\\').replace(/'/g, "''")}'))
$mediaPlayer.Play()

# Wait for media to load
Start-Sleep -Milliseconds 500

# Wait for playback to complete
while ($mediaPlayer.NaturalDuration.HasTimeSpan -eq $false) {
    Start-Sleep -Milliseconds 100
}

$duration = $mediaPlayer.NaturalDuration.TimeSpan.TotalSeconds
Write-Host "Duration: $duration seconds"

# Wait for playback
Start-Sleep -Seconds ([Math]::Ceiling($duration))
$mediaPlayer.Close()
Write-Host "Playback complete"
`;

                    player = spawn('powershell.exe', [
                        '-NoProfile',
                        '-NonInteractive',
                        '-Command',
                        powerShellCmd
                    ], {
                        windowsHide: true,
                        stdio: ['pipe', 'pipe', 'pipe']
                    });

                    this.currentProcess = player;
                    this.emit('speaking', audioFile);

                    console.log('[EdgeTTS] Windows Media Player spawned');

                    player.stdout.on('data', (data) => {
                        console.log('[EdgeTTS] PowerShell:', data.toString().trim());
                    });

                    player.stderr.on('data', (data) => {
                        const msg = data.toString().trim();
                        if (msg) console.log('[EdgeTTS] PowerShell stderr:', msg);
                    });

                    const timeoutHandle = setTimeout(() => {
                        if (!completed) {
                            console.log('[EdgeTTS] Playback timeout, killing player');
                            player.kill();
                            cleanup();
                            resolve();
                        }
                    }, 60000);

                    player.on('error', (error) => {
                        if (!completed) {
                            clearTimeout(timeoutHandle);
                            console.error('[EdgeTTS] PowerShell error:', error.message);
                            cleanup();
                            reject(error);
                        }
                    });

                    player.on('exit', (code) => {
                        if (!completed) {
                            clearTimeout(timeoutHandle);
                            console.log('[EdgeTTS] PowerShell exited with code:', code);
                            cleanup();
                            resolve();
                        }
                    });

                } else if (process.platform === 'darwin') {
                    console.log('[EdgeTTS] Playing audio on macOS via afplay');

                    player = spawn('afplay', [audioFile], { stdio: 'pipe' });

                    this.currentProcess = player;
                    this.emit('speaking-start', audioFile);

                    player.on('error', (error) => {
                        if (!completed) {
                            completed = true;
                            console.error('[EdgeTTS] Player error:', error.message);
                            reject(error);
                        }
                    });

                    player.on('exit', (code) => {
                        if (!completed) {
                            completed = true;
                            if (code === 0) {
                                console.log('[EdgeTTS] macOS playback complete');
                                cleanup();
                                resolve();
                            } else {
                                console.error('[EdgeTTS] macOS playback failed with code:', code);
                                reject(new Error(`Playback failed with code ${code}`));
                            }
                        }
                    });

                } else {
                    console.log('[EdgeTTS] Playing audio on Linux');

                    const players = ['paplay', 'aplay', 'ffplay'];

                    const tryPlayer = (index) => {
                        if (index >= players.length) {
                            if (!completed) {
                                completed = true;
                                console.error('[EdgeTTS] No audio player found on Linux');
                                reject(new Error('No audio player found (install: paplay, aplay, or ffplay)'));
                            }
                            return;
                        }

                        const playerCmd = players[index];
                        console.log(`[EdgeTTS] Trying Linux player: ${playerCmd}`);

                        let args = [];
                        if (playerCmd === 'ffplay') {
                            args = ['-nodisp', '-autoexit', '-loglevel', 'quiet', audioFile];
                        } else {
                            args = [audioFile];
                        }

                        player = spawn(playerCmd, args);
                        this.currentProcess = player;
                        this.emit('speaking-start', audioFile);

                        player.on('error', (error) => {
                            if (!completed) {
                                console.log(`[EdgeTTS] ${playerCmd} not found, trying next...`);
                                tryPlayer(index + 1);
                            }
                        });

                        player.on('exit', (code) => {
                            if (!completed) {
                                completed = true;
                                if (code === 0 || code === null) {
                                    console.log(`[EdgeTTS] Linux playback complete via ${playerCmd}`);
                                    cleanup();
                                    resolve();
                                } else {
                                    console.error('[EdgeTTS] Linux playback failed with code:', code);
                                    reject(new Error(`Playback failed with code ${code}`));
                                }
                            }
                        });
                    };

                    tryPlayer(0);
                }

            } catch (error) {
                if (!completed) {
                    completed = true;
                    console.error('[EdgeTTS] Failed to play audio:', error.message);
                    reject(error);
                }
            }
        });
    }

    rateToString() {
        const percentage = Math.round((this.rate - 1.0) * 100);
        return percentage >= 0 ? `+${percentage}%` : `${percentage}%`;
    }

    volumeToString() {
        const percentage = Math.round((this.volume - 1.0) * 100);
        return percentage >= 0 ? `+${percentage}%` : `${percentage}%`;
    }

    stop() {
        this.queue = [];

        if (this.currentProcess) {
            try {
                this.currentProcess.kill();
                this.currentProcess = null;
            } catch (error) {
                console.error('[EdgeTTS] Failed to kill TTS process:', error);
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

    pause() {
        console.log('[EdgeTTS] Pause not fully implemented');
    }

    resume() {
        console.log('[EdgeTTS] Resume not fully implemented');
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
        if (this.useOfflineFallback) {
            return new Promise((resolve) => {
                say.getInstalledVoices((error, voices) => {
                    if (error) {
                        resolve([]);
                    } else {
                        resolve(voices || []);
                    }
                });
            });
        } else {
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
}

module.exports = EdgeTTSManager;