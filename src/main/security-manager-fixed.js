const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SecurityManager {
    constructor() {
        const { app } = require('electron');
        // Use userData path for configuration to avoid permission issues in production
        const userDataPath = app.getPath('userData');
        this.configPath = path.join(userDataPath, 'security.json');

        this.isLocked = false;
        this.pinEnabled = false;
        this.pinHash = null;
        this.failedAttempts = 0;
        this.lockoutUntil = null; // timestamp in ms
        this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                this.pinEnabled = config.pinEnabled || false;
                this.pinHash = config.pinHash || null;
                this.failedAttempts = config.failedAttempts || 0;
                this.lockoutUntil = config.lockoutUntil || null;
            }
        } catch (error) {
            console.error('Failed to load security config:', error);
        }
    }

    saveConfig() {
        try {
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            const config = {
                pinEnabled: this.pinEnabled,
                pinHash: this.pinHash,
                lastUpdated: new Date().toISOString(),
                failedAttempts: this.failedAttempts,
                lockoutUntil: this.lockoutUntil
            };

            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            return true;
        } catch (error) {
            console.error('Failed to save security config:', error);
            return false;
        }
    }

    hashPin(pin) {
        return crypto.createHash('sha256').update(pin).digest('hex');
    }

    async setPin(pin) {
        if (!pin || pin.length !== 4) {
            return { success: false, message: 'PIN must be exactly 4 digits' };
        }

        if (!/^\d{4}$/.test(pin)) {
            return { success: false, message: 'PIN must contain only numbers' };
        }

        this.pinHash = this.hashPin(pin);
        this.pinEnabled = true;

        const success = this.saveConfig();
        if (!success) {
            return { success: false, message: 'Failed to save PIN' };
        }

        return { success: true };
    }

    async enablePin(enabled) {
        this.pinEnabled = !!enabled;
        const success = this.saveConfig();
        return { success: !!success };
    }

    isEnabled() {
        return this.pinEnabled && this.pinHash !== null;
    }

    // verifyPin now implements a simple rate-limit/lockout policy
    verifyPin(pin) {
        const now = Date.now();
        pin = String(pin || '').trim();
        // If lockout has expired, clear it
        if (this.lockoutUntil && now >= this.lockoutUntil) {
            this.lockoutUntil = null;
            this.failedAttempts = 0;
            this.saveConfig();
        }

        if (this.lockoutUntil && now < this.lockoutUntil) {
            const remaining = Math.max(0, Math.ceil((this.lockoutUntil - now) / 1000));
            return { valid: false, message: `Too many attempts. Try again in ${remaining}s.` };
        }

        if (!this.isEnabled()) {
            return { valid: true, message: 'PIN not enabled' };
        }

        if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            this._recordFailedAttempt();
            console.debug('SecurityManager: invalid pin format attempt');
            return { valid: false, message: 'Invalid PIN format' };
        }

        const inputHash = this.hashPin(pin);
        const isValid = inputHash === this.pinHash;
        console.debug('SecurityManager: verify attempt', { inputHash, storedHash: this.pinHash, isValid });

        if (!isValid) {
            this._recordFailedAttempt();
            return { valid: false, message: 'Incorrect PIN' };
        }

        // successful verification: reset counters
        this.failedAttempts = 0;
        this.lockoutUntil = null;
        this.saveConfig();

        return { valid: true, message: 'PIN verified' };
    }

    _recordFailedAttempt() {
        this.failedAttempts = (this.failedAttempts || 0) + 1;
        // after 5 failed attempts, lock for 1 minute
        if (this.failedAttempts >= 5) {
            this.lockoutUntil = Date.now() + 60 * 1000; // 1 minute
            this.failedAttempts = 0; // reset counter after locking
        }
        this.saveConfig();
    }

    async lockApp() {
        this.isLocked = true;
        return { success: true, locked: true };
    }

    async unlockApp(pin) {
        const verification = this.verifyPin(pin);
        if (verification.valid) {
            this.isLocked = false;
            return { success: true, unlocked: true };
        }
        return { success: false, unlocked: false, message: verification.message };
    }

    isAppLocked() {
        return this.isLocked && this.isEnabled();
    }

    requirePin() {
        return this.isLocked && this.isEnabled();
    }

    // Generate a random temporary PIN for testing
    generateTempPin() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    // Check if PIN is set
    hasPin() {
        return this.pinHash !== null;
    }

    // Change PIN (requires current PIN for security)
    async changePin(currentPin, newPin) {
        // First verify current PIN
        const verification = this.verifyPin(currentPin);
        if (!verification.valid) {
            return { success: false, message: 'Current PIN is incorrect' };
        }

        // Set new PIN
        const res = await this.setPin(newPin);
        return { success: res.success, message: res.message || 'PIN changed' };
    }

    // Reset PIN (emergency reset - removes PIN entirely)
    async resetPin() {
        this.pinHash = null;
        this.pinEnabled = false;
        this.isLocked = false;
        this.failedAttempts = 0;
        this.lockoutUntil = null;

        const success = this.saveConfig();
        if (!success) {
            return { success: false, message: 'Failed to reset PIN' };
        }

        return { success: true, message: 'PIN reset successfully' };
    }

    // Get security status
    getSecurityStatus() {
        return {
            pinEnabled: this.pinEnabled,
            hasPin: this.hasPin(),
            isLocked: this.isLocked,
            requirePin: this.requirePin(),
            failedAttempts: this.failedAttempts,
            lockoutUntil: this.lockoutUntil
        };
    }
}

module.exports = SecurityManager;
