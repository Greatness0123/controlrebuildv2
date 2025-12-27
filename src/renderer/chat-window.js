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

        this.isTyping = false;
        this.isRecording = false;
        this.currentTask = null;
        this.actionStatuses = new Map();
        this.attachments = [];
        this.mediaRecorder = null;
        this.chunks = [];
        this.messageGroups = new Map();
        this.collapsedGroups = new Set();
        
        // Speech recognition for auto-send feature
        this.speechTimeout = null;
        this.autoSendEnabled = false;
        this.lastSpeechTime = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupIPCListeners();
        this.setupInputHandlers();
        this.setupKeyboardShortcuts();
        this.initializeLucideIcons();
        this.updateSendButton();
        this.loadSettings();
    }

    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setupEventListeners() {
        // Send button
        this.sendButton.addEventListener('click', () => {
            this.sendMessage();
        });

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
                this.startNewConversation();
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
        });

        // Close window on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeChat();
            }
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Alt+Z to stop current task
            if (e.altKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (this.currentTask) {
                    this.stopCurrentTask();
                }
            }
        });
    }

    setupIPCListeners() {
        if (window.chatAPI) {
            // AI responses
            window.chatAPI.onAIResponse((event, data) => {
                this.addMessage(data.text, 'ai', data.is_action);
            });

            // Transcription results
            window.chatAPI.onTranscriptionResult((event, data) => {
                if (data && data.text) {
                    this.chatInput.value = data.text;
                    this.autoResizeTextarea();
                    this.updateSendButton();
                    
                    // Handle auto-send if enabled
                    if (this.autoSendEnabled && this.isRecording) {
                        this.resetSpeechTimeout();
                    }
                }
            });

            // Action updates
            window.chatAPI.onActionStart((event, data) => {
                this.addActionMessage(data.description, 'running');
            });

            window.chatAPI.onActionComplete((event, data) => {
                this.updateActionStatus(data.description, data.success, data.details);
            });

            // Task updates
            window.chatAPI.onTaskStart((event, data) => {
                this.currentTask = data.task;
                this.addMessage(`Starting task: ${data.task}`, 'ai', true);
                this.updateStatus('Working on task...', 'working');
                this.updateSendButton();
            });

            window.chatAPI.onTaskComplete((event, data) => {
                this.currentTask = null;
                this.updateStatus('Ready', 'ready');
                this.updateSendButton();
            });

            window.chatAPI.onTaskStopped((event, data) => {
                this.currentTask = null;
                this.addMessage(`Task stopped: ${data.task}`, 'ai', false);
                this.updateStatus('Ready', 'ready');
                this.updateSendButton();
            });

            // Backend errors
            window.chatAPI.onBackendError((event, data) => {
                this.addMessage(`Error: ${data.message}`, 'ai', false);
                this.updateStatus('Error', 'error');
            });

            // Wake word detection
            window.chatAPI.onWakeWordDetected((event, data) => {
                this.handleWakeWordDetection();
            });
        }
    }

    setupInputHandlers() {
        // Auto-resize textarea
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
        
        if (this.currentTask) {
            // Show stop button
            this.sendButton.innerHTML = `
               <i class="fas fa-square"></i>
            `;
            this.sendButton.classList.add('stop-button');
            this.sendButton.title = 'Stop task (Alt+Z)';
        } else {
            // Show send button
            this.sendButton.innerHTML = `
                <i class="fas fa-paper-plane"></i>
            `;
            this.sendButton.classList.remove('stop-button');
            this.sendButton.title = 'Send message';
            this.sendButton.disabled = !(hasText || hasAttachments);
        }
        
        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    async sendMessage() {
        const message = this.chatInput.value.trim();

        if (!message && this.attachments.length === 0 && !this.currentTask) return;

        if (this.currentTask) {
            // Stop current task
            await this.stopCurrentTask();
            return;
        }

        // Build task payload
        const taskPayload = {
            type: 'execute_task',
            text: message,
            attachments: this.attachments.map(a => ({ name: a.name, type: a.type, data: a.data }))
        };

        // Add user message to current group
        if (message) {
            this.addMessage(message, 'user');
        }

        // Clear input and UI
        this.chatInput.value = '';
        this.attachments = [];
        if (this.attachmentsContainer) this.attachmentsContainer.innerHTML = '';
        this.autoResizeTextarea();
        this.updateSendButton();

        // Execute task
        try {
            if (window.chatAPI) {
                await window.chatAPI.executeTask(taskPayload);
            }
        } catch (error) {
            console.error('Failed to execute task:', error);
            this.addMessage(`Failed to execute task: ${error.message}`, 'ai', false);
        }
    }

    async stopCurrentTask() {
        try {
            if (window.chatAPI) {
                const result = await window.chatAPI.stopTask();
                if (result.success) {
                    this.addMessage(`Stopping task: ${result.task}`, 'user');
                }
            }
        } catch (error) {
            console.error('Failed to stop task:', error);
        }
    }

    startNewConversation() {
        // Clear messages
        this.messagesContainer.innerHTML = '';
        this.messageGroups.clear();
        this.collapsedGroups.clear();
        
        // Clear attachments
        this.attachments = [];
        if (this.attachmentsContainer) {
            this.attachmentsContainer.innerHTML = '';
        }
        
        // Clear input
        this.chatInput.value = '';
        this.autoResizeTextarea();
        this.updateSendButton();
        
        // Add welcome message
        this.addMessage("Hello! I'm Control, your AI assistant. How can I help you today?", 'ai');
        
        // Update status
        this.updateStatus('Ready', 'ready');
    }

    // Voice recording with Vosk integration
    toggleVoiceRecording() {
        if (this.isRecording) {
            this.stopVoiceRecording();
        } else {
            this.startVoiceRecording();
        }
    }

    startVoiceRecording() {
        // Use local audio recording with transcription via main process
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.showToast && this.showToast('Microphone not available', 'error');
            return;
        }

        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            this.mediaRecorder = new MediaRecorder(stream);
            this.chunks = [];
            
            this.mediaRecorder.ondataavailable = (e) => { 
                if (e.data.size) this.chunks.push(e.data); 
            };
            
            this.mediaRecorder.onstop = async () => {
                const blob = new Blob(this.chunks, { type: 'audio/webm' });
                const reader = new FileReader();
                
                reader.onload = async () => {
                    // Extract base64 from data URL
                    const base64 = reader.result.split(',')[1];
                    
                    try {
                        // Send to main process for transcription with Vosk model
                        const transcriptionResult = await window.chatAPI.transcribeAudio(base64, 'audio/webm');
                        
                        if (transcriptionResult && transcriptionResult.success && transcriptionResult.text) {
                            // Fill input with transcribed text
                            this.chatInput.value = transcriptionResult.text.trim();
                            this.autoResizeTextarea();
                            this.updateSendButton();
                            
                            // Handle auto-send if enabled
                            if (this.autoSendEnabled) {
                                this.resetSpeechTimeout();
                            }
                        } else {
                            const errorMsg = transcriptionResult?.error || 'Transcription failed';
                            console.error('Transcription error:', errorMsg);
                            this.showToast && this.showToast(errorMsg, 'error');
                        }
                    } catch (err) {
                        console.error('Transcription request failed:', err);
                        this.showToast && this.showToast('Transcription service error', 'error');
                    }
                };
                
                reader.readAsDataURL(blob);
                
                // Auto-delete audio file after transcription
                URL.revokeObjectURL(URL.createObjectURL(blob));
                
                // Stop audio tracks
                stream.getTracks().forEach(t => t.stop());
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.voiceButton.classList.add('recording');
            this.voiceIndicator.classList.add('show');
            
            // Start speech timeout for auto-send
            if (this.autoSendEnabled) {
                this.startSpeechTimeout();
            }
            
        }).catch(err => {
            console.error('Microphone permission denied', err);
            this.showToast && this.showToast('Microphone permission denied', 'error');
        });
    }

    stopVoiceRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        this.isRecording = false;
        this.voiceButton.classList.remove('recording');
        this.voiceIndicator.classList.remove('show');
        
        // Clear speech timeout
        if (this.speechTimeout) {
            clearTimeout(this.speechTimeout);
            this.speechTimeout = null;
        }
        
        console.log('Stopped voice recording');
    }

    startSpeechTimeout() {
        this.lastSpeechTime = Date.now();
        
        this.speechTimeout = setTimeout(() => {
            // Auto-send after 3 seconds of silence
            if (this.isRecording && this.autoSendEnabled) {
                const elapsed = Date.now() - this.lastSpeechTime;
                if (elapsed >= 3000) {
                    this.stopVoiceRecording();
                    // Auto-send if there's text
                    if (this.chatInput.value.trim()) {
                        this.sendMessage();
                    }
                } else {
                    // Restart timeout
                    this.startSpeechTimeout();
                }
            }
        }, 3000);
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

    handleWakeWordDetection() {
        // Handle "hey control" wake word
        if (!this.isRecording) {
            // Start listening immediately
            this.startVoiceRecording();
            
            // If chat is already open, don't toggle, just start listening
            console.log('Wake word detected - starting voice input');
        }
    }

    handleFileAttachment() {
        // Create a hidden file input
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
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            const base64 = dataUrl.split(',')[1];
            const attachment = { name: file.name, size: file.size, type: file.type, data: base64 };
            this.attachments.push(attachment);
            this.renderAttachments();
            this.updateSendButton();
        };
        reader.readAsDataURL(file);
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

        // bind remove handlers
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

    addMessage(text, sender, isAction = false) {
        const timestamp = Date.now();
        const groupId = this.getOrCreateMessageGroup(timestamp);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        messageDiv.dataset.timestamp = timestamp;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (isAction) {
            contentDiv.classList.add('action');
            contentDiv.innerHTML = `
                <div class="action-loader"></div>
                <span>${text}</span>
            `;
            
            // Store action status
            const actionId = timestamp.toString();
            this.actionStatuses.set(actionId, { text, status: 'running', element: contentDiv });
        } else {
            // Support basic markdown
            contentDiv.innerHTML = this.parseMarkdown(text);
        }
        
        messageDiv.appendChild(contentDiv);
        
        // Add to appropriate group
        const groupContent = this.messagesContainer.querySelector(`[data-group-id="${groupId}"] .message-group-content`);
        if (groupContent) {
            groupContent.appendChild(messageDiv);
        } else {
            // Fallback to direct addition if no group
            this.messagesContainer.appendChild(messageDiv);
        }
        
        this.scrollToBottom();
    }

    getOrCreateMessageGroup(timestamp) {
        // Create groups based on time (every 10 minutes)
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
            
            // Add collapse toggle functionality
            const header = groupDiv.querySelector('.message-group-header');
            header.addEventListener('click', () => {
                this.toggleGroup(groupId);
            });
            
            // Initialize Lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
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
        
        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    addCheckpoint(message) {
        const checkpointDiv = document.createElement('div');
        checkpointDiv.className = 'checkpoint';
        checkpointDiv.textContent = message;
        
        const lastGroup = this.messagesContainer.querySelector('.message-group:last-child .message-group-content');
        if (lastGroup) {
            lastGroup.appendChild(checkpointDiv);
        } else {
            this.messagesContainer.appendChild(checkpointDiv);
        }
        
        this.scrollToBottom();
    }

    addActionMessage(text, status) {
        this.addMessage(text, 'ai', true);
    }

    updateActionStatus(actionText, success, details) {
        // Find the most recent action message
        const actionMessages = this.messagesContainer.querySelectorAll('.message.action .message-content');
        
        for (let i = actionMessages.length - 1; i >= 0; i--) {
            const message = actionMessages[i];
            if (message.textContent.includes(actionText)) {
                const loader = message.querySelector('.action-loader');
                if (loader) {
                    if (success) {
                        loader.innerHTML = '✓';
                        loader.className = 'action-success';
                    } else {
                        loader.innerHTML = '✗';
                        loader.className = 'action-error';
                    }
                }
                break;
            }
        }
    }

    parseMarkdown(text) {
        // Enhanced markdown parsing
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background: rgba(102, 126, 234, 0.1); padding: 2px 6px; border-radius: 4px; font-size: 13px; color: #667eea;">$1</code>')
            .replace(/```(.*?)```/g, '<pre style="background: rgba(0, 0, 0, 0.05); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0;"><code>$1</code></pre>')
            .replace(/\n/g, '<br>');
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    updateStatus(text, type = 'ready') {
        this.statusText.textContent = text;
        
        // Update status dot
        this.statusDot.className = 'status-dot';
        switch (type) {
            case 'ready':
                this.statusDot.style.background = '#10b981';
                break;
            case 'working':
                this.statusDot.style.background = '#f59e0b';
                break;
            case 'error':
                this.statusDot.style.background = '#ef4444';
                break;
            default:
                this.statusDot.style.background = '#10b981';
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

    async closeChat() {
        try {
            if (window.chatAPI) {
                await window.chatAPI.closeChat();
            }
        } catch (error) {
            console.error('Failed to close chat:', error);
        }
    }

    async loadSettings() {
        try {
            if (window.chatAPI && window.chatAPI.getSettings) {
                const settings = await window.chatAPI.getSettings();
                this.autoSendEnabled = settings.autoSendAfterWakeWord || false;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    // Cleanup
    destroy() {
        if (window.chatAPI) {
            // Remove all IPC listeners
            window.chatAPI.removeAllListeners('ai-response');
            window.chatAPI.removeAllListeners('action-start');
            window.chatAPI.removeAllListeners('action-complete');
            window.chatAPI.removeAllListeners('task-start');
            window.chatAPI.removeAllListeners('task-complete');
            window.chatAPI.removeAllListeners('task-stopped');
            window.chatAPI.removeAllListeners('backend-error');
        }
        
        // Stop voice recording if active
        if (this.isRecording) {
            this.stopVoiceRecording();
        }
        
        // Clear timeouts
        if (this.speechTimeout) {
            clearTimeout(this.speechTimeout);
        }
    }
}

// Initialize chat window
document.addEventListener('DOMContentLoaded', () => {
    window.chatWindowInstance = new ChatWindow();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.chatWindowInstance) {
        window.chatWindowInstance.destroy();
    }
});