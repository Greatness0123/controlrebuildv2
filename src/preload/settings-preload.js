const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
    // Settings management
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    getCurrentUser: () => ipcRenderer.invoke('get-user-info'),
    
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
    
    // Window control
    closeSettings: () => ipcRenderer.send('close-settings'),
    
    // External links
    openWebsite: () => ipcRenderer.invoke('open-website'),
});