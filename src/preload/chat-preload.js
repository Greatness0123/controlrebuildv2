const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chatAPI', {
    // Task execution
    executeTask: (task) => ipcRenderer.invoke('execute-task', task),
    stopTask: () => ipcRenderer.invoke('stop-task'),
    
    // Transcription
    transcribeAudio: (audioData, audioType) => ipcRenderer.invoke('transcribe-audio', audioData, audioType),
    
    // Backend messages
    onAIResponse: (callback) => ipcRenderer.on('ai-response', callback),
    onTranscriptionResult: (callback) => ipcRenderer.on('transcription-result', callback),
    onActionStart: (callback) => ipcRenderer.on('action-start', callback),
    onActionComplete: (callback) => ipcRenderer.on('action-complete', callback),
    onTaskStart: (callback) => ipcRenderer.on('task-start', callback),
    onTaskComplete: (callback) => ipcRenderer.on('task-complete', callback),
    onTaskStopped: (callback) => ipcRenderer.on('task-stopped', callback),
    onBackendError: (callback) => ipcRenderer.on('backend-error', callback),
    
    // Window controls
    closeChat: () => ipcRenderer.invoke('close-window', 'chat'),
    showSettings: () => ipcRenderer.invoke('show-window', 'settings'),
    
    // Remove listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});