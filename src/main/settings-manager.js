const fs = require('fs-extra');
const path = require('path');
const os = require('os');

/**
 * SettingsManager handles persistent application settings
 * Stores settings in a JSON file in the user's app data directory
 * Supports per-user settings with user-specific settings files
 */
class SettingsManager {
    constructor() {
        const { app } = require('electron');
        // Use Electron's official userData directory for settings storage
        this.settingsDir = app.getPath('userData');
        this.globalSettingsFile = path.join(this.settingsDir, 'settings.json');
        this.currentUserId = null;

        // Ensure settings directory exists
        fs.ensureDirSync(this.settingsDir);

        // Load global settings first (includes auth state)
        this.settings = this._loadSettings();

        // If there's a cached user, load their specific settings
        if (this.settings.userDetails && this.settings.userDetails.id) {
            this.switchUser(this.settings.userDetails.id);
        }
    }

    /**
     * Get the settings file path for a specific user
     * @private
     */
    _getUserSettingsFile(userId) {
        return path.join(this.settingsDir, `settings_${userId}.json`);
    }

    /**
     * Load settings from JSON file or create defaults
     * @private
     */
    _loadSettings(userId = null) {
        const settingsFile = userId ? this._getUserSettingsFile(userId) : this.globalSettingsFile;

        try {
            if (fs.existsSync(settingsFile)) {
                const data = fs.readFileSync(settingsFile, 'utf8');
                const loaded = JSON.parse(data);
                console.log(`Settings loaded from: ${settingsFile}`);
                return { ...this._getDefaults(), ...loaded };
            }
        } catch (err) {
            console.warn('Failed to load settings file, using defaults:', err.message);
        }

        return this._getDefaults();
    }

    /**
     * Get default settings
     * @private
     */
    _getDefaults() {
        return {
            pinEnabled: false,
            voiceActivation: true,
            voiceResponse: true,
            muteNotifications: false,
            greetingTTS: false,
            autoSendAfterWakeWord: false,
            proceedWithoutConfirmation: false,
            lastMode: 'act',
            windowVisibility: false,  // Default: hide window during actions
            openAtLogin: false,
            wakeWordToggleChat: false,
            floatingButtonVisible: true,
            edgeGlowEnabled: true,    // New: control purple edge glow during Act mode
            borderStreakEnabled: true, // New: control purple border streak on windows
            theme: 'light',           // New: light or dark theme
            modelProvider: 'gemini',
            openrouterModel: 'anthropic/claude-3.5-sonnet',
            openrouterCustomModel: '',
            openrouterApiKey: '',
            ollamaEnabled: false,
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'llama3',
            userAuthenticated: false,
            hotkeys: {
                toggleChat: process.platform === 'darwin' ? 'Command+.' : 'CommandOrControl+Space',
                stopAction: 'Alt+Z'
            },
            userDetails: null
        };
    }

    /**
     * Save settings to JSON file
     * @private
     */
    _saveToFile() {
        try {
            fs.ensureDirSync(this.settingsDir);

            // Always save global settings (contains auth state)
            fs.writeFileSync(this.globalSettingsFile, JSON.stringify(this.settings, null, 2), 'utf8');
            console.log('Global settings saved to:', this.globalSettingsFile);

            // Also save user-specific settings if a user is logged in
            if (this.currentUserId) {
                const userSettingsFile = this._getUserSettingsFile(this.currentUserId);
                // Save user preferences (excluding global auth state)
                const userSettings = { ...this.settings };
                delete userSettings.userAuthenticated; // Auth state stays global
                delete userSettings.userDetails; // User details stay global
                fs.writeFileSync(userSettingsFile, JSON.stringify(userSettings, null, 2), 'utf8');
                console.log('User settings saved to:', userSettingsFile);
            }

            return true;
        } catch (err) {
            console.error('Failed to save settings file:', err.message);
            return false;
        }
    }

    /**
     * Switch to a different user's settings
     */
    switchUser(userId) {
        if (!userId) {
            console.log('No user ID provided, using global settings');
            this.currentUserId = null;
            return;
        }

        console.log(`Switching to user settings for: ${userId}`);
        this.currentUserId = userId;

        // Load user-specific settings and merge with current
        const userSettings = this._loadSettings(userId);

        // Preserve auth state from current settings
        const authState = {
            userAuthenticated: this.settings.userAuthenticated,
            userDetails: this.settings.userDetails
        };

        // Merge user settings with auth state
        this.settings = {
            ...this._getDefaults(),
            ...userSettings,
            ...authState
        };

        console.log('User settings loaded and merged');
    }

    /**
     * Get all settings
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Get a specific setting by key
     */
    getSetting(key) {
        return this.settings[key];
    }

    /**
     * Update settings and save to file
     */
    updateSettings(updates) {
        try {
            // Check if we're updating user details (login)
            if (updates.userDetails && updates.userDetails.id &&
                updates.userDetails.id !== this.currentUserId) {
                // New user logged in, switch to their settings first
                this.switchUser(updates.userDetails.id);
            }

            // Merge updates with existing settings
            this.settings = {
                ...this.settings,
                ...updates
            };

            // Save to file
            this._saveToFile();
            return true;
        } catch (err) {
            console.error('Failed to update settings:', err.message);
            return false;
        }
    }

    /**
     * Reset settings to defaults
     */
    resetSettings() {
        this.currentUserId = null;
        this.settings = this._getDefaults();
        return this._saveToFile();
    }

    /**
     * Get settings file path (for debugging)
     */
    getSettingsPath() {
        return this.currentUserId
            ? this._getUserSettingsFile(this.currentUserId)
            : this.globalSettingsFile;
    }
}

module.exports = SettingsManager;
