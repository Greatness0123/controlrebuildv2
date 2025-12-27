const {app,BrowserWindow, screen } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { initializeAppapp } = require('firebase-admin');

app.disableHardwareAcceleration()

class WindowManager {
    constructor() {
        this.windows = new Map();
        this.mainWindow = null;
        this.chatVisible = false;
        this.isInteractive = false; // overlay click-through by default; enable on hover when needed
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
        const { width, height } = screen.getPrimaryDisplay().workAreaSize;
        
        this.mainWindow = new BrowserWindow({
            width: width,
            height: height,
            x: 0,
            y: 0,
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
         this.mainWindow.setContentProtection(true);
        this.mainWindow.setAlwaysOnTop(true,'screen-saver')
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
        const chatWindow = new BrowserWindow({
            width: 360,
            height: 480,
            x: screen.getPrimaryDisplay().workAreaSize.width - 380,
            y: screen.getPrimaryDisplay().workAreaSize.height - 520,
            frame: false,
            transparent: true,
            backgroundColor:'#00000000',
            alwaysOnTop: true,
            skipTaskbar: true,
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
        
        chatWindow.setContentProtection(true);
        chatWindow.setAlwaysOnTop(true,'screen-saver')

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
        console.log('[WindowManager] Chat window created and registered');
    }

    async createSettingsWindow() {
        console.log('[WindowManager] Creating settings window...');
        const settingsWindow = new BrowserWindow({
            width: 350,
            height: 500,
            frame: false,
            transparent: true,
            roundedCorners:true,
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
            settingsWindow.setContentProtection(true);
            settingsWindow.setAlwaysOnTop(true,'screen-saver')
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

        // Close settings when it loses focus (click outside closes it).
        // Use a short debounce to avoid hiding during transient focus shifts (e.g., scrolling or touch interactions).
        settingsWindow.on('blur', () => {
            setTimeout(() => {
                try {
                    if (!settingsWindow.isDestroyed() && !settingsWindow.isFocused()) {
                        settingsWindow.hide();
                    }
                } catch (e) {}
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

        // Make entry window draggable
        this.setupDraggableWindow(entryWindow);
    }

    setupDraggableWindow(window) {
        let isDragging = false;
        let currentX;
        let currentY;
        let startX;
        let startY;

        window.webContents.on('before-input-event', (event, input) => {
            if (input.type === 'mouseDown' && input.button === 'left') {
                const bounds = window.getBounds();
                isDragging = true;
                currentX = bounds.x;
                currentY = bounds.y;
                startX = input.x;
                startY = input.y;
            } else if (input.type === 'mouseUp' && input.button === 'left') {
                isDragging = false;
            } else if (input.type === 'mouseMove' && isDragging) {
                const newX = currentX + (input.x - startX);
                const newY = currentY + (input.y - startY);
                window.setPosition(newX, newY);
            }
        });
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
                this.hideFloatingButton();
            }
            if (windowType === 'settings') {
                // Make overlay click-through while settings is open so settings receives events
                this.setInteractive(false);
                this.hideFloatingButton();
            }
            console.log(`[WindowManager] Calling show() and focus() for ${windowType}`);
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
            this.showFloatingButton();
            
            browserWindow.hide();
            return true;
        }
        return false;
    }

    toggleChat() {
        if (this.chatVisible) {
            this.hideWindow('chat');
            return { visible: false };
        } else {
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
