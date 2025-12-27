const { app, BrowserWindow, globalShortcut, ipcMain, screen, shell, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const isDev = require('electron-is-dev');

app.disableHardwareAcceleration();

// Import our custom modules
const WindowManager = require('./window-manager');
const HotkeyManager = require('./hotkey-manager');
const SecurityManager = require('./security-manager-fixed');
const BackendManager = require('./backend-manager-fixed');
const WakewordManager = require('./wakeword-manager');
const EdgeTTSManager = require('./edge-tts');
const TranscriptionService = require('./transcription-service');
const SettingsManager = require('./settings-manager');
const firebaseService = require('./firebase-service');

class ComputerUseAgent {
    constructor() {
        this.isReady = false;
        this.isQuitting = false;
        this.isAuthenticated = false; // ✅ NEW: Track authentication state
        this.tray = null;
        
        // Initialize managers
        this.windowManager = new WindowManager();
        this.hotkeyManager = new HotkeyManager();
        this.securityManager = new SecurityManager();
        this.backendManager = new BackendManager();
        this.wakewordManager = new WakewordManager();
        this.edgeTTS = new EdgeTTSManager();
        this.transcriptionService = new TranscriptionService();
        this.settingsManager = new SettingsManager();
        
        // Load persisted settings
        this.appSettings = this.settingsManager.getSettings();
        
        this.setupEventHandlers();
        this.setupIPCHandlers();

        // Listen for hotkey events emitted by HotkeyManager via process.emit
        process.on('hotkey-triggered', (payload) => {
            try {
                const { event, data } = payload;
                switch (event) {
                    case 'toggle-chat':
                        // Hide settings when toggling chat
                        this.windowManager.hideWindow('settings');
                        
                        // ✅ FIXED: Check authentication state instead of duplicating logic
                        if (this.securityManager && this.securityManager.isEnabled() && !this.isAuthenticated) {
                            // User needs to authenticate first - show PIN modal
                            console.log('[Main] PIN required, requesting authentication');
                            const mainWin = this.windowManager.getWindow('main');
                            if (mainWin && !mainWin.isDestroyed()) {
                                this.windowManager.setInteractive(false); 
                                mainWin.webContents.send('request-pin-and-toggle');
                            }
                        } else {
                            // User is authenticated or PIN disabled - just toggle
                            console.log('[Main] User authenticated or PIN disabled, toggling chat');
                            this.windowManager.toggleChat();
                        }
                        break;
                    case 'stop-task':
                        this.backendManager.stopTask();
                        break;
                    default:
                        console.log('Unhandled hotkey event:', event);
                }
            } catch (e) {
                console.error('Error handling hotkey event:', e);
            }
        });
    }

    setupEventHandlers() {
        app.whenReady().then(() => this.onAppReady());
        app.on('window-all-closed', () => this.onWindowAllClosed());
        app.on('activate', () => this.onActivate());
        app.on('will-quit', () => this.onWillQuit());
        app.on('before-quit', () => {
            this.isQuitting = true;
        });
    }

   async onAppReady() {
        try {
            console.log('[Main] Control starting...');
            
            // Set up security and permissions
            await this.setupPermissions();
            
            // Initialize all windows (they are created with visible: false and show: false)
            await this.windowManager.initializeWindows();

            // Show main overlay after all windows are initialized
            this.windowManager.showWindow('main');
            
            // Set up global hotkeys
            this.hotkeyManager.setupHotkeys();
            
            // Start backend process
            await this.backendManager.startBackend();

            // âœ… Log loaded settings
            console.log('[Main] Loaded app settings:', this.appSettings);

            // âœ… ENABLE EDGETTS ONLY IF voiceResponse IS ENABLED IN SETTINGS
            if (this.appSettings.voiceResponse) {
                console.log('[Main] Voice response enabled in settings, enabling EdgeTTS');
                this.edgeTTS.enable(true);
            } else {
                console.log('[Main] Voice response disabled in settings, EdgeTTS will remain disabled');
                this.edgeTTS.enable(false);
            }
            
            // Start wakeword helper if voice activation is enabled in saved settings
            if (this.appSettings.voiceActivation) {
                console.log('[Main] Voice activation enabled, starting wakeword manager');
                this.wakewordManager.enable(true);
            } else {
                console.log('[Main] Voice activation disabled');
            }

            // âœ… Listen for AI responses and check settings before speaking
            this.backendManager.on('ai-response', (data) => {
                console.log('[Main] AI response received');
                console.log('[Main] Response data:', JSON.stringify(data, null, 2));
                console.log('[Main] voiceResponse setting:', this.appSettings.voiceResponse);
                console.log('[Main] TTS enabled:', this.edgeTTS.isEnabled());
                
                // Send to renderer for display
                const chatWin = this.windowManager.getWindow('chat');
                if (chatWin && !chatWin.isDestroyed()) {
                    console.log('[Main] Sending AI response to chat window');
                    chatWin.webContents.send('ai-response', data);
                } else {
                    console.log('[Main] Chat window not found or destroyed');
                }
                
                // Speak response only if BOTH conditions are met:
                // 1. voiceResponse setting is enabled
                // 2. Response contains text
                if (this.appSettings.voiceResponse && data && data.text) {
                    console.log('[Main] ✓ All conditions met - Speaking AI response');
                    console.log('[Main] Text to speak:', data.text);
                    this.edgeTTS.speak(data.text);
                } else {
                    console.log('[Main] ✗ Cannot speak response:');
                    console.log('    - voiceResponse enabled:', this.appSettings.voiceResponse);
                    console.log('    - Response has text:', !!(data && data.text));
                    if (data && data.text) {
                        console.log('    - Text content:', data.text);
                    }
                }
            });

            // Add IPC handlers for TTS control
            ipcMain.handle('tts-stop', () => {
                console.log('[Main] [IPC] tts-stop requested');
                this.edgeTTS.stop();
                return { success: true };
            });

            ipcMain.handle('tts-get-voices', async () => {
                console.log('[Main] [IPC] tts-get-voices requested');
                const voices = await this.edgeTTS.getAvailableVoices();
                console.log('[Main] [IPC] Available voices:', voices);
                return { success: true, voices };
            });

            ipcMain.handle('tts-set-voice', (event, voice) => {
                console.log('[Main] [IPC] tts-set-voice requested:', voice);
                this.edgeTTS.setVoice(voice);
                return { success: true };
            });

            ipcMain.handle('tts-set-rate', (event, rate) => {
                console.log('[Main] [IPC] tts-set-rate requested:', rate);
                this.edgeTTS.setRate(rate);
                return { success: true };
            });
            
            // Setup system tray
            this.setupTray();
            
            // Show entry window by default
            this.windowManager.showWindow('entry');
            
            this.isReady = true;
            console.log('[Main] Control initialized successfully');
            
        } catch (error) {
            console.error('[Main] Application initialization failed:', error);
            app.quit();
        }
    }

    async setupPermissions() {
        // Set up security permissions
        app.on('web-contents-created', (event, contents) => {
            contents.on('new-window', (event, navigationUrl) => {
                event.preventDefault();
                shell.openExternal(navigationUrl);
            });
        });
    }

    setupIPCHandlers() {
        // Window management
        ipcMain.handle('show-window', (event, windowType) => {
            this.windowManager.showWindow(windowType);
            return { success: true };
        });

        ipcMain.handle('hide-window', (event, windowType) => {
            this.windowManager.hideWindow(windowType);
            return { success: true };
        });

        // ✅ SINGLE toggle-chat handler - checks authentication state internally
        ipcMain.handle('toggle-chat', () => {
            console.log('[Main] toggle-chat handler called');
            
            // Check if authentication is required
            if (this.securityManager && this.securityManager.isEnabled() && !this.isAuthenticated) {
                console.log('[Main] Authentication required, requesting PIN');
                const mainWin = this.windowManager.getWindow('main');
                if (mainWin && !mainWin.isDestroyed()) {
                    this.windowManager.setInteractive(true);
                    mainWin.webContents.send('request-pin-and-toggle');
                }
                return { success: false, needsAuth: true };
            }
            
            // User is authenticated or PIN disabled
            console.log('[Main] Calling windowManager.toggleChat()');
            const result = this.windowManager.toggleChat();
            console.log('[Main] toggleChat result:', result);
            return result;
        });

        ipcMain.handle('close-window', (event, windowType) => {
            this.windowManager.closeWindow(windowType);
            return { success: true };
        });

        // Security
        ipcMain.handle('verify-pin', (event, pin) => {
            const result = this.securityManager.verifyPin(pin);
            if (result.valid) {
                this.isAuthenticated = true; // ✅ Set authentication state
                this.windowManager.setOverlayInteractive(false);
                console.log('[Main] PIN verified, user authenticated');
            }
            return result;
        });

        ipcMain.handle('enable-security-pin', async (event, enabled) => {
            try {
                const result = await this.securityManager.enablePin(enabled);
                // If PIN is disabled, clear authentication requirement
                if (!enabled) {
                    this.isAuthenticated = false;
                }
                return result;
            } catch (err) {
                return { success: false, message: err.message };
            }
        });

        ipcMain.handle('set-security-pin', async (event, pin) => {
            try {
                return await this.securityManager.setPin(pin);
            } catch (err) {
                return { success: false, message: err.message };
            }
        });

        // Change PIN (requires current PIN)
        ipcMain.handle('change-pin', async (event, currentPin, newPin) => {
            try {
                return await this.securityManager.changePin(currentPin, newPin);
            } catch (err) {
                return { success: false, message: err.message };
            }
        });

        // Authentication & entry window
        ipcMain.handle('authenticate-user', async (event, userId) => {
    try {
        const result = await firebaseService.getUserById(userId);
        
        if (result.success) {
            this.settingsManager.updateSettings({
                userAuthenticated: true,
                userDetails: result.user
            });
        }
        
        return result;
    } catch (error) {
        console.error('Authentication error:', error);
        return {
            success: false,
            message: 'Authentication failed. Please try again.'
        };
    }
});

       ipcMain.handle('get-user-info', async () => {
    try {
        const settings = this.settingsManager.getSettings();
        
        if (settings.userAuthenticated && settings.userDetails) {
            // Optionally refresh from Firebase
            const result = await firebaseService.getUserById(settings.userDetails.id);
            
            if (result.success) {
                return {
                    success: true,
                    isAuthenticated: true,
                    ...result.user
                };
            }
        }
        
        return {
            success: false,
            isAuthenticated: false
        };
    } catch (error) {
        return {
            success: false,
            isAuthenticated: false
        };
    }
});

        // Entry verification (Firebase placeholder)
        ipcMain.handle('verify-entry-id', async (event, entryId) => {
    try {
        const result = await firebaseService.verifyEntryID(entryId);
        
        if (result.success) {
            // Store user info in settings
            this.settingsManager.updateSettings({
                userAuthenticated: true,
                userDetails: result.user
            });
        }
        
        return result;
    } catch (error) {
        console.error('Entry ID verification error:', error);
        return {
            success: false,
            message: 'Verification failed. Please try again.'
        };
    }
});

        // Window helpers
        ipcMain.handle('minimize-window', (event) => {
            const w = BrowserWindow.fromWebContents(event.sender);
            if (w) w.minimize();
            return { success: true };
        });

        ipcMain.handle('maximize-window', (event) => {
            const w = BrowserWindow.fromWebContents(event.sender);
            if (w) {
                if (w.isMaximized()) w.unmaximize(); else w.maximize();
            }
            return { success: true };
        });

        ipcMain.handle('get-app-version', () => {
            return { version: app.getVersion() };
        });

        // Close settings window
        ipcMain.on('close-settings', () => {
            this.windowManager.hideWindow('settings');
        });

        // Overlay hover: temporarily enable interactions when hovering the floating button
        ipcMain.on('overlay-hover', (event, isHover) => {
            try {
                this.windowManager.setInteractive(!!isHover);
            } catch (e) {
                console.error('Failed handling overlay hover:', e);
            }
        });

        ipcMain.on('overlay-focus', (event) => {
            try {
                const mainWin = this.windowManager.getWindow('main');
                if (mainWin && !mainWin.isDestroyed()) {
                    mainWin.show();
                    mainWin.focus();
                }
            } catch (e) {
                console.error('Failed to focus overlay:', e);
            }
        });

        // Logout placeholder
        ipcMain.handle('logout', async () => {
            // Clear authentication state on logout
            // this.isAuthenticated = false;
            // return { success: true };
        });

        // New conversation placeholder
        ipcMain.handle('new-conversation', async () => {
            // Implement clearing conversation state if stored
            return { success: true };
        });

        ipcMain.handle('lock-app', () => {
            console.log('[Main] lock-app handler called');
            this.isAuthenticated = false; // ✅ Clear authentication state
            // Close chat and settings windows
            this.windowManager.hideWindow('chat');
            this.windowManager.hideWindow('settings');
            // Lock the app
            const result = this.securityManager.lockApp();
            console.log('[Main] App locked, showing overlay');
            // Show the main overlay (overlay is always visible but will show PIN modal on interaction)
            this.windowManager.showWindow('main');
            return result;
        });

        ipcMain.handle('is-app-locked', () => {
            const isLocked = this.securityManager.isAppLocked();
            console.log('[Main] is-app-locked check:', isLocked);
            return isLocked;
        });

        ipcMain.handle('unlock-app', async (event, pin) => {
            console.log('[Main] unlock-app handler called');
            const result = await this.securityManager.unlockApp(pin);
            if (result.success) {
                this.isAuthenticated = true; // ✅ Set authentication state
                console.log('[Main] App unlocked, user authenticated');
            }
            return result;
        });

        // Backend communication
        ipcMain.handle('execute-task', async (event, task) => {
            return await this.backendManager.executeTask(task);
        });

        ipcMain.handle('stop-task', () => {
            return this.backendManager.stopTask();
        });

        // Transcription
        ipcMain.handle('transcribe-audio', async (event, audioData, audioType) => {
            const result = await this.transcriptionService.transcribe(audioData, audioType, false);
            return result;
        });

        // Settings
        ipcMain.handle('get-settings', () => {
            return this.getSettings();
        });

        ipcMain.handle('save-settings', (event, settings) => {
            return this.saveSettings(settings);
        });

        ipcMain.handle('open-website', () => {
            shell.openExternal('https://controlrebuild-website.vercel.app');
            return { success: true };
        });

        // App control
        ipcMain.handle('quit-app', () => {
            // Close all windows first (cleanup)
            this.windowManager.closeAllWindows();
            // Stop backend
            this.backendManager.stopBackend();
            // Quit app
            this.quitApp();
            return { success: true };
        });

        ipcMain.handle('restart-app', () => {
            app.relaunch();
            app.exit();
            return { success: true };
        });
    }

    getSettings() {
        const settings = this.settingsManager.getSettings();
        // Ensure security manager PIN status is reflected
        settings.pinEnabled = this.securityManager.isEnabled();
        return settings;
    }

    async saveSettings(settings) {
        try {
            if (settings.securityPin !== undefined) {
                await this.securityManager.setPin(settings.securityPin);
            }
            if (settings.pinEnabled !== undefined) {
                await this.securityManager.enablePin(settings.pinEnabled);
                // If disabling PIN, clear authentication requirement
                if (!settings.pinEnabled) {
                    this.isAuthenticated = false;
                }
            }
            if (settings.voiceActivation !== undefined) {
                this.appSettings.voiceActivation = !!settings.voiceActivation;
                this.wakewordManager.enable(this.appSettings.voiceActivation);
            }
            if (settings.voiceResponse !== undefined) {
                this.appSettings.voiceResponse = !!settings.voiceResponse;
                this.edgeTTS.enable(this.appSettings.voiceResponse);
            }
            
            // Save all settings to persistent storage
            this.settingsManager.updateSettings({
                pinEnabled: settings.pinEnabled !== undefined ? settings.pinEnabled : this.appSettings.pinEnabled,
                voiceActivation: settings.voiceActivation !== undefined ? settings.voiceActivation : this.appSettings.voiceActivation,
                voiceResponse: settings.voiceResponse !== undefined ? settings.voiceResponse : this.appSettings.voiceResponse,
                muteNotifications: settings.muteNotifications !== undefined ? settings.muteNotifications : this.appSettings.muteNotifications,
                userAuthenticated: settings.userAuthenticated !== undefined ? settings.userAuthenticated : this.appSettings.userAuthenticated,
                userDetails: settings.userDetails !== undefined ? settings.userDetails : this.appSettings.userDetails
            });
            
            return { success: true };
        } catch (error) {
            console.error('Failed to save settings:', error);
            return { success: false, error: error.message };
        }
    }

    onWindowAllClosed() {
        // Don't quit on Windows/Linux when all windows are closed
        // Keep the app running in background
        if (process.platform !== 'darwin' && this.isQuitting) {
            app.quit();
        }
    }

    onActivate() {
        if (!this.isReady) {
            this.onAppReady();
        }
    }

    onWillQuit() {
        this.hotkeyManager.unregisterAll();
        this.backendManager.stopBackend();
        this.windowManager.closeAllWindows();
    }

    setupTray() {
        try {
            // Path to tray icon
            const iconPath = path.join(__dirname, '../../assets/icons/icon-removebg-preview.png');
            
            // Create tray icon
            this.tray = new Tray(iconPath);
            this.tray.setToolTip('Control - AI Assistant');
            
            // Create tray context menu
            const contextMenu = Menu.buildFromTemplate([
                {
                    label: 'Show/Hide Chat',
                    click: () => {
                        this.windowManager.toggleChat();
                    }
                },
                {
                    label: 'Settings',
                    click: () => {
                        this.windowManager.showWindow('settings');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    click: () => {
                        this.quitApp();
                    }
                }
            ]);
            
            this.tray.setContextMenu(contextMenu);
            
            // Double click to toggle chat
            this.tray.on('double-click', () => {
                this.windowManager.toggleChat();
            });
            
            console.log('System tray initialized');
        } catch (error) {
            console.error('Failed to setup system tray:', error);
        }
    }

    quitApp() {
        this.isQuitting = true;
        if (this.tray) {
            this.tray.destroy();
        }
        app.quit();
    }
}

// Create and start the application
new ComputerUseAgent();