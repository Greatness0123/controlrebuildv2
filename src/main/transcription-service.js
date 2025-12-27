const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * TranscriptionService handles audio transcription using Vosk model
 */
class TranscriptionService {
    constructor() {
        this.audioTempDir = path.join(os.tmpdir(), 'Control-audio');
        fs.ensureDirSync(this.audioTempDir);
        
        this._vosk = null;
        this._model = null;
        this._modelPath = null;
    }

    /**
     * Initialize Vosk model
     */
    async initialize() {
        if (this._model) return true;

        try {
            // Load Vosk module
            this._vosk = require('vosk');
            
            // Set model path
            this._modelPath = path.join(__dirname, '../../assets/vosk-model');
            
            if (!fs.existsSync(this._modelPath)) {
                console.error('Vosk model not found at:', this._modelPath);
                console.log('Download from: https://alphacephei.com/vosk/models');
                return false;
            }
            
            console.log('Loading Vosk model from:', this._modelPath);
            
            // CORRECT: Initialize model with path string
            this._model = new this._vosk.Model(this._modelPath);
            
            console.log('Vosk model loaded successfully');
            return true;
        } catch (err) {
            console.error('Failed to initialize Vosk:', err.message);
            return false;
        }
    }

    /**
     * Transcribe audio file
     */
    async transcribe(audioData, audioType = 'audio/webm', isFilePath = false) {
        try {
            // Ensure model is loaded
            const ready = await this.initialize();
            if (!ready) {
                return { 
                    text: '', 
                    success: false, 
                    error: 'Vosk model not available' 
                };
            }

            // Get audio file path
            let audioPath;
            if (isFilePath) {
                audioPath = audioData;
                if (!fs.existsSync(audioPath)) {
                    return { text: '', success: false, error: 'Audio file not found' };
                }
            } else {
                audioPath = await this._saveAudioFile(audioData, audioType);
            }

            // Convert to WAV format (required for Vosk)
            const wavPath = await this._convertToWav(audioPath);

            // Transcribe
            const result = await this._transcribeWithVosk(wavPath);

            // Cleanup
            this._cleanupAudioFile(audioPath);
            if (wavPath !== audioPath) {
                this._cleanupAudioFile(wavPath);
            }

            return result;
        } catch (err) {
            console.error('Transcription error:', err);
            return { text: '', success: false, error: err.message };
        }
    }

    /**
     * Save base64 audio to file
     */
    async _saveAudioFile(base64Data, audioType) {
        try {
            const ext = this._getFileExtension(audioType);
            const filename = `audio-${Date.now()}.${ext}`;
            const filepath = path.join(this.audioTempDir, filename);

            const buffer = Buffer.from(base64Data, 'base64');
            await fs.writeFile(filepath, buffer);

            return filepath;
        } catch (err) {
            throw new Error(`Failed to save audio: ${err.message}`);
        }
    }

    /**
     * Get file extension from MIME type
     */
    _getFileExtension(mimeType) {
        const mimeMap = {
            'audio/webm': 'webm',
            'audio/wav': 'wav',
            'audio/mp3': 'mp3',
            'audio/mpeg': 'mp3',
            'audio/ogg': 'ogg',
        };
        return mimeMap[mimeType] || 'webm';
    }

    /**
     * Convert audio to 16kHz mono WAV (Vosk requirement)
     */
   async _convertToWav(inputPath) {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execPromise = promisify(exec);

        if (inputPath.endsWith('.wav')) {
            return inputPath;
        }

        const wavPath = inputPath.replace(/\.[^/.]+$/, '.wav');
        
        try {
            await execPromise(
                `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -f wav "${wavPath}"`
            );
            console.log('Audio converted to WAV');
            return wavPath;
        } catch (err) {
            console.error('Conversion failed:', err.message);
            throw err;
        }
    }
    /**
     * Transcribe WAV file using Vosk
     */
    async _transcribeWithVosk(wavPath) {
        try {
            // Read WAV file
            const waveFile = require('wave-file');
            const buffer = fs.readFileSync(wavPath);
            const wav = new waveFile.WaveFile(buffer);
            
            // Get sample rate from WAV file
            const sampleRate = wav.fmt.sampleRate;
            
            // CORRECT: Create recognizer with sample rate
            const rec = new this._vosk.Recognizer({
                model: this._model,
                sampleRate: sampleRate
            });

            // Get PCM data
            const samples = wav.getSamples();
            const pcmData = new Int16Array(samples);

            // CORRECT: Feed audio data in chunks
            const chunkSize = 4000;
            let results = [];

            for (let i = 0; i < pcmData.length; i += chunkSize) {
                const chunk = pcmData.slice(i, i + chunkSize);
                const buffer = Buffer.from(chunk.buffer);
                
                // CORRECT: Use AcceptWaveform (capital A)
                if (rec.AcceptWaveform(buffer)) {
                    const result = rec.Result();
                    const parsed = JSON.parse(result);
                    if (parsed.text) {
                        results.push(parsed.text);
                    }
                }
            }

            // CORRECT: Get final result (capital F)
            const finalResult = rec.FinalResult();
            const parsed = JSON.parse(finalResult);
            if (parsed.text) {
                results.push(parsed.text);
            }

            // Free recognizer
            rec.Free();

            return {
                text: results.join(' ').trim(),
                success: true
            };
        } catch (err) {
            console.error('Vosk transcription error:', err);
            return {
                text: '',
                success: false,
                error: err.message
            };
        }
    }

    /**
     * Cleanup audio file
     */
    _cleanupAudioFile(filepath) {
        try {
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                console.log(`Cleaned up audio file: ${filepath}`);
            }
        } catch (err) {
            console.warn(`Failed to cleanup: ${err.message}`);
        }
    }

    /**
     * Check if ready
     */
    async isReady() {
        return await this.initialize();
    }
}

module.exports = TranscriptionService;