const fs = require('fs-extra');
const path = require('path');
const os = require('os');

/**
 * SettingsManager handles persistent application settings
 * Stores settings in a JSON file in the user's app data directory
 */
class SettingsManager {
    constructor() {
        // Use app data directory for settings storage
        const appDataDir = process.env.APPDATA ||
            path.join(os.homedir(), 'AppData', 'Roaming');

        this.settingsDir = path.join(appDataDir, 'ComputerUseAgent');
        this.settingsFile = path.join(this.settingsDir, 'settings.json');

        // Ensure settings directory exists
        fs.ensureDirSync(this.settingsDir);

        // Load settings from file or initialize defaults
        this.settings = this._loadSettings();
    }

    /**
     * Load settings from JSON file or create defaults
     * @private
     */
    _loadSettings() {
        try {
            if (fs.existsSync(this.settingsFile)) {
                const data = fs.readFileSync(this.settingsFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (err) {
            console.warn('Failed to load settings file, using defaults:', err.message);
        }

        // Return default settings
        return {
            pinEnabled: false,
            voiceActivation: true,
            voiceResponse: true,
            muteNotifications: false,
            greetingTTS: false,
            autoSendAfterWakeWord: false,
            lastMode: 'act',
            windowVisibility: true,
            userAuthenticated: false,
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
            fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2), 'utf8');
            console.log('Settings saved to:', this.settingsFile);
            return true;
        } catch (err) {
            console.error('Failed to save settings file:', err.message);
            return false;
        }
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
        this.settings = {
            pinEnabled: false,
            voiceActivation: false,
            voiceResponse: false,
            muteNotifications: false,
            greetingTTS: false,
            userAuthenticated: false,
            userDetails: null
        };
        return this._saveToFile();
    }

    /**
     * Get settings file path (for debugging)
     */
    getSettingsPath() {
        return this.settingsFile;
    }
}

module.exports = SettingsManager;
