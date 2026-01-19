class ChatWindow {
    constructor() {
        this.messagesContainer = document.getElementById('messagesContainer');
        this.chatInput = document.getElementById('chatInput');
        this.sendButton = document.getElementById('sendButton');
        this.voiceButton = document.getElementById('voiceButton');
        this.attachButton = document.getElementById('attachButton');
        this.attachmentsContainer = document.getElementById('attachmentsContainer');
        this.settingsButton = document.getElementById('settingsButton');
        this.newChatButton = document.getElementById('newChatButton');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.voiceIndicator = document.getElementById('voiceIndicator');
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.welcomeGreeting = document.getElementById('welcomeGreeting');

        // Mode toggle elements
        this.modeAct = document.getElementById('modeAct');
        this.modeAsk = document.getElementById('modeAsk');

        this.isTyping = false;
        this.isRecording = false;
        this.currentTask = null;
        this.currentTask = null;
        this.currentMode = 'act'; // Default, will override from settings
        this.actionStatuses = new Map();
        this.attachments = [];

        // Vosk V2 Streaming
        this.mediaRecorder = null;
        this.audioContext = null;
        this.ws = null;
        this.processor = null;
        this.stream = null;
        this.voiceRecordingIntervals = [];

        this.chunks = [];
        this.messageGroups = new Map();
        this.collapsedGroups = new Set();
        this.isAudioPlaying = false;

        // Session management
        this.currentSessionId = null;
        this.sessions = [];
        this.sessionsStorageKey = 'controlSessions';

        // Speech recognition for auto-send feature
        this.speechTimeout = null;
        this.autoSendEnabled = false;
        this.speechTimeout = null;
        this.autoSendEnabled = false;
        this.lastSpeechTime = null;
        this.baseText = ''; // Track committed text for partial updates
        this.userName = null; // Track user name for personalization

        this.greetings = [
            "Welcome back", "Hello", "Good to see you", "Ready to work?",
            "What's on the agenda?", "How can I help?", "System online", "Control active",
            "Awaiting instructions", "Let's get started", "Designated for assistance",
            "How's your day going?", "Standing by", "Task mode engaged",
            "At your service", "What's the plan?", "Efficiency maximized",
            "Progress awaits", "Let's make things happen", "Your move"
        ];

        this.isOnline = navigator.onLine;
        this.offlineChecked = false;
        this.settings = {};

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupIPCListeners();
        this.setupInputHandlers();
        this.setupKeyboardShortcuts();
        this.initializeLucideIcons();
        this.updateSendButton();
        await this.loadSettings();

        // Restore last mode from settings
        if (this.settings && this.settings.lastMode) {
            this.setMode(this.settings.lastMode);
        }

        this.loadSessions();
        this.checkOfflineStatus();
        this.setupOnlineOfflineListeners();
        // Don't auto-start new conversation here to avoid resetting UI state if restoring
        if (!this.currentSessionId) {
            this.startNewConversation(false);
        }
    }



    setupOnlineOfflineListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.showToast('Internet connection restored', 'success');
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.checkOfflineStatus();
        });
    }

    async checkOfflineStatus() {
        if (this.offlineChecked) return;
        this.offlineChecked = true;

        const isOnline = await this.checkInternetConnection();
        this.isOnline = isOnline;

        if (!isOnline) {
            let message = 'You are offline.';
            if (this.settings.voiceResponse) {
                message += ' Offline text-to-speech will be used.';
            }
            this.showToast(message, 'warning');
        }
    }

    async checkInternetConnection() {
        if (!navigator.onLine) {
            this.showToast('No internet connection detected', 'error');
            return false;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);

            const response = await fetch('https://www.google.com/favicon.ico', {
                method: 'GET',
                mode: 'cors',
                signal: controller.signal,
                cache: 'no-store'
            });

            clearTimeout(timeoutId);
            if (response.ok) {
                return true;
            }
            return false;
        } catch (error) {
            if (error.name === 'AbortError' || error.name === 'TypeError') {
                this.showToast('No internet connection', 'error');
                return false;
            }
            this.showToast('Could not verify internet connection', 'error');
            return false;
        }
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer') || document.body;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setupEventListeners() {
        // Send button
        this.sendButton.addEventListener('click', () => {
            if (this.isAudioPlaying) {
                this.stopAudio();
            } else {
                this.sendMessage();
            }
        });

        // Mode Toggle
        if (this.modeAct && this.modeAsk) {
            this.modeAct.addEventListener('click', () => this.setMode('act'));
            this.modeAsk.addEventListener('click', () => this.setMode('ask'));
        }

        // Voice button
        if (this.voiceButton) {
            this.voiceButton.addEventListener('click', () => {
                this.toggleVoiceRecording();
            });
        }

        // Attach button
        this.attachButton.addEventListener('click', () => {
            this.handleFileAttachment();
        });

        // Settings button
        this.settingsButton.addEventListener('click', () => {
            this.openSettings();
        });

        // New chat button
        if (this.newChatButton) {
            this.newChatButton.addEventListener('click', () => {
                this.saveCurrentSession();
                // When starting new chat, KEEP CURRENT MODE (do not reset to default)
                this.startNewConversation(true);
            });
        }

        // History button
        const historyButton = document.getElementById('historyButton');
        if (historyButton) {
            historyButton.addEventListener('click', () => {
                this.showSessionsModal();
            });
        }

        // Input key handlers
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.chatInput.addEventListener('input', () => {
            this.autoResizeTextarea();
            this.updateSendButton();
            // REMOVED: Hide welcome screen when user starts typing (User preference)
            // if (this.chatInput.value.trim().length > 0) {
            //     this.hideWelcomeScreen();
            // }
        });

        // Escape key now clears input instead of closing window
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.chatInput.value = '';
                this.chatInput.blur();
            }
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Alt+Z to stop 
            if (e.altKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (window.chatAPI) {
                    window.chatAPI.stopAction();
                }
            }
        });
    }

    setupIPCListeners() {
        if (window.chatAPI) {
            // App initialization complete - play greeting after full initialization
            if (window.chatAPI.onAppInitialized) {
                window.chatAPI.onAppInitialized(() => {
                    console.log('[ChatWindow] App initialized - showing welcome screen and greeting');
                    setTimeout(() => {
                        this.showWelcomeScreen();
                    }, 300);
                });
            }

            // Settings updates
            if (window.chatAPI.onSettingsUpdated) {
                window.chatAPI.onSettingsUpdated((event, settings) => {
                    console.log('[ChatWindow] Settings updated:', settings);
                    this.settings = settings;
                    this.autoSendEnabled = settings.autoSendAfterWakeWord || false;

                    if (settings.userDetails && settings.userDetails.name) {
                        this.userName = settings.userDetails.name;
                    }

                    // Update UI components that rely on settings
                    this.updateSendButton();
                    this.updateRateLimitDisplay();

                    // Note: window visibility and wake word settings are handled by main process, 
                    // but visual feedback logic in chat window should be aware of current state.
                });
            }

            // User Data updates
            if (window.chatAPI.onUserDataUpdated) {
                window.chatAPI.onUserDataUpdated((event, userData) => {
                    console.log('[ChatWindow] User data updated:', userData);
                    if (this.settings) {
                        this.settings.userDetails = userData;
                    }
                    this.updateRateLimitDisplay();
                });
            }

            // User Changed (login/logout)
            if (window.chatAPI.onUserChanged) {
                window.chatAPI.onUserChanged((event, userData) => {
                    console.log('[ChatWindow] User changed:', userData);
                    if (this.settings) {
                        this.settings.userDetails = userData;
                    }
                    if (userData && userData.name) {
                        this.userName = userData.name;
                    }
                    this.updateRateLimitDisplay();
                });
            }

            // AI responses
            window.chatAPI.onAIResponse((event, data) => {
                // Force-clear ALL thinking indicators
                this.forceStopThinking();

                if (data.type === 'rejection' || data.type === 'error') {
                    this.addMessage(data.message, 'ai', false);
                } else {
                    this.addMessage(data.text || data.message, 'ai', data.is_action);
                }
            });

            // Transcription results (Legacy or backend initiated)
            window.chatAPI.onTranscriptionResult((event, data) => {
                if (data && data.text) {
                    this.chatInput.value = data.text;
                    this.autoResizeTextarea();
                    this.updateSendButton();
                    if (this.autoSendEnabled && this.isRecording) {
                        this.resetSpeechTimeout();
                    }
                }
            });

            // Action updates
            window.chatAPI.onActionStart((event, data) => {
                console.log('[ChatWindow] Action start:', data);
                // Only add if not already showing a task (to avoid duplicates)
                if (!this.currentTask) {
                    this.addActionMessage(data.description || 'Executing action...', 'running');
                }
                // Don't hide chat - user can manually close if desired
            });

            window.chatAPI.onActionStep((event, data) => {
                console.log('[ChatWindow] Action step:', data);
                const stepMessage = `Step ${data.step}/${data.total_steps}: ${data.description}`;
                // Optional: Show step in chat? Or update the action log details?
                // For now, let's just add a small log or update details
                // Better: Update the details of the CURRENT action entry
                this.updateActionStatus(null, null, stepMessage + "\n");
            });

            window.chatAPI.onActionComplete((event, data) => {
                console.log('[ChatWindow] Action complete:', data);
                // Ensure spinner is removed and replaced with success/error icon
                this.updateActionStatus((data && data.description), (data && data.success), (data && data.details));
                // Chat window will be shown automatically by backend manager on task complete
            });

            // Task updates
            window.chatAPI.onTaskStart((event, data) => {
                this.currentTask = data.task;
                // Only add action message if we don't already have one from action-start
                if (!this.lastActionId || !this.actionStatuses.has(this.lastActionId)) {
                    this.addActionMessage(data.task || 'Starting task...', 'running');
                }
                this.updateStatus('Working on task...', 'working');
                this.updateSendButton();
                // Chat window will be hidden automatically by backend manager
            });

            window.chatAPI.onTaskComplete((event, data) => {
                this.currentTask = null;
                this.updateStatus('Ready', 'ready');
                // Fallback: Clear any lingering spinners
                this.updateActionStatus(null, true);
                this.updateSendButton();
                // Chat window will be shown automatically by backend manager
            });

            window.chatAPI.onTaskStopped((event, data) => {
                console.log('[ChatWindow] Task stopped:', data);
                this.currentTask = null;
                // CRITICAL: Stop ALL spinners and show an 'x' for all active actions
                this.actionStatuses.forEach((data, actionId) => {
                    const entry = data.element;
                    const actionIcon = entry.querySelector('.action-icon');
                    if (actionIcon) {
                        const spinner = actionIcon.querySelector('.action-spinner');
                        if (spinner) {
                            spinner.remove();
                            actionIcon.innerHTML = '<i class="fas fa-times action-error"></i>';
                        }
                    }
                });
                this.addMessage(`Task stopped: ${data.task}`, 'ai', false);
                this.updateStatus('Ready', 'ready');
                this.updateSendButton();
            });

            window.chatAPI.onBackendError((event, data) => {
                console.log('[ChatWindow] Backend error:', data);
                // Stop the spinner on error
                this.updateActionStatus(null, false, data.message);
                this.addMessage(`Error: ${data.message}`, 'ai', false);
                this.updateStatus('Error', 'error');
            });

            window.chatAPI.onWakeWordDetected((event, data) => {
                // Only handle if the wake word actually opened the chat (was closed before)
                if (data && data.openedChat) {
                    this.handleWakeWordDetection();
                } else {
                    console.log('[ChatWindow] Wake word detected but chat was already open, not auto-starting transcription');
                }
            });

            window.chatAPI.onAudioStarted((event, data) => {
                this.setAudioPlayingState(true);
            });

            window.chatAPI.onAudioStopped((event, data) => {
                this.setAudioPlayingState(false);
            });
        }
    }

    setupInputHandlers() {
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = this.chatInput.scrollHeight + 'px';
    }

    autoResizeTextarea() {
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 120) + 'px';
    }

    updateSendButton() {
        const hasText = this.chatInput.value.trim().length > 0;
        const hasAttachments = this.attachments && this.attachments.length > 0;

        if (this.currentTask || this.isAudioPlaying) {
            this.sendButton.innerHTML = `<i class="fas fa-square"></i>`;
            this.sendButton.classList.add('stop-button');
            this.sendButton.title = this.currentTask ? 'Stop task (Alt+Z)' : 'Stop audio';
            this.sendButton.disabled = false;
        } else {
            this.sendButton.innerHTML = `<i class="fas fa-paper-plane"></i>`;
            this.sendButton.classList.remove('stop-button');
            this.sendButton.title = 'Send message';
            this.sendButton.disabled = !(hasText || hasAttachments);
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    async setMode(mode) {
        this.currentMode = mode;
        if (mode === 'act') {
            this.modeAct.classList.add('active');
            this.modeAsk.classList.remove('active');
            this.chatInput.placeholder = "Describe a task to execute...";
        } else {
            this.modeAsk.classList.add('active');
            this.modeAct.classList.remove('active');
            this.chatInput.placeholder = "Ask a question or explain code...";
        }

        if (window.chatAPI && window.chatAPI.saveSettings) {
            try {
                await window.chatAPI.saveSettings({ lastMode: mode });
            } catch (error) {
                console.error('Failed to save last mode:', error);
            }
        }

        this.updateRateLimitDisplay();

        // Force the rate limit bar to show if not busy
        if (!this.currentTask && !this.isRecording) {
            this.updateStatus('', 'ready');
        }
    }

    async sendMessage() {
        const message = this.chatInput.value.trim();

        if (!message && this.attachments.length === 0 && !this.currentTask && !this.isAudioPlaying) return;

        if (this.currentTask) {
            await this.stopCurrentTask();
            return;
        }

        if (this.isAudioPlaying) {
            await this.stopAudio();
            return;
        }

        const isOnline = await this.checkInternetConnection();
        if (!isOnline) {
            this.showToast('No internet connection', 'error');
            return;
        }

        const taskPayload = {
            type: 'execute_task',
            text: message,
            attachments: this.attachments.map(a => ({
                name: a.name,
                type: a.type,
                size: a.size,
                data: a.data
            }))
        };

        const mode = this.currentMode;

        this.hideWelcomeScreen();

        if (message || this.attachments.length > 0) {
            this.addMessage(message, 'user', false, this.attachments.length > 0 ? [...this.attachments] : null);
        }

        this.chatInput.value = '';
        const attachmentsToSend = [...this.attachments];
        this.attachments = [];
        if (this.attachmentsContainer) this.attachmentsContainer.innerHTML = '';
        this.autoResizeTextarea();
        this.updateSendButton();

        // Show thinking indicator for both Ask and Act modes
        this.updateStatus('Thinking...', 'working');

        // Add visual thinking message only for Ask mode (optional, but requested)
        if (mode === 'ask') {
            this.addActionMessage('Thinking...', 'running');
        }

        try {
            if (window.chatAPI) {
                taskPayload.attachments = attachmentsToSend.map(a => ({
                    name: a.name,
                    type: a.type,
                    size: a.size,
                    data: a.data
                }));
                await window.chatAPI.executeTask(taskPayload, mode);
            }
        } catch (error) {
            console.error('Failed to execute task:', error);
            this.addMessage(`Failed to execute task: ${error.message}`, 'ai', false);
            this.updateStatus('Error', 'error');
            // Clear thinking indicator if error
            this.updateActionStatus('Thinking...', false, 'Failed to start.');
        }
    }

    async showWelcomeScreen() {
        if (!this.welcomeScreen || !this.welcomeGreeting) return;

        const randomGreeting = this.greetings[Math.floor(Math.random() * this.greetings.length)];
        const personalized = this.userName ? `${randomGreeting}, ${this.userName}!` : `${randomGreeting}!`;

        this.welcomeGreeting.textContent = personalized;
        this.welcomeScreen.classList.remove('welcome-hidden');

        if (window.chatAPI && window.chatAPI.shouldSpeakGreeting) {
            try {
                const isLocked = await window.chatAPI.isAppLocked?.();
                if (isLocked && isLocked.locked) {
                    console.log('[ChatWindow] App is locked, waiting for PIN before greeting');
                    return;
                }

                const result = await window.chatAPI.shouldSpeakGreeting();
                console.log('[ChatWindow] Greeting TTS check result:', result);
                if (result && result.shouldSpeak) {
                    console.log('[ChatWindow] Speaking greeting:', personalized);
                    window.chatAPI.speakGreeting(personalized);
                } else {
                    console.log('[ChatWindow] Greeting TTS disabled, not speaking');
                }
            } catch (err) {
                console.error('Error checking greeting TTS setting:', err);
            }
        }
    }

    hideWelcomeScreen() {
        if (this.welcomeScreen && !this.welcomeScreen.classList.contains('welcome-hidden')) {
            this.welcomeScreen.classList.add('welcome-hidden');
        }
    }

    checkAndShowWelcomeScreen() {
        // Check if messages container is empty (excluding welcome screen)
        const messages = this.messagesContainer.querySelectorAll('.message');
        if (messages.length === 0) {
            // Only show welcome screen if it's not already visible
            if (this.welcomeScreen && this.welcomeScreen.classList.contains('welcome-hidden')) {
                this.showWelcomeScreen();
            }
        } else {
            // Hide welcome screen if there are messages
            this.hideWelcomeScreen();
        }
    }

    async stopCurrentTask() {
        try {
            if (window.chatAPI) {
                await window.chatAPI.stopAction();
            }
        } catch (error) {
            console.error('Failed to stop action:', error);
        }
    }

    startNewConversation(showWelcome = true, keepMode = false) {
        if (this.currentSessionId) {
            this.saveCurrentSession();
        }
        this.currentSessionId = this.generateSessionId();
        // Clear messages but preserve welcome screen
        const welcomeScreen = this.messagesContainer.querySelector('#welcomeScreen');
        this.messagesContainer.innerHTML = '';
        if (welcomeScreen) {
            this.messagesContainer.appendChild(welcomeScreen);
        }
        this.messageGroups.clear();
        this.collapsedGroups.clear();
        this.attachments = [];
        if (this.attachmentsContainer) {
            this.attachmentsContainer.innerHTML = '';
        }
        this.chatInput.value = '';
        this.autoResizeTextarea();
        this.updateSendButton();
        this.actionStatuses.clear();
        this.lastActionId = null;
        // Show welcome screen only if requested (default true)
        if (showWelcome !== false) {
            this.showWelcomeScreen();
        }
        this.updateStatus('Ready', 'ready');

        if (!keepMode) {
            this.setMode('act'); // Default to ACT only if not keeping mode
        }
    }

    // Voice recording with Vosk integration (V2 WebSocket)
    toggleVoiceRecording() {
        if (this.isRecording) {
            this.stopVoiceRecording('user_click');
        } else {
            this.startVoiceRecording();
        }
    }

    async startVoiceRecording() {
        if (this.isRecording) return;
        this.isRecording = true;

        try {
            // 1. Disable wakeword to release microphone hardware
            if (window.chatAPI && window.chatAPI.setWakewordEnabled) {
                console.log('[Voice] Disabling wakeword...');
                window.chatAPI.setWakewordEnabled(false);
            }

            // 2. CRITICAL: 2-second Hardware Handshake Delay
            // Massive buffer to ensure the background process has fully released the mic.
            console.log('[Voice] Waiting for hardware release (2000ms)...');
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 3. Request microphone access
            console.log('[Voice] Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.stream = stream;

            // 4. Initialize AudioContext and AudioWorklet
            console.log('[Voice] Initializing AudioContext (AudioWorklet)...');
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioContext = audioContext;
            await audioContext.resume();

            // Define worklet processor code
            const workletCode = `
                class VoiceProcessor extends AudioWorkletProcessor {
                    process(inputs) {
                        const input = inputs[0];
                        if (input && input.length > 0) {
                            this.port.postMessage(input[0]);
                        }
                        return true;
                    }
                }
                registerProcessor('voice-processor', VoiceProcessor);
            `;
            const blob = new Blob([workletCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            await audioContext.audioWorklet.addModule(url);
            URL.revokeObjectURL(url); // Cleanup URL immediately

            const source = audioContext.createMediaStreamSource(stream);
            const workletNode = new AudioWorkletNode(audioContext, 'voice-processor');
            source.connect(workletNode);

            // Use virtual sink only (Strict hardware separation)
            this.audioDestination = audioContext.createMediaStreamDestination();
            workletNode.connect(this.audioDestination);

            this.processor = workletNode;

            // 5. Connect to Vosk Server
            console.log('[Voice] Connecting to ws://127.0.0.1:2700...');
            this.voiceButton.classList.add('recording');
            this.updateStatus('Connecting to voice server...', 'working');

            this.ws = new WebSocket('ws://127.0.0.1:2700');

            // Pre-allocate buffers for reuse
            let resampledBuffer = new Float32Array(4096);
            let int16Buffer = new Int16Array(4096);

            // Buffer for accumulating audio chunks before sending (min 320 samples = 640 bytes)
            const audioBuffer = [];
            const MIN_CHUNK_SIZE = 320; // Minimum samples to send (recommended for Vosk)
            let bufferedSamples = 0;

            this.ws.onopen = () => {
                console.log('[Voice] ✓ Connected to Vosk Server');
                if (window.chatAPI && window.chatAPI.logToTerminal) {
                    window.chatAPI.logToTerminal('✓ Voice WebSocket Connected');
                }
                this.updateStatus('Listening...', 'listening');

                this.baseText = this.chatInput.value.trim();

                let chunkCount = 0;

                // Function to flush accumulated audio buffer
                const flushBuffer = () => {
                    if (audioBuffer.length === 0) return;

                    // Combine all buffered chunks
                    const totalSamples = audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
                    const combined = new Int16Array(totalSamples);
                    let offset = 0;
                    for (const chunk of audioBuffer) {
                        combined.set(chunk, offset);
                        offset += chunk.length;
                    }

                    // Send combined buffer
                    this.ws.send(combined.buffer);
                    chunkCount++;
                    if (chunkCount === 1) {
                        console.log('[Voice] First audio chunk sent via Worklet, size:', combined.length, 'samples');
                    }

                    // Clear buffer
                    audioBuffer.length = 0;
                    bufferedSamples = 0;
                };

                workletNode.port.onmessage = (event) => {
                    try {
                        if (!this.isRecording || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

                        const inputData = event.data;
                        const nativeRate = audioContext.sampleRate;
                        const ratio = nativeRate / 16000;
                        const newLength = Math.round(inputData.length / ratio);

                        if (resampledBuffer.length < newLength) {
                            resampledBuffer = new Float32Array(newLength);
                        }

                        if (nativeRate === 16000) {
                            resampledBuffer.set(inputData);
                        } else {
                            for (let i = 0; i < newLength; i++) {
                                resampledBuffer[i] = inputData[Math.round(i * ratio)];
                            }
                        }

                        if (int16Buffer.length < newLength) {
                            int16Buffer = new Int16Array(newLength);
                        }

                        for (let i = 0; i < newLength; i++) {
                            const s = Math.max(-1, Math.min(1, resampledBuffer[i]));
                            int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                        }

                        // Add to buffer
                        const dataToSend = int16Buffer.slice(0, newLength);
                        audioBuffer.push(dataToSend);
                        bufferedSamples += dataToSend.length;

                        // Send when buffer reaches minimum size
                        if (bufferedSamples >= MIN_CHUNK_SIZE) {
                            flushBuffer();
                        }

                        if (chunkCount % 50 === 0 && chunkCount > 0) {
                            console.log('[Voice] Sent', chunkCount, 'audio chunks');
                        }
                    } catch (err) {
                        console.error('[Voice] Worklet message error:', err);
                    }
                };

                // Flush buffer periodically (every 200ms) to avoid delays
                const flushInterval = setInterval(() => {
                    if (audioBuffer.length > 0 && this.isRecording) {
                        flushBuffer();
                    }
                }, 200);

                // Store interval ID for cleanup
                if (!this.voiceRecordingIntervals) {
                    this.voiceRecordingIntervals = [];
                }
                this.voiceRecordingIntervals.push(flushInterval);
            };

            this.ws.onerror = (error) => {
                console.error('[Voice] ✗ WebSocket error:', error);
                this.addMessage('Voice transcription server not responding. Please ensure the backend is running.', 'ai', false);
                this.stopVoiceRecording('websocket_error');
            };

            this.ws.onclose = (event) => {
                console.log('[Voice] WebSocket closed:', event.code, event.reason);
                if (this.isRecording) {
                    this.stopVoiceRecording('websocket_closed');
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const result = JSON.parse(event.data);

                    // Only log non-empty responses to reduce console spam
                    if (result.partial && result.partial.trim()) {
                        console.log('[Voice] Partial:', result.partial);
                        if (window.chatAPI && window.chatAPI.logToTerminal) {
                            window.chatAPI.logToTerminal(`Partial: ${result.partial}`);
                        }
                        const separator = this.baseText ? " " : "";
                        this.chatInput.value = this.baseText + separator + result.partial + "...";
                        this.autoResizeTextarea();
                    } else if (result.text && result.text.trim()) {
                        console.log('[Voice] Final result:', result.text);
                        if (window.chatAPI && window.chatAPI.logToTerminal) {
                            window.chatAPI.logToTerminal(`Final: ${result.text}`);
                        }
                        const separator = this.baseText ? " " : "";
                        this.baseText = this.baseText + separator + result.text;
                        this.chatInput.value = this.baseText;
                        this.autoResizeTextarea();
                        this.updateSendButton();
                        if (this.autoSendEnabled) this.resetSpeechTimeout();
                    }
                    // Ignore empty responses (silence detection)
                } catch (e) {
                    console.error('[Voice] Message parsing error:', e, event.data);
                }
            };

        } catch (e) {
            console.error('[Voice] Critical recording error:', e);
            this.addMessage('Microphone access or voice processing failed.', 'ai', false);
            this.stopVoiceRecording('critical_error');
        }
    }

    stopVoiceRecording(reason = 'unknown') {
        console.log(`Stopped voice recording (Reason: ${reason})`);
        console.trace('stopVoiceRecording call trace');

        this.isRecording = false;
        this.voiceButton.classList.remove('recording');

        // Clear any flush intervals
        if (this.voiceRecordingIntervals) {
            this.voiceRecordingIntervals.forEach(interval => clearInterval(interval));
            this.voiceRecordingIntervals = [];
        }

        if (this.ws) {
            // Remove handlers to prevent loops
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;
            this.ws.close();
            this.ws = null;
        }
        if (this.processor) {
            try {
                if (this.processor.onaudioprocess !== undefined) {
                    this.processor.onaudioprocess = null;
                }
                if (this.processor.port) {
                    this.processor.port.onmessage = null;
                }
                this.processor.disconnect();
            } catch (e) { console.error('Error disconnecting processor:', e); }
            this.processor = null;
        }
        if (this.audioDestination) {
            try {
                this.audioDestination.stream.getTracks().forEach(t => t.stop());
                this.audioDestination.disconnect();
            } catch (e) { console.error('Error disconnecting destination:', e); }
            this.audioDestination = null;
        }
        if (this.stream) {
            try {
                this.stream.getTracks().forEach(t => t.stop());
            } catch (e) { console.error('Error stopping stream:', e); }
            this.stream = null;
        }
        if (this.audioContext) {
            try {
                if (this.audioContext.state !== 'closed') {
                    this.audioContext.close();
                }
            } catch (e) {
                console.error('Error closing audio context:', e);
            }
            this.audioContext = null;
        }
        if (this.speechTimeout) {
            clearTimeout(this.speechTimeout);
            this.speechTimeout = null;
        }

        // Re-enable wakeword
        if (window.chatAPI && window.chatAPI.setWakewordEnabled) {
            window.chatAPI.setWakewordEnabled(true);
        }
    }

    async stopAudio() {
        try {
            console.log('Stopping audio playback');
            if (window.chatAPI && window.chatAPI.stopAudio) {
                await window.chatAPI.stopAudio();
                this.setAudioPlayingState(false);
            }
        } catch (error) {
            console.error('Failed to stop audio:', error);
        }
    }

    setAudioPlayingState(isPlaying) {
        console.log('[Voice] Audio playing state:', isPlaying);
        this.isAudioPlaying = isPlaying;
        this.updateSendButton();
    }

    startSpeechTimeout() {
        this.lastSpeechTime = Date.now();
        this.speechTimeout = setTimeout(() => {
            if (this.isRecording && this.autoSendEnabled) {
                const elapsed = Date.now() - this.lastSpeechTime;
                if (elapsed >= 5000) {
                    this.stopVoiceRecording('silence_timeout');
                    if (this.chatInput.value.trim()) {
                        this.sendMessage();
                    }
                } else {
                    this.startSpeechTimeout();
                }
            }
        }, 5000);
    }

    resetSpeechTimeout() {
        this.lastSpeechTime = Date.now();
        if (this.speechTimeout) {
            clearTimeout(this.speechTimeout);
        }
        if (this.autoSendEnabled && this.isRecording) {
            this.startSpeechTimeout();
        }
    }

    async handleWakeWordDetection() {
        console.log('[ChatWindow] Wake word detected - showing chat and focusing input');
        this.updateStatus('Wake word detected', 'listening');

        if (this.chatInput) {
            this.chatInput.focus();
        }

        // Load latest settings
        await this.loadSettings();

        console.log('[ChatWindow] Settings loaded. autoSendEnabled:', this.autoSendEnabled, 'isRecording:', this.isRecording);

        if (this.autoSendEnabled && !this.isRecording) {
            console.log('[ChatWindow] Auto-send enabled, starting voice recording after small delay...');
            // Small delay to ensure chat window is fully visible and focused
            setTimeout(() => {
                if (!this.isRecording) {
                    console.log('[ChatWindow] Starting voice recording now...');
                    this.startVoiceRecording();
                    this.startSpeechTimeout();
                }
            }, 300);
        } else {
            console.log('[ChatWindow] Auto-send NOT enabled or already recording. autoSendEnabled:', this.autoSendEnabled);
        }
    }

    handleFileAttachment() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '*/*';
        fileInput.style.display = 'none';
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                this.readAndAddFile(file);
            }
        };
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }

    async readAndAddFile(file) {
        // Read file as ArrayBuffer for direct transfer (more efficient than base64)
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const attachment = {
            name: file.name,
            size: file.size,
            type: file.type,
            data: Array.from(uint8Array)  // Convert to regular array for IPC serialization
        };
        this.attachments.push(attachment);
        this.renderAttachments();
        this.updateSendButton();
    }

    renderAttachments() {
        if (!this.attachmentsContainer) return;
        this.attachmentsContainer.innerHTML = '';
        this.attachments.forEach((a, idx) => {
            const pill = document.createElement('div');
            pill.className = 'attachment-pill';
            pill.innerHTML = `
                <div style="font-weight:500">${a.name}</div>
                <div style="opacity:0.6; font-size:11px">${this.formatFileSize(a.size)}</div>
                <button class="attachment-remove" title="Remove" data-idx="${idx}">×</button>
            `;
            this.attachmentsContainer.appendChild(pill);
        });

        this.attachmentsContainer.querySelectorAll('.attachment-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = Number(e.currentTarget.getAttribute('data-idx'));
                this.attachments.splice(idx, 1);
                this.renderAttachments();
                this.updateSendButton();
            });
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    addMessage(text, sender, isAction = false, attachments = null) {
        if (this.lastAddedMessage === text && this.lastAddedSender === sender && !attachments) {
            console.log('[ChatWindow] Skipping duplicate message:', text);
            return;
        }
        this.lastAddedMessage = text;
        this.lastAddedSender = sender;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        if (isAction) messageDiv.classList.add('action');

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (isAction) {
            contentDiv.innerHTML = `
                <div class="action-icon"><div class="action-spinner"></div></div>
                <span>${text}</span>
            `;
        } else {
            contentDiv.innerHTML = this.parseMarkdown(text || '');
        }

        if (attachments && attachments.length > 0) {
            const attachmentContainer = document.createElement('div');
            attachmentContainer.className = 'message-attachments';
            attachments.forEach(att => {
                const attDiv = document.createElement('div');
                if (att.type && att.type.startsWith('image/')) {
                    attDiv.className = 'message-attachment';
                    const img = document.createElement('img');
                    try {
                        const uint8Array = att.data instanceof Array ? new Uint8Array(att.data) : att.data;
                        const blob = new Blob([uint8Array], { type: att.type });
                        img.src = URL.createObjectURL(blob);
                        img.alt = att.name;
                        img.onload = () => URL.revokeObjectURL(img.src);
                        attDiv.appendChild(img);
                    } catch (e) {
                        console.error('Error displaying image attachment:', e);
                        attDiv.textContent = att.name;
                    }
                } else {
                    attDiv.className = 'message-attachment-file';
                    attDiv.innerHTML = `
                        <i class="fas fa-file"></i>
                        <span>${att.name} (${this.formatFileSize(att.size)})</span>
                    `;
                }
                attachmentContainer.appendChild(attDiv);
            });
            contentDiv.appendChild(attachmentContainer);
        }

        messageDiv.appendChild(contentDiv);
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();

        this.checkAndShowWelcomeScreen();

        return messageDiv;
    }

    addActionMessage(text, status) {
        const actionId = Date.now().toString();

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ai action';
        messageDiv.dataset.actionId = actionId;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = `
            <div class="action-header">
                <div class="action-icon"><div class="action-spinner"></div></div>
                <div class="action-title">${text}</div>
                <button class="action-toggle" title="Toggle logs">
                    <i class="fas fa-chevron-down"></i>
                </button>
            </div>
            <div class="action-details" id="actionDetails-${actionId}"></div>
        `;

        // Wire up toggle button
        const toggleBtn = contentDiv.querySelector('.action-toggle');
        const detailsDiv = contentDiv.querySelector('.action-details');
        if (toggleBtn && detailsDiv) {
            toggleBtn.addEventListener('click', () => {
                detailsDiv.classList.toggle('collapsed');
                toggleBtn.classList.toggle('collapsed');
            });
        }

        messageDiv.appendChild(contentDiv);
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
        this.actionStatuses.set(actionId, { element: messageDiv, text });
        this.lastActionId = actionId;

        this.hideWelcomeScreen();
    }

    updateActionStatus(actionText, success, details) {
        let entry = null;

        // Find the action element
        if (actionText) {
            for (const [id, data] of this.actionStatuses.entries()) {
                if (data.text === actionText) {
                    entry = data.element;
                    break;
                }
            }
        }

        if (!entry && this.lastActionId) {
            entry = this.actionStatuses.get(this.lastActionId)?.element;
        }

        if (entry) {
            const actionIcon = entry.querySelector('.action-icon');
            const actionDetailsEl = entry.querySelector('.action-details');

            // Finalize status (success/failure/done) - always stop spinner
            if (success !== null && success !== undefined) {
                if (actionIcon) {
                    // Remove any existing spinner
                    const spinner = actionIcon.querySelector('.action-spinner');
                    if (spinner) {
                        spinner.remove();
                    }

                    if (success === true) {
                        actionIcon.innerHTML = '<i class="fas fa-check action-success"></i>';
                    } else if (success === false) {
                        actionIcon.innerHTML = '<i class="fas fa-times action-error"></i>';
                    }
                }
            } else {
                // If success is undefined/null, still stop spinner if present
                if (actionIcon) {
                    const spinner = actionIcon.querySelector('.action-spinner');
                    if (spinner) {
                        spinner.remove();
                        // Default to success icon if no status specified
                        actionIcon.innerHTML = '<i class="fas fa-check action-success"></i>';
                    }
                }
            }

            // Update details (description) - append if already has content
            if (details && actionDetailsEl) {
                if (actionDetailsEl.textContent.trim()) {
                    actionDetailsEl.textContent += '\n' + details;
                } else {
                    actionDetailsEl.textContent = details;
                }
            }
        }
    }

    /**
     * Force-stop all thinking indicators. Called when AI response is received.
     * Aggressively clears all spinners and thinking states.
     */
    forceStopThinking() {
        // Remove all 'Thinking...' action elements
        for (const [id, data] of this.actionStatuses.entries()) {
            if (data.text === 'Thinking...') {
                if (data.element) {
                    data.element.remove();
                }
                this.actionStatuses.delete(id);
            }
        }

        // Also remove any spinners from remaining action elements
        for (const [id, data] of this.actionStatuses.entries()) {
            if (data.element) {
                const spinner = data.element.querySelector('.action-spinner');
                if (spinner) {
                    spinner.remove();
                }
            }
        }

        // Clear lastActionId if it was thinking
        this.lastActionId = null;

        // Reset status bar to ready + rate display
        this.updateStatus('Ready', 'ready');
        this.updateRateLimitDisplay();
    }

    getOrCreateMessageGroup(timestamp) {
        const groupTime = Math.floor(timestamp / (10 * 60 * 1000)) * (10 * 60 * 1000);
        if (!this.messageGroups.has(groupTime)) {
            const groupId = `group-${groupTime}`;
            this.messageGroups.set(groupTime, groupId);
            const groupDiv = document.createElement('div');
            groupDiv.className = 'message-group';
            groupDiv.dataset.groupId = groupId;
            const timeLabel = new Date(groupTime).toLocaleString();
            const isCollapsed = this.collapsedGroups.has(groupId);

            groupDiv.innerHTML = `
                <div class="message-group-header" data-group-id="${groupId}">
                    <span>${timeLabel}</span>
                    <div class="collapse-toggle ${isCollapsed ? 'collapsed' : ''}">
                        <i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i>
                    </div>
                </div>
                <div class="message-group-content" ${isCollapsed ? 'style="display: none;"' : ''}></div>
            `;
            this.messagesContainer.appendChild(groupDiv);
            groupDiv.querySelector('.message-group-header').addEventListener('click', () => {
                this.toggleGroup(groupId);
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        return this.messageGroups.get(groupTime);
    }

    toggleGroup(groupId) {
        const group = this.messagesContainer.querySelector(`[data-group-id="${groupId}"]`);
        if (!group) return;
        const content = group.querySelector('.message-group-content');
        const toggle = group.querySelector('.collapse-toggle');
        if (this.collapsedGroups.has(groupId)) {
            this.collapsedGroups.delete(groupId);
            content.style.display = 'block';
            toggle.classList.remove('collapsed');
        } else {
            this.collapsedGroups.add(groupId);
            content.style.display = 'none';
            toggle.classList.add('collapsed');
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    createIcon(name, color) {
        const i = document.createElement('i');
        i.className = name === 'check' ? 'fas fa-check' : 'fas fa-times';
        i.style.color = color;
        i.style.width = '12px';
        return i;
    }

    parseMarkdown(text) {
        if (!text) return '';

        // Escape HTML
        let safeText = text.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // 1. Code Blocks - temporarily replace to avoid parsing inside
        const codeBlocks = [];
        safeText = safeText.replace(/```([\s\S]*?)```/g, (match, code) => {
            codeBlocks.push(code);
            return `###CODE_BLOCK_${codeBlocks.length - 1}###`;
        });

        // 2. Inline Code
        const inlineCodes = [];
        safeText = safeText.replace(/`([^`]+)`/g, (match, code) => {
            inlineCodes.push(code);
            return `###INLINE_CODE_${inlineCodes.length - 1}###`;
        });

        // 3. Lists (Bullet points) - Multi-line supported
        safeText = safeText.replace(/^\s*[\-\*]\s+(.*)$/gm, '&bull; $1');

        // 4. Bold - lazy match to handle multiple instances per line
        safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // 5. Italic - matches *text*
        safeText = safeText.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

        // 6. Restore Inline Code
        safeText = safeText.replace(/###INLINE_CODE_(\d+)###/g, (match, index) => {
            return `<code style="background: rgba(102, 126, 234, 0.1); padding: 2px 6px; border-radius: 4px; font-size: 13px; color: #667eea;">${inlineCodes[index]}</code>`;
        });

        // 7. Newlines to <br>
        safeText = safeText.replace(/\n/g, '<br>');

        // 8. Restore Code Blocks
        safeText = safeText.replace(/###CODE_BLOCK_(\d+)###/g, (match, index) => {
            return `<pre style="background: rgba(0, 0, 0, 0.05); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0;"><code>${codeBlocks[index]}</code></pre>`;
        });

        return safeText;
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    updateStatus(text, type = 'ready') {
        if (!this.statusText || !this.statusDot) {
            console.warn('[ChatWindow] Status elements not found for update:', text);
            return;
        }

        const isReady = type === 'ready';
        const rateLimitContainer = document.getElementById('rateLimitContainer');
        const statusContent = document.getElementById('statusContent');

        // Clear any existing status timeout
        if (this.statusRevertTimeout) {
            clearTimeout(this.statusRevertTimeout);
            this.statusRevertTimeout = null;
        }

        if (isReady && rateLimitContainer && statusContent) {
            statusContent.style.display = 'none';
            rateLimitContainer.style.display = 'flex';
            this.updateRateLimitDisplay();
        } else {
            if (statusContent) statusContent.style.display = 'flex';
            if (rateLimitContainer) rateLimitContainer.style.display = 'none';

            this.statusText.textContent = text;
            this.statusDot.className = 'status-dot';
            switch (type) {
                case 'ready': this.statusDot.style.background = '#10b981'; break;
                case 'working': this.statusDot.style.background = '#f59e0b'; break;
                case 'error': this.statusDot.style.background = '#ef4444'; break;
                case 'listening': this.statusDot.style.background = '#3b82f6'; break;
                default: this.statusDot.style.background = '#10b981';
            }

            // Auto-revert to rate limit if not in a persistent state
            if (type !== 'working' && type !== 'listening' && type !== 'error') {
                this.statusRevertTimeout = setTimeout(() => {
                    this.updateStatus('Ready', 'ready');
                }, 3000); // Revert after 3 seconds
            }
        }
    }

    updateRateLimitDisplay() {
        const rateLimitContainer = document.getElementById('rateLimitContainer');
        if (!rateLimitContainer) return;

        const user = (this.settings && this.settings.userDetails) ? this.settings.userDetails : {};
        const plan = user.plan || 'free';
        const mode = this.currentMode || 'act';

        // Limits
        const limits = {
            free: { act: 10, ask: 20 },
            pro: { act: 200, ask: 300 },
            master: { act: Infinity, ask: Infinity }
        };

        const limitObj = limits[plan && limits[plan] ? plan : 'free'];
        const limit = limitObj ? limitObj[mode] : 10;
        const currentCount = user[`${mode}Count`] || 0;
        const remaining = Math.max(0, limit - currentCount);

        const progressBar = document.getElementById('rateLimitProgress');
        const textLabel = document.getElementById('rateLimitText');

        if (plan === 'master') {
            if (progressBar) progressBar.style.width = '100%';
            if (textLabel) textLabel.innerHTML = '<span class="rate-limit-infinity">∞</span>';
        } else {
            const percentage = Math.min(100, (currentCount / limit) * 100);
            if (progressBar) progressBar.style.width = `${percentage}%`;
            // Show Count / Limit (e.g. 5/10) or Remaining? Prompt says "show the current counter".
            // Let's show "5/10" format.
            if (textLabel) textLabel.textContent = `${currentCount}/${limit}`;

            // Color indication
            if (percentage > 90) {
                if (progressBar) progressBar.style.background = '#ef4444';
            } else {
                if (progressBar) progressBar.style.background = 'var(--accent-color)';
            }
        }
    }


    async openSettings() {
        try {
            if (window.chatAPI) {
                await window.chatAPI.showSettings();
            }
        } catch (error) {
            console.error('Failed to open settings:', error);
        }
    }

    toggleChatVisibility(visible) {
        const chatContainer = document.querySelector('.chat-container');
        if (chatContainer) {
            chatContainer.style.visibility = visible ? 'visible' : 'hidden';
            chatContainer.style.opacity = visible ? '1' : '0';
        }
    }

    async closeChat() {
        try {
            if (window.chatAPI && window.chatAPI.hideChat) {
                await window.chatAPI.hideChat();
            } else if (window.chatAPI) {
                await window.chatAPI.closeChat();
            }
        } catch (error) {
            console.error('Failed to close chat:', error);
        }
    }

    ensureChatVisible() {
        const chatContainer = document.querySelector('.chat-container');
        if (chatContainer) {
            chatContainer.style.visibility = 'visible';
            chatContainer.style.opacity = '1';
        }
    }

    async showChat() {
        try {
            if (window.chatAPI && window.chatAPI.showChat) {
                await window.chatAPI.showChat();
            } else {
                this.ensureChatVisible();
            }
        } catch (error) {
            this.ensureChatVisible();
        }
    }

    async loadSettings() {
        try {
            if (window.chatAPI && window.chatAPI.getSettings) {
                const settings = await window.chatAPI.getSettings();
                this.settings = settings;
                this.autoSendEnabled = settings.autoSendAfterWakeWord || false;

                if (settings.userDetails && settings.userDetails.name) {
                    this.userName = settings.userDetails.name;
                }

                if (settings.lastMode && (settings.lastMode === 'act' || settings.lastMode === 'ask')) {
                    this.setMode(settings.lastMode);
                }
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    destroy() {
        if (window.chatAPI) {
            window.chatAPI.removeAllListeners('ai-response');
            window.chatAPI.removeAllListeners('action-start');
            window.chatAPI.removeAllListeners('action-complete');
            window.chatAPI.removeAllListeners('task-start');
            window.chatAPI.removeAllListeners('task-complete');
            window.chatAPI.removeAllListeners('task-stopped');
            window.chatAPI.removeAllListeners('backend-error');
        }
        if (this.isRecording) {
            this.stopVoiceRecording();
        }
        if (this.speechTimeout) {
            clearTimeout(this.speechTimeout);
        }
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    loadSessions() {
        try {
            const stored = localStorage.getItem(this.sessionsStorageKey);
            this.sessions = stored ? JSON.parse(stored) : [];
        } catch (error) {
            this.sessions = [];
        }
    }

    saveSessions() {
        try {
            localStorage.setItem(this.sessionsStorageKey, JSON.stringify(this.sessions));
        } catch (error) {
            console.error('Error saving sessions:', error);
        }
    }

    saveCurrentSession() {
        if (!this.currentSessionId) return;
        const messages = [];
        const messageElements = this.messagesContainer.querySelectorAll('.message');

        messageElements.forEach(element => {
            const content = element.querySelector('.message-content');
            if (content) {
                const text = content.textContent || "";
                const sender = element.classList.contains('user') ? 'user' : 'ai';
                messages.push({ sender, text, timestamp: new Date().toISOString() });
            }
        });

        let session = this.sessions.find(s => s.id === this.currentSessionId);
        if (!session) {
            session = {
                id: this.currentSessionId,
                created: new Date().toISOString(),
                title: messages.length > 0 ? (messages[0].text.substring(0, 50) + '...') : 'Untitled Conversation',
                messages: []
            };
            this.sessions.unshift(session);
        }
        session.messages = messages;
        session.updated = new Date().toISOString();
        this.saveSessions();
    }

    deleteSession(sessionId) {
        this.sessions = this.sessions.filter(s => s.id !== sessionId);
        this.saveSessions();
    }

    restoreSession(sessionId) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) return;
        this.currentSessionId = sessionId;
        this.messagesContainer.innerHTML = '';
        this.messageGroups.clear();
        this.collapsedGroups.clear();
        if (session.messages && session.messages.length > 0) {
            session.messages.forEach(msg => {
                this.addMessage(msg.text, msg.sender);
            });
        } else {
            // Show welcome screen if no messages
            this.showWelcomeScreen();
        }
    }

    showSessionsModal() {
        let modal = document.getElementById('sessionsModal');
        if (!modal) {
            const modalHTML = `
                <div id="sessionsModal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10000; align-items: center; justify-content: center;">
                    <div style="background: white; border-radius: 8px; padding: 24px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                        <h2 style="margin: 0 0 16px 0; color: #333; font-size: 20px;">Past Conversations</h2>
                        <div id="sessionsList" style="margin-bottom: 16px;"></div>
                        <button onclick="document.getElementById('sessionsModal').style.display = 'none';" style="padding: 8px 16px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">Close</button>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('sessionsModal');
        }

        const sessionsList = modal.querySelector('#sessionsList');
        sessionsList.innerHTML = this.sessions.map(session => `
            <div style="padding: 12px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1; cursor: pointer;" onclick="window.chatWindowInstance.restoreSession('${session.id}'); document.getElementById('sessionsModal').style.display='none';">
                    <div style="font-weight: 600; color: #333;">${session.title}</div>
                    <div style="font-size: 12px; color: #999;">
                        ${session.messages.length} messages • ${new Date(session.created).toLocaleDateString()}
                    </div>
                </div>
                <button onclick="window.chatWindowInstance.deleteSession('${session.id}'); window.chatWindowInstance.showSessionsModal();" style="padding: 6px 12px; background: #ff6b6b; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 8px;">Delete</button>
            </div>
        `).join('') || '<p style="color: #999;">No past conversations yet.</p>';

        modal.style.display = 'flex';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.chatWindowInstance = new ChatWindow();
});

window.addEventListener('beforeunload', () => {
    if (window.chatWindowInstance) {
        window.chatWindowInstance.destroy();
    }
});