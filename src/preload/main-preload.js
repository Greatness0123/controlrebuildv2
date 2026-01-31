const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Window management - SINGLE toggleChat function now
    showFloatingButton: () => ipcRenderer.send('show-floating-button'),
    hideFloatingButton: () => ipcRenderer.send('hide-floating-button'),
    toggleChat: () => ipcRenderer.invoke('toggle-chat'), // ✅ Single function handles both cases
    openEntryWindow: () => ipcRenderer.invoke('show-window', 'entry'),
    
    // Visual effects
    onVisualEffect: (callback) => ipcRenderer.on('show-visual-effect', callback),
    onInteractionModeChanged: (callback) => ipcRenderer.on('interaction-mode-changed', callback),
    onShowFloatingButton: (callback) => ipcRenderer.on('show-floating-button', callback),
    onHideFloatingButton: (callback) => ipcRenderer.on('hide-floating-button', callback),
    onShowFloatingButtonIfEnabled: (callback) => ipcRenderer.on('show-floating-button-if-enabled', callback),
    onHideFloatingButtonIfEnabled: (callback) => ipcRenderer.on('hide-floating-button-if-enabled', callback),
    onFloatingButtonToggle: (callback) => ipcRenderer.on('floating-button-toggle', callback),
    onRequestPinAndToggle: (callback) => ipcRenderer.on('request-pin-and-toggle', callback),
    
    // Overlay hover (used to temporarily enable interactions when hovering the floating button)
    overlayHover: (isHover) => ipcRenderer.send('overlay-hover', isHover),
    
    // System info
    getPlatform: () => process.platform,
    getVersion: () => ipcRenderer.invoke('get-app-version'),
    
    // Settings helpers for overlay
    getSettings: () => ipcRenderer.invoke('get-settings'),
    onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', callback),
    verifyPin: (pin) => ipcRenderer.invoke('verify-pin', pin),
    verifyEntryID: (id) => ipcRenderer.invoke('verify-entry-id', id),
    isAppLocked: () => ipcRenderer.invoke('is-app-locked'),
    unlockApp: (pin) => ipcRenderer.invoke('unlock-app', pin),
    
    // Overlay controls
    focusOverlay: () => ipcRenderer.send('overlay-focus'),

    // Backend action events for overlay
    onActionStart: (callback) => ipcRenderer.on('action-start', callback),
    onActionStep: (callback) => ipcRenderer.on('action-step', callback),
    onActionComplete: (callback) => ipcRenderer.on('action-complete', callback),
    onTaskStart: (callback) => ipcRenderer.on('task-start', callback),
    onTaskComplete: (callback) => ipcRenderer.on('task-complete', callback),
    onTaskStopped: (callback) => ipcRenderer.on('task-stopped', callback),
    // AI responses (so overlay can react / hide effects when needed)
    onAIResponse: (callback) => ipcRenderer.on('ai-response', callback),
});

// Also expose a small convenience global for HTML onclick usage
contextBridge.exposeInMainWorld('openEntryWindow', () => ipcRenderer.invoke('show-window', 'entry'));