const { globalShortcut, app } = require('electron');

class HotkeyManager {
    constructor() {
        this.shortcuts = new Map();
        this.isEnabled = true;
    }

    setupHotkeys() {
        // Toggle chat window (Ctrl+Space)
        this.registerShortcut('CommandOrControl+Space', 'toggle-chat', () => {
            console.log('Toggle chat hotkey triggered');
            this.emitToMain('toggle-chat');
        });

        // Stop AI action execution (Alt+Z) - NOT the backend
        this.registerShortcut('Alt+Z', 'stop-action', () => {
            console.log('Stop AI action hotkey triggered');
            this.emitToMain('stop-action');
        });

        console.log('Global hotkeys registered successfully');
    }

    registerShortcut(accelerator, id, handler) {
        const success = globalShortcut.register(accelerator, handler);

        if (success) {
            this.shortcuts.set(id, { accelerator, handler });
            console.log(`Registered hotkey: ${accelerator} for ${id}`);
        } else {
            console.error(`Failed to register hotkey: ${accelerator} for ${id}`);
        }

        return success;
    }

    unregisterShortcut(id) {
        const shortcut = this.shortcuts.get(id);
        if (shortcut) {
            globalShortcut.unregister(shortcut.accelerator);
            this.shortcuts.delete(id);
            console.log(`Unregistered hotkey: ${shortcut.accelerator} for ${id}`);
            return true;
        }
        return false;
    }

    unregisterAll() {
        globalShortcut.unregisterAll();
        this.shortcuts.clear();
        console.log('All global hotkeys unregistered');
    }

    enable() {
        this.isEnabled = true;
        // Re-register all shortcuts
        this.setupHotkeys();
    }

    disable() {
        this.isEnabled = false;
        this.unregisterAll();
    }

    emitToMain(event, data = {}) {
        // Send to main process
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send('hotkey-triggered', { event, data });
        }

        // Also emit to the main process if available
        if (process.emit) {
            process.emit('hotkey-triggered', { event, data });
        }
    }

    getRegisteredShortcuts() {
        return Array.from(this.shortcuts.keys());
    }

    isShortcutRegistered(accelerator) {
        return globalShortcut.isRegistered(accelerator);
    }
}

module.exports = HotkeyManager;