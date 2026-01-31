const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
    // Settings management
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    getCurrentUser: () => ipcRenderer.invoke('get-user-info'),

    // Event listeners for real-time updates
    onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', callback),
    onUserChanged: (callback) => ipcRenderer.on('user-changed', callback),
    onPorcupineKeyInvalid: (callback) => ipcRenderer.on('porcupine-key-invalid', callback),

    // Floating button visibility
    updateFloatingButton: (visible) => ipcRenderer.invoke('update-floating-button', visible),
    onFloatingButtonToggle: (callback) => ipcRenderer.on('floating-button-toggle', callback),

    // Security
    verifyPin: (pin) => ipcRenderer.invoke('verify-pin', pin),
    setSecurityPin: (pin) => ipcRenderer.invoke('set-security-pin', pin),
    enableSecurityPin: (enabled) => ipcRenderer.invoke('enable-security-pin', enabled),
    changePin: (currentPin, newPin) => ipcRenderer.invoke('change-pin', currentPin, newPin),

    // App control
    lockApp: () => ipcRenderer.invoke('lock-app'),
    logout: () => ipcRenderer.invoke('logout'),
    quitApp: () => ipcRenderer.invoke('quit-app'),
    newConversation: () => ipcRenderer.invoke('new-conversation'),

    // Auto-start
    setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),

    // Hotkeys
    updateHotkeys: (hotkeys) => ipcRenderer.invoke('update-hotkeys', hotkeys),

    closeSettings: () => ipcRenderer.send('close-settings'),

    // External links
    openWebsite: () => ipcRenderer.invoke('open-website'),
    openExternal: (url) => ipcRenderer.invoke('open-external-url', url),

    // Picovoice (per-user) key management
    getPicovoiceKey: () => ipcRenderer.invoke('get-picovoice-key'),
    setPicovoiceKey: (key) => ipcRenderer.invoke('set-picovoice-key', key),
    validatePicovoiceKey: (key) => ipcRenderer.invoke('validate-picovoice-key', key),

    // Window visibility
    setWindowVisibility: (visible) => ipcRenderer.invoke('set-window-visibility', visible),
});