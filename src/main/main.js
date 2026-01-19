const { app, BrowserWindow, globalShortcut, ipcMain, screen, shell, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const isDev = require('electron-is-dev');

app.disableHardwareAcceleration();

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('[Main] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Main] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Import our custom modules
const WindowManager = require('./window-manager');
const HotkeyManager = require('./hotkey-manager');
const SecurityManager = require('./security-manager-fixed');
const BackendManager = require('./backend-manager-fixed');
const WakewordManager = require('./wakeword-manager');
const EdgeTTSManager = require('./edge-tts');
const VoskServerManager = require('./vosk-server-manager');
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
        global.windowManager = this.windowManager; // Required for BackendManager broadcasting
        this.hotkeyManager = new HotkeyManager();
        this.securityManager = new SecurityManager();
        this.backendManager = new BackendManager();
        this.wakewordManager = new WakewordManager();
        this.edgeTTS = new EdgeTTSManager();
        this.voskServerManager = new VoskServerManager();
        this.settingsManager = new SettingsManager();

        // Load persisted settings
        this.appSettings = this.settingsManager.getSettings();
        // Initialize defaults if not present
        if (this.appSettings.autoSendAfterWakeWord === undefined) {
            this.appSettings.autoSendAfterWakeWord = false;
        }
        if (!this.appSettings.lastMode) {
            this.appSettings.lastMode = 'act';
        }
        if (this.appSettings.windowVisibility === undefined) {
            this.appSettings.windowVisibility = true;
        }
        if (this.appSettings.wakeWordToggleChat === undefined) {
            this.appSettings.wakeWordToggleChat = false;
        }

        // Make settings available to window manager
        global.appSettings = this.appSettings;

        this.setupEventHandlers();
        this.setupIPCHandlers();

        // Listen for hotkey events emitted by HotkeyManager via process.emit
        process.on('hotkey-triggered', (payload) => {
            try {
                const { event, data } = payload;
                console.log(`[Main] hotkey-triggered: ${event}`, data || '');

                switch (event) {
                    case 'wakeword-detected':
                        // Optimize: Only hide settings if it might be visible (or let toggleChat handle it if needed)
                        // Checking visibility via window manager state would be faster than OS call
                        const settingsWin = this.windowManager.getWindow('settings');
                        if (settingsWin && settingsWin.isVisible()) {
                            this.windowManager.hideWindow('settings');
                        }

                        if (this.securityManager && this.securityManager.isEnabled() && !this.isAuthenticated) {
                            console.log('[Main] PIN required');
                            const mainWin = this.windowManager.getWindow('main');
                            if (mainWin && !mainWin.isDestroyed()) {
                                this.windowManager.setInteractive(true);
                                mainWin.webContents.send('request-pin-and-toggle');
                            }
                        } else {
                            // Track if chat was closed before this wake word
                            const wasVisible = this.windowManager.chatVisible;

                            // Check if wake word should toggle chat or just open it
                            if (this.appSettings.wakeWordToggleChat) {
                                // Toggle mode
                                this.windowManager.toggleChat();

                                // Only send wakeword-detected if chat became visible (was closed, now open)
                                if (this.windowManager.chatVisible && !wasVisible) {
                                    const chatWin = this.windowManager.getWindow('chat');
                                    if (chatWin && !chatWin.isDestroyed()) {
                                        // Send with flag indicating this opened a closed chat
                                        chatWin.webContents.send('wakeword-detected', { openedChat: true });
                                    }
                                }
                            } else {
                                // Default behavior: Ensure open
                                if (!wasVisible) {
                                    // Chat was closed, open it and start transcription
                                    this.windowManager.showWindow('chat');

                                    const chatWin = this.windowManager.getWindow('chat');
                                    if (chatWin && !chatWin.isDestroyed()) {
                                        // Send with flag indicating this opened a closed chat
                                        chatWin.webContents.send('wakeword-detected', { openedChat: true });
                                    }
                                } else {
                                    // Chat already visible, just focus - NO auto-transcription
                                    const chatWin = this.windowManager.getWindow('chat');
                                    if (chatWin && !chatWin.isDestroyed()) {
                                        chatWin.focus();
                                    }
                                    console.log('[Main] Chat already visible, not starting auto-transcription');
                                }
                            }
                        }
                        break;
                    case 'toggle-chat':
                        console.log('[Main] Toggle chat event received');
                        // Hide settings when toggling chat
                        this.windowManager.hideWindow('settings');

                        if (this.securityManager && this.securityManager.isEnabled() && !this.isAuthenticated) {
                            console.log('[Main] PIN required for toggle - requesting authentication');
                            const mainWin = this.windowManager.getWindow('main');
                            if (mainWin && !mainWin.isDestroyed()) {
                                this.windowManager.setInteractive(true);
                                mainWin.webContents.send('request-pin-and-toggle');
                            }
                        } else {
                            console.log('[Main] Toggle chat - proceed to windowManager.toggleChat()');
                            this.windowManager.toggleChat();
                        }
                        break;
                    case 'stop-action':
                        console.log('[Main] Stop action event received');
                        this.backendManager.stopTask();
                        break;
                    case 'stop-task':
                        console.log('[Main] Stop task event received');
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

            // Start Vosk Server
            await this.voskServerManager.start();

            // Log loaded settings
            console.log('[Main] Loaded app settings:', this.appSettings);

            // Wait for backend to be fully integrated before showing entry
            await this.backendManager.waitForReady();

            // Apply window visibility setting on startup
            this.updateWindowVisibility(this.appSettings.windowVisibility);

            // Check for cached user to bypass login
            const cachedUser = firebaseService.checkCachedUser();
            if (cachedUser) {
                console.log('[Main] Cached user found, auto-login:', cachedUser.id);
                this.isAuthenticated = true;
                this.currentUser = cachedUser;
                this.settingsManager.updateSettings({
                    userAuthenticated: true,
                    userDetails: cachedUser
                });

                // Sync rate counts with Firebase
                await firebaseService.syncRateCounts(cachedUser.id);

                // Refresh user data after sync
                const syncedUser = firebaseService.checkCachedUser();
                if (syncedUser) {
                    this.currentUser = syncedUser;
                }

                // Broadcast to all windows
                this.windowManager.broadcast('user-changed', this.currentUser);
                this.windowManager.broadcast('settings-updated', this.settingsManager.getSettings());

                this.windowManager.showWindow('main');
            } else {
                console.log('[Main] No cached user, showing login');
                this.isAuthenticated = false;
                this.windowManager.showWindow('main');
                this.windowManager.showWindow('entry');
            }

            // ENABLE EDGETTS ONLY IF voiceResponse IS ENABLED IN SETTINGS
            if (this.appSettings.voiceResponse) {
                console.log('[Main] Voice response enabled in settings, enabling EdgeTTS');
                this.edgeTTS.enable(true);
            } else {
                console.log('[Main] Voice response disabled in settings, EdgeTTS will remain disabled');
                this.edgeTTS.enable(false);
            }

            // Setup EdgeTTS event listeners for audio state tracking
            this.edgeTTS.on('speaking', () => {
                console.log('[Main] Audio started playing');
                const chatWin = this.windowManager.getWindow('chat');
                if (chatWin && !chatWin.isDestroyed()) {
                    chatWin.webContents.send('audio-started', {});
                }
            });

            this.edgeTTS.on('stopped', () => {
                console.log('[Main] Audio stopped');
                const chatWin = this.windowManager.getWindow('chat');
                if (chatWin && !chatWin.isDestroyed()) {
                    chatWin.webContents.send('audio-stopped', {});
                }
            });

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
                    const cleanText = this.cleanMarkdownForTTS(data.text);
                    console.log('[Main] Cleaned text to speak:', cleanText);
                    this.edgeTTS.speak(cleanText);
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

            ipcMain.handle('stop-audio', () => {
                console.log('[Main] [IPC] stop-audio requested');
                this.edgeTTS.stop();
                if (this.chatWindow && !this.chatWindow.isDestroyed()) {
                    this.chatWindow.webContents.send('audio-stopped', {});
                }
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

            this.isReady = true;
            console.log('[Main] Control initialized successfully');

            // Notify chat window that initialization is complete (for greeting)
            const chatWin = this.windowManager.getWindow('chat');
            if (chatWin && !chatWin.isDestroyed()) {
                // Small delay to ensure chat window is ready
                setTimeout(() => {
                    chatWin.webContents.send('app-initialized', {});
                }, 500);
            }

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
                    // Try to refresh from Firebase, but use cached data if it fails
                    try {
                        // Use verifyEntryID which works with 12-digit IDs
                        const result = await firebaseService.verifyEntryID(settings.userDetails.id);
                        if (result.success) {
                            return {
                                success: true,
                                isAuthenticated: true,
                                ...result.user
                            };
                        }
                    } catch (refreshError) {
                        console.log('[Main] Firebase refresh failed, using cached data');
                    }

                    // Return cached data if refresh failed
                    return {
                        success: true,
                        isAuthenticated: true,
                        ...settings.userDetails
                    };
                }

                return {
                    success: false,
                    isAuthenticated: false
                };
            } catch (error) {
                console.error('[Main] get-user-info error:', error);
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
                    this.settingsManager.updateSettings({
                        userAuthenticated: true,
                        userDetails: result.user
                    });

                    this.isAuthenticated = true;
                    this.currentUser = result.user;

                    // Broadcast user data to all windows
                    this.windowManager.broadcast('user-changed', result.user);
                    this.windowManager.broadcast('settings-updated', this.settingsManager.getSettings());

                    this.windowManager.showWindow('main');
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

        // Window dragging
        ipcMain.on('window-drag', (event, delta) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window && !window.isDestroyed()) {
                const bounds = window.getBounds();
                window.setPosition(bounds.x + delta.deltaX, bounds.y + delta.deltaY);
            }
        });

        // Window visibility
        ipcMain.handle('set-window-visibility', (event, visible) => {
            this.appSettings.windowVisibility = !!visible;
            this.updateWindowVisibility(visible);
            this.settingsManager.updateSettings({ windowVisibility: visible });
            return { success: true };
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

        // Logout handler
        ipcMain.handle('logout', async () => {
            console.log('[Main] Logout requested');
            // Clear authentication state
            this.isAuthenticated = false;
            this.currentUser = null;

            // Clear cache
            firebaseService.clearCachedUser();

            // Update settings
            this.settingsManager.updateSettings({
                userAuthenticated: false,
                userDetails: null
            });

            // Reset UI
            this.windowManager.closeWindow('chat');
            this.windowManager.closeWindow('settings');
            this.windowManager.showWindow('entry');

            return { success: true };
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
        ipcMain.handle('set-wakeword-enabled', (event, enabled) => {
            if (enabled) {
                // Only enable if globally enabled in settings
                if (this.appSettings.voiceActivation) {
                    this.wakewordManager.enable(true);
                }
            } else {
                this.wakewordManager.enable(false);
            }
            return true;
        });

        ipcMain.handle('set-auto-start', (event, enabled) => {
            console.log('[Main] Setting auto-start to:', enabled);
            app.setLoginItemSettings({
                openAtLogin: enabled,
                path: app.getPath('exe')
            });
            this.appSettings.openAtLogin = enabled;
            this.settingsManager.updateSettings({ openAtLogin: enabled });
            return { success: true };
        });

        ipcMain.handle('execute-task', async (event, task, mode) => {
            console.log('[Main] [IPC] execute-task:', mode, task);

            // 1. Check Authentication & Profile
            if (this.securityManager.isEnabled() && !this.isAuthenticated) {
                throw new Error('Authentication required');
            }

            const currentUser = this.currentUser || firebaseService.checkCachedUser();
            if (!currentUser) {
                throw new Error('User profile not loaded. Please sign in.');
            }

            // 2. Check Rate Limit
            const rateResult = await firebaseService.checkRateLimit(currentUser.id, mode);
            if (!rateResult.allowed) {
                throw new Error(rateResult.error || 'Rate limit exceeded');
            }

            // 3. Get API Key based on Plan
            let apiKey = await firebaseService.getGeminiKey(currentUser.plan);
            if (!apiKey) {
                console.log('Using default env API key');
                apiKey = process.env.GEMINI_API_KEY;
            }
            task.api_key = apiKey;

            try {
                const result = await this.backendManager.executeTask(task, mode);
                await firebaseService.incrementTaskCount(currentUser.id, mode);

                // Re-fetch and broadcast updated user data
                const updatedUser = await firebaseService.getUserById(currentUser.id);
                if (updatedUser.success) {
                    this.currentUser = updatedUser.user;
                    // Update cache
                    firebaseService.cacheUser(this.currentUser);
                    // Broadcast
                    this.settingsManager.updateSettings({ userDetails: this.currentUser });
                    this.windowManager.broadcast('user-data-updated', this.currentUser);
                }

                return result;
            } catch (error) {
                console.error('[Main] Execute task error:', error);
                throw error;
            }
        });

        ipcMain.handle('transcribe-audio', async (event, audioData, audioType) => {
            console.log('[Main] [IPC] transcribe-audio requested');
            return { success: false, message: 'Transcription now handled via WebSockets' };
        });

        ipcMain.handle('stop-task', () => {
            return this.backendManager.stopTask();
        });

        ipcMain.handle('stop-action', () => {
            console.log('[Main] Stop action requested');
            return this.backendManager.stopTask();
        });

        ipcMain.on('log-to-terminal', (event, message) => {
            console.log('[Terminal Log]', message);
        });

        // Greeting TTS handlers (moved from onAppReady to be available immediately)
        ipcMain.handle('should-speak-greeting', () => {
            const shouldSpeak = this.appSettings.greetingTTS || false;
            console.log('[Main] [IPC] should-speak-greeting requested. Setting:', shouldSpeak);
            return { shouldSpeak };
        });

        ipcMain.handle('speak-greeting', (event, text) => {
            console.log('[Main] [IPC] speak-greeting requested:', text);
            console.log('[Main] [IPC] greetingTTS setting:', this.appSettings.greetingTTS);
            console.log('[Main] [IPC] edgeTTS currently enabled:', this.edgeTTS.isEnabled());

            if (this.appSettings.greetingTTS && text) {
                console.log('[Main] [IPC] ✓ All conditions met - Speaking greeting via EdgeTTS');
                // Enable EdgeTTS for greeting (even if voiceResponse is disabled)
                if (!this.edgeTTS.isEnabled()) {
                    console.log('[Main] [IPC] Temporarily enabling EdgeTTS for greeting');
                    this.edgeTTS.enable(true);
                }
                this.edgeTTS.speak(text);
                console.log('[Main] [IPC] Greeting sent to EdgeTTS');
                return { success: true, message: 'Greeting spoken' };
            } else {
                console.log('[Main] [IPC] ✗ Cannot speak greeting:');
                console.log('    - greetingTTS enabled:', this.appSettings.greetingTTS);
                console.log('    - Text provided:', !!text);
                return { success: false, message: 'Greeting TTS disabled or no text provided' };
            }
        });



        // Settings
        ipcMain.handle('get-settings', () => {
            return this.getSettings();
        });

        ipcMain.handle('save-settings', (event, settings) => {
            return this.saveSettings(settings);
        });

        ipcMain.handle('update-floating-button', (event, visible) => {
            // Update settings
            this.appSettings.floatingButtonVisible = visible;
            this.saveSettings(this.appSettings);

            // Broadcast to overlay window
            const mainWin = this.windowManager.getWindow('main');
            if (mainWin && !mainWin.isDestroyed()) {
                mainWin.webContents.send('floating-button-toggle', visible);
            }

            return { success: true };
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
        // Include autoSendAfterWakeWord, lastMode, windowVisibility, and wakeWordToggleChat
        settings.autoSendAfterWakeWord = this.appSettings.autoSendAfterWakeWord || false;
        settings.lastMode = this.appSettings.lastMode || 'act';
        settings.windowVisibility = this.appSettings.windowVisibility !== undefined ? this.appSettings.windowVisibility : true;
        settings.wakeWordToggleChat = this.appSettings.wakeWordToggleChat || false;
        return settings;
    }

    updateWindowVisibility(visible) {
        this.appSettings.windowVisibility = visible;
        global.appSettings = this.appSettings;

        const chatWindow = this.windowManager.getWindow('chat');
        const settingsWindow = this.windowManager.getWindow('settings');

        if (chatWindow && !chatWindow.isDestroyed()) {
            chatWindow.setContentProtection(!visible);
            chatWindow.setVisibleOnAllWorkspaces(visible, { visibleOnFullScreen: true });
        }

        if (settingsWindow && !settingsWindow.isDestroyed()) {
            settingsWindow.setContentProtection(!visible);
            settingsWindow.setVisibleOnAllWorkspaces(visible, { visibleOnFullScreen: true });
        }
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
            if (settings.greetingTTS !== undefined) {
                this.appSettings.greetingTTS = !!settings.greetingTTS;
            }
            if (settings.autoSendAfterWakeWord !== undefined) {
                this.appSettings.autoSendAfterWakeWord = !!settings.autoSendAfterWakeWord;
            }
            if (settings.lastMode !== undefined) {
                this.appSettings.lastMode = settings.lastMode;
            }
            if (settings.windowVisibility !== undefined) {
                this.appSettings.windowVisibility = !!settings.windowVisibility;
                this.updateWindowVisibility(this.appSettings.windowVisibility);
            }
            if (settings.wakeWordToggleChat !== undefined) {
                this.appSettings.wakeWordToggleChat = !!settings.wakeWordToggleChat;
            }

            // Save all settings to persistent storage
            this.settingsManager.updateSettings({
                pinEnabled: settings.pinEnabled !== undefined ? settings.pinEnabled : this.appSettings.pinEnabled,
                voiceActivation: settings.voiceActivation !== undefined ? settings.voiceActivation : this.appSettings.voiceActivation,
                voiceResponse: settings.voiceResponse !== undefined ? settings.voiceResponse : this.appSettings.voiceResponse,
                muteNotifications: settings.muteNotifications !== undefined ? settings.muteNotifications : this.appSettings.muteNotifications,
                greetingTTS: settings.greetingTTS !== undefined ? settings.greetingTTS : this.appSettings.greetingTTS,
                autoSendAfterWakeWord: settings.autoSendAfterWakeWord !== undefined ? settings.autoSendAfterWakeWord : this.appSettings.autoSendAfterWakeWord,
                lastMode: settings.lastMode !== undefined ? settings.lastMode : this.appSettings.lastMode,
                windowVisibility: settings.windowVisibility !== undefined ? settings.windowVisibility : this.appSettings.windowVisibility,
                wakeWordToggleChat: settings.wakeWordToggleChat !== undefined ? settings.wakeWordToggleChat : this.appSettings.wakeWordToggleChat,
                userAuthenticated: settings.userAuthenticated !== undefined ? settings.userAuthenticated : this.appSettings.userAuthenticated,
                userDetails: settings.userDetails !== undefined ? settings.userDetails : this.appSettings.userDetails
            });

            // Broadcast update to chat window for immediate effect
            const chatWin = this.windowManager.getWindow('chat');
            if (chatWin && !chatWin.isDestroyed()) {
                chatWin.webContents.send('settings-updated', this.getSettings());
            }

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
        if (this.backendManager) this.backendManager.stopBackend();
        if (this.voskServerManager) this.voskServerManager.stop();
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

    cleanMarkdownForTTS(text) {
        if (!text) return '';
        return text
            .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
            .replace(/\*([^*\n]+)\*/g, '$1') // Italic
            .replace(/__([^_]+)__/g, '$1') // Bold/Italic
            .replace(/`([^`]+)`/g, '$1') // Inline code
            .replace(/```[\s\S]*?```/g, 'Code block skipped') // Code blocks (skip content or say "code")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links: [text](url) -> text
            .replace(/^#+\s+/gm, '') // Headers
            .replace(/^\s*[-*+]\s+/gm, '') // List bullets
            .replace(/[*_~`]/g, '') // Remaining markdown symbols
            .trim();
    }
}

// Create and start the application
new ComputerUseAgent();