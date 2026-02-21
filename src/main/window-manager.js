const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

app.disableHardwareAcceleration()

class WindowManager {
    constructor() {
        this.windows = new Map();
        this.mainWindow = null;
        this.chatVisible = false;
        this.isInteractive = false; // overlay click-through by default; enable on hover when needed
    }

    broadcast(channel, data) {
        this.windows.forEach(window => {
            if (window && !window.isDestroyed()) {
                window.webContents.send(channel, data);
            }
        });
    }

    async initializeWindows() {
        // Create main overlay window (transparent, always on top)
        await this.createMainWindow();

        // Create chat window (hidden by default)
        await this.createChatWindow();

        // Create settings window (hidden by default)
        await this.createSettingsWindow();

        // Create entry window
        await this.createEntryWindow();

        // Setup window management
        this.setupWindowManagement();
    }

    async createMainWindow() {
        const { width, height, x, y } = screen.getPrimaryDisplay().bounds;

        this.mainWindow = new BrowserWindow({
            width: width,
            height: height,
            x: x,
            y: y,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            closable: false,
            fullscreenable: false,
            visibleOnAllWorkspaces: true,
            hasShadow: false,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, '../preload/main-preload.js'),
                webSecurity: !isDev
            }
        });
        const windowVisibility = global.appSettings?.windowVisibility !== false;
        this.mainWindow.setContentProtection(!windowVisibility);
        this.mainWindow.setVisibleOnAllWorkspaces(windowVisibility, { visibleOnFullScreen: true });
        this.mainWindow.setAlwaysOnTop(true, 'screen-saver')
        // Make window click-through only when not interactive
        this.mainWindow.setIgnoreMouseEvents(!this.isInteractive, { forward: !this.isInteractive });

        await this.mainWindow.loadFile(
            path.join(__dirname, '../renderer/main-overlay.html')
        );

        this.windows.set('main', this.mainWindow);

        // Note: do not auto-show the main overlay here to avoid flicker during startup.
        // The main process will decide when to show windows after initialization.
    }

    async createChatWindow() {
        console.log('[WindowManager] Creating chat window...');
        const iconPath = path.join(__dirname, '../../assets/icons/icon.ico');
        const chatWindow = new BrowserWindow({
            width: 360,
            height: 480,
            x: screen.getPrimaryDisplay().workAreaSize.width - 380,
            y: screen.getPrimaryDisplay().workAreaSize.height - 520,
            frame: false,
            transparent: true,
            backgroundColor: '#00000000',
            alwaysOnTop: true,
            skipTaskbar: true,
            icon: iconPath,
            resizable: true,
            minWidth: 320,
            minHeight: 480,
            maxWidth: 600,
            maxHeight: 520,
            movable: true,
            minimizable: false,
            maximizable: false,
            closable: false,
            fullscreenable: false,
            roundedCorners: true,
            show: false,
            visible: false,
            hasShadow: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, '../preload/chat-preload.js'),
                webSecurity: !isDev
            }
        });

        const windowVisibility = global.appSettings?.windowVisibility !== false;
        chatWindow.setContentProtection(!windowVisibility);
        chatWindow.setVisibleOnAllWorkspaces(windowVisibility, { visibleOnFullScreen: true });
        chatWindow.setAlwaysOnTop(true, 'screen-saver')

        try {
            await chatWindow.loadFile(
                path.join(__dirname, '../renderer/chat-window.html')
            );
            console.log('[WindowManager] Chat window loaded successfully');
        } catch (err) {
            console.error('[WindowManager] Failed to load chat window:', err);
            throw err;
        }

        this.windows.set('chat', chatWindow);

        // Make chat window draggable
        this.setupDraggableWindow(chatWindow);

        // Add crash listeners for debugging
        chatWindow.webContents.on('render-process-gone', (event, details) => {
            console.error('[WindowManager] Chat window renderer process gone:', details.reason, details.exitCode);
        });

        chatWindow.on('unresponsive', () => {
            console.error('[WindowManager] Chat window became unresponsive');
        });

        // Forward console logs to terminal
        chatWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
            console.log(`[Chat Renderer ${level}] ${message} (${sourceId}:${line})`);
        });

        console.log('[WindowManager] Chat window created and registered');
    }

    async createSettingsWindow() {
        console.log('[WindowManager] Creating settings window...');
        const settingsWindow = new BrowserWindow({
            width: 450,
            height: 500,
            frame: false,
            transparent: true,
            roundedCorners: true,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: true,
            movable: true,
            minimizable: false,
            maximizable: false,
            closable: false,
            fullscreenable: false,
            show: false,
            visible: false,
            hasShadow: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, '../preload/settings-preload.js'),
                webSecurity: !isDev
            }
        });
        const windowVisibility = global.appSettings?.windowVisibility !== false;
        settingsWindow.setContentProtection(!windowVisibility);
        settingsWindow.setVisibleOnAllWorkspaces(windowVisibility, { visibleOnFullScreen: true });
        settingsWindow.setAlwaysOnTop(true, 'screen-saver')
        try {
            await settingsWindow.loadFile(
                path.join(__dirname, '../renderer/settings-modal.html')
            );
            console.log('[WindowManager] Settings window loaded successfully');
        } catch (err) {
            console.error('[WindowManager] Failed to load settings window:', err);
            throw err;
        }

        this.windows.set('settings', settingsWindow);

        // Make settings window draggable
        this.setupDraggableWindow(settingsWindow);

        // Close settings when it loses focus (click outside closes it).
        // Use a short debounce to avoid hiding during transient focus shifts (e.g., scrolling or touch interactions).
        settingsWindow.on('blur', () => {
            setTimeout(() => {
                try {
                    if (!settingsWindow.isDestroyed() && !settingsWindow.isFocused()) {
                        settingsWindow.hide();
                    }
                } catch (e) { }
            }, 150);
        });
        console.log('[WindowManager] Settings window created and registered');
    }

    async createEntryWindow() {
        const { width, height } = screen.getPrimaryDisplay().workAreaSize;

        const entryWindow = new BrowserWindow({
            width: 800,
            height: 600,
            x: (width - 800) / 2,
            y: (height - 600) / 2,
            frame: false,
            transparent: false,
            alwaysOnTop: false,
            skipTaskbar: false,
            resizable: true,
            movable: true,
            minimizable: true,
            maximizable: true,
            closable: true,
            fullscreenable: false,
            visible: false,
            hasShadow: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, '../preload/entry-preload.js'),
                webSecurity: !isDev
            }
        });

        await entryWindow.loadFile(
            path.join(__dirname, '../renderer/entry-window.html')
        );

        this.windows.set('entry', entryWindow);
        const windowVisibility = global.appSettings?.windowVisibility !== false;
        entryWindow.setContentProtection(!windowVisibility);
        entryWindow.setVisibleOnAllWorkspaces(windowVisibility, { visibleOnFullScreen: true });

        // Make entry window draggable via IPC
        this.setupDraggableWindow(entryWindow);
    }

    setupDraggableWindow(window) {
        // Redundant with main.js IPC listener but kept as hook for future window-specific drag logic
    }

    setupWindowManagement() {
        // Keep windows on screen and handle multiple displays
        screen.on('display-metrics-changed', () => {
            this.ensureWindowsOnScreen();
        });
    }

    ensureWindowsOnScreen() {
        const displays = screen.getAllDisplays();
        const primaryDisplay = screen.getPrimaryDisplay();

        this.windows.forEach((window, type) => {
            if (window && !window.isDestroyed() && window.isVisible()) {
                const bounds = window.getBounds();
                let onScreen = false;

                for (const display of displays) {
                    if (
                        bounds.x < display.bounds.x + display.bounds.width &&
                        bounds.x + bounds.width > display.bounds.x &&
                        bounds.y < display.bounds.y + display.bounds.height &&
                        bounds.y + bounds.height > display.bounds.y
                    ) {
                        onScreen = true;
                        break;
                    }
                }

                if (!onScreen) {
                    // Move window to primary display
                    window.setPosition(
                        primaryDisplay.workArea.x + 100,
                        primaryDisplay.workArea.y + 100
                    );
                }
            }
        });
    }

    showWindow(windowType) {
        const browserWindow = this.windows.get(windowType);
        console.log(`[WindowManager] showWindow('${windowType}'):`, { exists: !!browserWindow, destroyed: browserWindow?.isDestroyed?.() });
        if (browserWindow && !browserWindow.isDestroyed()) {
            if (windowType === 'chat') {
                this.chatVisible = true;
                // Only hide floating button if it's enabled in settings
                console.log('[WindowManager] showWindow(chat): hiding floating button if enabled');
                this.hideFloatingButtonIfEnabled();
            }
            if (windowType === 'settings') {
                // Make overlay click-through while settings is open so settings receives events
                this.setInteractive(false);
                // Only hide floating button if it's enabled in settings
                console.log('[WindowManager] showWindow(settings): hiding floating button if enabled');
                this.hideFloatingButtonIfEnabled();
            }
            console.log(`[WindowManager] showWindow: Showing and focusing ${windowType}. Current state: chatVisible=${this.chatVisible}`);
            browserWindow.show();
            browserWindow.focus();
            return true;
        }
        console.log(`[WindowManager] Window not found or destroyed for ${windowType}`);
        return false;
    }

    hideWindow(windowType) {
        const browserWindow = this.windows.get(windowType);
        if (browserWindow && !browserWindow.isDestroyed()) {
            if (windowType === 'chat') {
                this.chatVisible = false;
            }
            // Always restore overlay to non-interactive default after closing a window
            this.setInteractive(false);
            // Only show floating button if it's enabled in settings
            this.showFloatingButtonIfEnabled();

            browserWindow.hide();
            console.log(`[WindowManager] hideWindow: Hiding ${windowType}. Current state: chatVisible=${this.chatVisible}`);
            return true;
        }
        return false;
    }

    toggleChat() {
        console.log(`[WindowManager] toggleChat: Current chatVisible=${this.chatVisible}`);
        if (this.chatVisible) {
            console.log('[WindowManager] toggleChat: Hiding chat');
            this.hideWindow('chat');
            return { visible: false };
        } else {
            console.log('[WindowManager] toggleChat: Showing chat');
            this.showWindow('chat');
            return { visible: true };
        }
    }

    closeWindow(windowType) {
        const window = this.windows.get(windowType);
        if (window && !window.isDestroyed()) {
            window.close();
            this.windows.delete(windowType);
            return true;
        }
        return false;
    }

    hideFloatingButton() {
        const mainWindow = this.windows.get('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('hide-floating-button');
        }
    }

    showFloatingButton() {
        const mainWindow = this.windows.get('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('show-floating-button');
        }
    }

    // Hide floating button only if it's enabled in settings (respects user toggle)
    hideFloatingButtonIfEnabled() {
        const mainWindow = this.windows.get('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('hide-floating-button-if-enabled');
        }
    }

    // Show floating button only if it's enabled in settings (respects user toggle)
    showFloatingButtonIfEnabled() {
        const mainWindow = this.windows.get('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            const enabled = global.appSettings?.floatingButtonVisible !== false;
            console.log(`[WindowManager] showFloatingButtonIfEnabled - floatingButtonVisible=${enabled}`);
            if (enabled) {
                // Send a direct show request - overlay will still respect its own settings guard
                mainWindow.webContents.send('show-floating-button');
            } else {
                console.log('[WindowManager] Skipping showFloatingButtonIfEnabled: floating button disabled in settings');
            }
        }
    }

    setInteractive(interactive) {
        this.isInteractive = interactive;
        const mainWindow = this.windows.get('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            // Toggle click-through behavior
            mainWindow.setIgnoreMouseEvents(!interactive, { forward: !interactive });

            // Notify renderer about interaction mode
            mainWindow.webContents.send('interaction-mode-changed', { interactive });
        }
    }

    setOverlayInteractive(interactive) {
        this.setInteractive(interactive);
    }

    showVisualEffect(effectType) {
        const enabled = global.appSettings?.edgeGlowEnabled !== false;
        console.log('[WindowManager] showVisualEffect called:', effectType, 'edgeGlowEnabled=', enabled);
        if (!enabled) {
            console.log('[WindowManager] Skipping showVisualEffect because edge glow disabled in settings');
            console.trace('[WindowManager] showVisualEffect called when disabled - trace');
            return;
        }
        console.trace('[WindowManager] showVisualEffect proceeding - trace');
        const mainWindow = this.windows.get('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('show-visual-effect', { type: effectType });
        }
    }

    closeAllWindows() {
        this.windows.forEach((window, type) => {
            if (window && !window.isDestroyed()) {
                window.removeAllListeners();
                window.destroy();
            }
        });
        this.windows.clear();
    }

    getWindow(windowType) {
        return this.windows.get(windowType);
    }

    getAllWindows() {
        return Array.from(this.windows.values());
    }
}

module.exports = WindowManager;
