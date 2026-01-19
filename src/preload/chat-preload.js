const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chatAPI', {
    // Task execution
    executeTask: (task, mode) => ipcRenderer.invoke('execute-task', task, mode),
    stopTask: () => ipcRenderer.invoke('stop-task'),
    stopAction: () => ipcRenderer.invoke('stop-action'),

    // Audio control
    stopAudio: () => ipcRenderer.invoke('stop-audio'),

    // Transcription
    transcribeAudio: (audioData, audioType) => ipcRenderer.invoke('transcribe-audio', audioData, audioType),

    // Backend messages
    onAIResponse: (callback) => ipcRenderer.on('ai-response', callback),
    onTranscriptionResult: (callback) => ipcRenderer.on('transcription-result', callback),
    onActionStart: (callback) => ipcRenderer.on('action-start', callback),
    onActionStep: (callback) => ipcRenderer.on('action-step', callback),
    onActionComplete: (callback) => ipcRenderer.on('action-complete', callback),
    onTaskStart: (callback) => ipcRenderer.on('task-start', callback),
    onTaskComplete: (callback) => ipcRenderer.on('task-complete', callback),
    onTaskStopped: (callback) => ipcRenderer.on('task-stopped', callback),
    onBackendError: (callback) => ipcRenderer.on('backend-error', callback),

    // Audio state events
    onAudioStarted: (callback) => ipcRenderer.on('audio-started', callback),
    onAudioStopped: (callback) => ipcRenderer.on('audio-stopped', callback),

    // Wake word detection
    onWakeWordDetected: (callback) => ipcRenderer.on('wakeword-detected', callback),
    setWakewordEnabled: (enabled) => ipcRenderer.invoke('set-wakeword-enabled', enabled),

    // Window controls
    closeChat: () => ipcRenderer.invoke('close-window', 'chat'),
    hideChat: () => ipcRenderer.invoke('hide-window', 'chat'),
    showChat: () => ipcRenderer.invoke('show-window', 'chat'),
    showSettings: () => ipcRenderer.invoke('show-window', 'settings'),
    dragWindow: (delta) => ipcRenderer.send('window-drag', delta),

    // Greeting TTS
    shouldSpeakGreeting: () => ipcRenderer.invoke('should-speak-greeting'),
    speakGreeting: (text) => ipcRenderer.invoke('speak-greeting', text),

    // App state
    isAppLocked: () => ipcRenderer.invoke('is-app-locked'),

    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', callback),
    onUserDataUpdated: (callback) => ipcRenderer.on('user-data-updated', callback),
    onUserChanged: (callback) => ipcRenderer.on('user-changed', callback),

    // App initialization
    onAppInitialized: (callback) => ipcRenderer.on('app-initialized', callback),

    // Remove listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});