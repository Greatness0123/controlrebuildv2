const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('entryAPI', {
    // Authentication - verify entry ID with Firebase
    verifyEntryID: (entryId) => ipcRenderer.invoke('verify-entry-id', entryId),
    authenticateUser: (userId) => ipcRenderer.invoke('authenticate-user', userId),
    getUserInfo: () => ipcRenderer.invoke('get-user-info'),

    // Window control
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window', 'entry'),

    // Window dragging
    dragWindow: (delta) => ipcRenderer.send('window-drag', delta),

    // External links
    openWebsite: () => ipcRenderer.invoke('open-website'),

    // App control
    quitApp: () => ipcRenderer.invoke('quit-app'),

    // System info
    getPlatform: () => process.platform,
});