const fs = require('fs-extra');
const path = require('path');

class StorageManager {
    constructor() {
        this.initialized = false;
    }

    _init() {
        if (this.initialized) return;
        const { app } = require('electron');
        this.userDataDir = app.getPath('userData');
        this.preferencesFile = path.join(this.userDataDir, 'userPreferences.json');
        this.librariesFile = path.join(this.userDataDir, 'installedLibraries.json');

        this._initFiles();
        this.initialized = true;
    }

    _initFiles() {
        if (!fs.existsSync(this.preferencesFile)) {
            const defaultPrefs = {
                defaultAppPreference: {
                    music: 'Spotify',
                    browser: 'Chrome',
                    editor: 'VS Code'
                },
                fileLocations: {
                    downloads: path.join(require('os').homedir(), 'Downloads'),
                    documents: path.join(require('os').homedir(), 'Documents')
                },
                proceedWithoutConfirmation: false
            };
            fs.writeJsonSync(this.preferencesFile, defaultPrefs, { spaces: 2 });
        }

        if (!fs.existsSync(this.librariesFile)) {
            const defaultLibraries = {
                python: [],
                node: []
            };
            fs.writeJsonSync(this.librariesFile, defaultLibraries, { spaces: 2 });
        }
    }

    readPreferences() {
        this._init();
        try {
            return fs.readJsonSync(this.preferencesFile);
        } catch (err) {
            console.error('Error reading preferences:', err);
            return {};
        }
    }

    writePreferences(prefs) {
        this._init();
        try {
            const current = this.readPreferences();
            const updated = { ...current, ...prefs };
            fs.writeJsonSync(this.preferencesFile, updated, { spaces: 2 });
            return true;
        } catch (err) {
            console.error('Error writing preferences:', err);
            return false;
        }
    }

    readLibraries() {
        this._init();
        try {
            return fs.readJsonSync(this.librariesFile);
        } catch (err) {
            console.error('Error reading libraries:', err);
            return { python: [], node: [] };
        }
    }

    writeLibraries(libraries) {
        this._init();
        try {
            fs.writeJsonSync(this.librariesFile, libraries, { spaces: 2 });
            return true;
        } catch (err) {
            console.error('Error writing libraries:', err);
            return false;
        }
    }

    addLibrary(type, name, version = 'latest') {
        const libs = this.readLibraries();
        if (!libs[type]) libs[type] = [];

        const existing = libs[type].find(l => l.name === name);
        if (existing) {
            existing.version = version;
            existing.installedAt = new Date().toISOString();
        } else {
            libs[type].push({
                name,
                version,
                installedAt: new Date().toISOString()
            });
        }
        return this.writeLibraries(libs);
    }
}

module.exports = new StorageManager();
