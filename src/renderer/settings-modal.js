class SettingsModal {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.settings = {
            pinEnabled: false,
            voiceActivation: false,
            voiceResponse: false,
            muteNotifications: false,
            autoSendAfterWakeWord: false
        };
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupIPCListeners();
        await this.loadUserStatus();
        await this.loadSettings();
        this.updateUI();
        this.initializeLucideIcons();
        
        // Ensure static PIN modal is hidden at startup
        const staticPin = document.getElementById('pinModal');
        if (staticPin) staticPin.classList.remove('show');
        
        // Close PIN modal if clicking outside content
        if (staticPin) {
            staticPin.addEventListener('click', (e) => {
                if (e.target === staticPin) staticPin.classList.remove('show');
            });
        }
    }

    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setupEventListeners() {
        // Toggle switches
        document.getElementById('pinToggle')?.addEventListener('click', () => {
            this.togglePin();
        });

        document.getElementById('voiceToggle')?.addEventListener('click', () => {
            this.toggleVoiceActivation();
        });

        document.getElementById('autoSendToggle')?.addEventListener('click', () => {
            this.toggleAutoSend();
        });

        document.getElementById('voiceResponseToggle')?.addEventListener('click', () => {
            this.toggleVoiceResponse();
        });

        document.getElementById('muteToggle')?.addEventListener('click', () => {
            this.toggleMuteNotifications();
        });

        // Buttons
        document.getElementById('changePinButton')?.addEventListener('click', () => {
            this.showChangePinModal();
        });

        document.getElementById('lockButton')?.addEventListener('click', () => {
            this.lockApp();
        });

        document.getElementById('logoutButton')?.addEventListener('click', () => {
            this.logout();
        });

        document.getElementById('quitButton')?.addEventListener('click', () => {
            this.quitApp();
        });

        // Close button
        document.getElementById('closeButton')?.addEventListener('click', () => {
            this.closeSettings();
        });

        // Static PIN modal buttons (fallback)
        document.getElementById('pinCancelButton')?.addEventListener('click', () => {
            const pm = document.getElementById('pinModal');
            pm && pm.classList.remove('show');
        });

        document.getElementById('pinConfirmButton')?.addEventListener('click', async () => {
            const input = document.getElementById('pinInput');
            const pin = input ? input.value : '';
            if (!pin || pin.length !== 4 || !/^[0-9]{4}$/.test(pin)) {
                this.showToast('PIN must be 4 digits', 'error');
                return;
            }

            try {
                if (window.settingsAPI) {
                    const res = await window.settingsAPI.setSecurityPin(pin);
                    if (res && res.success) {
                        await window.settingsAPI.enableSecurityPin(true);
                        this.showToast('PIN set successfully', 'success');
                        const pm = document.getElementById('pinModal');
                        pm && pm.classList.remove('show');
                        await this.loadSettings();
                        this.updateUI();
                    } else {
                        this.showToast(res && res.message ? res.message : 'Failed to set PIN', 'error');
                    }
                }
            } catch (e) {
                console.error('Failed to set PIN:', e);
                this.showToast('Failed to set PIN', 'error');
            }
        });
    }

    setupIPCListeners() {
        if (window.settingsAPI) {
            // Listen for settings updates
            window.settingsAPI.onSettingsUpdated?.((event, settings) => {
                this.settings = { ...this.settings, ...settings };
                this.updateUI();
            });

            // Listen for user authentication changes
            window.settingsAPI.onUserChanged?.((event, user) => {
                this.currentUser = user;
                this.isAuthenticated = !!user;
                this.updateUI();
            });
        }
    }

    async loadUserStatus() {
        try {
            if (window.settingsAPI) {
                this.currentUser = await window.settingsAPI.getCurrentUser();
                console.log('Loaded user status:', this.currentUser);
                this.isAuthenticated = !!(this.currentUser && this.currentUser.id);
            } else {
                // Fallback for standalone testing
                const stored = sessionStorage.getItem('currentUser');
                if (stored) {
                    this.currentUser = JSON.parse(stored);
                    this.isAuthenticated = true;
                }
            }
        } catch (error) {
            console.error('Failed to load user status:', error);
            this.isAuthenticated = false;
        }
    }

    async loadSettings() {
        try {
            if (window.settingsAPI) {
                const savedSettings = await window.settingsAPI.getSettings();
                this.settings = { ...this.settings, ...savedSettings };
            } else {
                // Fallback to sessionStorage
                const stored = sessionStorage.getItem('appSettings');
                if (stored) {
                    this.settings = { ...this.settings, ...JSON.parse(stored) };
                }
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings() {
        try {
            if (window.settingsAPI) {
                await window.settingsAPI.saveSettings(this.settings);
            } else {
                // Fallback to sessionStorage
                sessionStorage.setItem('appSettings', JSON.stringify(this.settings));
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showToast('Failed to save settings', 'error');
        }
    }

    updateUI() {
        // Update user info
        this.updateUserInfo();
        
        // Update toggle states
        this.updateToggleStates();
        
        // Update button states
        this.updateButtonStates();
        
        // Re-initialize Lucide icons after UI updates
        setTimeout(() => {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }, 10);
    }

    updateUserInfo() {
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');
        const planBadge = document.querySelector('.plan-badge');

        if (this.isAuthenticated && this.currentUser) {
            // User is authenticated - show real data
            if (userAvatar && this.currentUser.name) {
                const initials = this.currentUser.name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase();
                userAvatar.innerHTML = `<span style="font-size: 20px; font-weight: 600;">${initials}</span>`;
            }

            if (userName) {
                userName.textContent = this.currentUser.name || 'Control User';
            }

            if (userEmail) {
                userEmail.textContent = this.currentUser.email || 'user@control.ai';
            }

            if (planBadge && this.currentUser.plan) {
                planBadge.textContent = this.currentUser.plan.toUpperCase();
            }

            console.log('Updated UI with user data:', this.currentUser);

            // Enable settings that require authentication
            this.setAuthenticatedState(true);
        } else {
            // User is not authenticated - show placeholder
            if (userAvatar) {
                userAvatar.innerHTML = '<i data-lucide="user" style="width: 24px; height: 24px;"></i>';
            }

            if (userName) {
                userName.textContent = 'Control User';
            }

            if (userEmail) {
                userEmail.textContent = 'user@control.ai';
            }

            if (planBadge) {
                planBadge.textContent = 'PRO PLAN';
            }

            // Disable authenticated features
            this.setAuthenticatedState(false);
        }
    }

    setAuthenticatedState(authenticated) {
        const authenticatedElements = document.querySelectorAll('.requires-auth');
        const unauthenticatedMessage = document.querySelector('.unauthenticated-message');

        authenticatedElements.forEach(element => {
            element.disabled = !authenticated;
            element.style.opacity = authenticated ? '1' : '0.5';
        });

        if (unauthenticatedMessage) {
            unauthenticatedMessage.style.display = authenticated ? 'none' : 'block';
        }
    }

    updateToggleStates() {
        // Update PIN toggle
        const pinToggle = document.getElementById('pinToggle');
        if (pinToggle) {
            if (this.settings.pinEnabled) {
                pinToggle.classList.add('active');
            } else {
                pinToggle.classList.remove('active');
            }
        }

        // Update voice activation toggle
        const voiceToggle = document.getElementById('voiceToggle');
        if (voiceToggle) {
            if (this.settings.voiceActivation) {
                voiceToggle.classList.add('active');
            } else {
                voiceToggle.classList.remove('active');
            }
        }

        // Update auto-send toggle
        const autoSendToggle = document.getElementById('autoSendToggle');
        if (autoSendToggle) {
            if (this.settings.autoSendAfterWakeWord) {
                autoSendToggle.classList.add('active');
            } else {
                autoSendToggle.classList.remove('active');
            }
        }

        // Update voice response toggle
        const voiceResponseToggle = document.getElementById('voiceResponseToggle');
        if (voiceResponseToggle) {
            if (this.settings.voiceResponse) {
                voiceResponseToggle.classList.add('active');
            } else {
                voiceResponseToggle.classList.remove('active');
            }
        }

        // Update mute toggle
        const muteToggle = document.getElementById('muteToggle');
        if (muteToggle) {
            if (this.settings.muteNotifications) {
                muteToggle.classList.add('active');
            } else {
                muteToggle.classList.remove('active');
            }
        }
    }

    updateButtonStates() {
        // Update button states based on authentication
        const buttons = document.querySelectorAll('.requires-auth');
        buttons.forEach(button => {
            button.disabled = !this.isAuthenticated;
        });
    }

    async togglePin() {
        // Allow local PIN enable even if not authenticated
        this.settings.pinEnabled = !this.settings.pinEnabled;
        this.updateToggleStates();
        
        try {
            if (window.settingsAPI) {
                const res = await window.settingsAPI.enableSecurityPin(this.settings.pinEnabled);
                if (!res || !res.success) {
                    throw new Error(res && res.message ? res.message : 'Failed to update PIN setting');
                }
            }
            await this.saveSettings();
            
            if (this.settings.pinEnabled) {
                this.showToast('PIN protection enabled', 'success');
                this.showSetPinModal();
            } else {
                this.showToast('PIN protection disabled', 'success');
            }
        } catch (error) {
            this.settings.pinEnabled = !this.settings.pinEnabled;
            this.updateToggleStates();
            this.showToast(error.message || 'Failed to update PIN settings', 'error');
        }
    }

    async toggleVoiceActivation() {
        this.settings.voiceActivation = !this.settings.voiceActivation;
        this.updateToggleStates();
        await this.saveSettings();
        
        this.showToast(
            this.settings.voiceActivation ? 'Voice activation enabled' : 'Voice activation disabled',
            'success'
        );
    }

    async toggleAutoSend() {
        // Toggle auto-send after wake word
        this.settings.autoSendAfterWakeWord = !this.settings.autoSendAfterWakeWord;
        this.updateToggleStates();
        await this.saveSettings();
        
        this.showToast(
            this.settings.autoSendAfterWakeWord 
                ? 'Auto-send after wake word enabled' 
                : 'Auto-send after wake word disabled',
            'success'
        );
        
        console.log('Auto-send toggled:', this.settings.autoSendAfterWakeWord);
    }

    async toggleVoiceResponse() {
        this.settings.voiceResponse = !this.settings.voiceResponse;
        this.updateToggleStates();
        await this.saveSettings();
        
        this.showToast(
            this.settings.voiceResponse ? 'Voice response enabled' : 'Voice response disabled',
            'success'
        );
    }

    async toggleMuteNotifications() {
        this.settings.muteNotifications = !this.settings.muteNotifications;
        this.updateToggleStates();
        await this.saveSettings();
        
        this.showToast(
            this.settings.muteNotifications ? 'Notifications muted' : 'Notifications unmuted',
            'success'
        );
    }

    showSetPinModal() {
        const modal = this.createPinModal('set');
        document.body.appendChild(modal);
        modal.classList.add('show');
    }

    showChangePinModal() {
        const modal = this.createPinModal('change');
        document.body.appendChild(modal);
        modal.classList.add('show');
    }

    createPinModal(type) {
        const modal = document.createElement('div');
        modal.className = 'pin-modal';
        modal.innerHTML = `
            <div class="pin-content">
                <h3 class="pin-title">
                    ${type === 'set' ? 'Set Security PIN' : 'Change Security PIN'}
                </h3>
                <p class="pin-description">
                    ${type === 'set' 
                        ? 'Choose a 4-digit PIN to secure your application' 
                        : 'Enter your current PIN and choose a new one'}
                </p>
                
                ${type === 'change' ? `
                    <div class="form-group">
                        <label class="form-label">Current PIN</label>
                        <input type="password" id="currentPin" class="pin-input" maxlength="4" placeholder="Enter current PIN">
                    </div>
                ` : ''}
                
                <div class="form-group">
                    <label class="form-label">New PIN</label>
                    <input type="password" id="newPin" class="pin-input" maxlength="4" placeholder="Enter new PIN">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Confirm PIN</label>
                    <input type="password" id="confirmPin" class="pin-input" maxlength="4" placeholder="Confirm new PIN">
                </div>
                
                <div class="pin-buttons">
                    <button class="button button-secondary" onclick="this.closest('.pin-modal').remove()">
                        Cancel
                    </button>
                    <button class="button button-primary" id="savePinBtn">
                        ${type === 'set' ? 'Set PIN' : 'Change PIN'}
                    </button>
                </div>
            </div>
        `;

        const saveBtn = modal.querySelector('#savePinBtn');
        saveBtn.addEventListener('click', () => {
            this.handlePinSave(type, modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        const inputs = modal.querySelectorAll('.pin-input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
            });
        });

        return modal;
    }

    async handlePinSave(type, modal) {
        const newPin = modal.querySelector('#newPin').value;
        const confirmPin = modal.querySelector('#confirmPin').value;
        const currentPin = modal.querySelector('#currentPin')?.value;

        if (newPin.length !== 4) {
            this.showToast('PIN must be 4 digits', 'error');
            return;
        }

        if (newPin !== confirmPin) {
            this.showToast('PINs do not match', 'error');
            return;
        }

        try {
            if (window.settingsAPI) {
                let result;
                if (type === 'set') {
                    result = await window.settingsAPI.setSecurityPin(newPin);
                } else {
                    result = await window.settingsAPI.changePin(currentPin, newPin);
                }

                if (result.success) {
                    this.showToast(`PIN ${type === 'set' ? 'set' : 'changed'} successfully`, 'success');
                    modal.remove();
                } else {
                    this.showToast(result.message || 'Failed to save PIN', 'error');
                }
            } else {
                this.showToast(`PIN ${type === 'set' ? 'set' : 'changed'} successfully`, 'success');
                modal.remove();
            }
        } catch (error) {
            console.error('PIN save error:', error);
            this.showToast('Failed to save PIN', 'error');
        }
    }

    async lockApp() {
        try {
            if (window.settingsAPI) {
                await window.settingsAPI.closeSettings();
                setTimeout(async () => {
                    await window.settingsAPI.lockApp();
                    this.showToast('App locked', 'success');
                }, 100);
            }
        } catch (error) {
            console.error('Failed to lock app:', error);
            this.showToast('Failed to lock app', 'error');
        }
    }

    async logout() {
        try {
            if (window.settingsAPI) {
                await window.settingsAPI.logout();
            }

            this.showToast('Logged out successfully', 'success');
            this.isAuthenticated = false;
            this.currentUser = null;
            this.updateUI();
        } catch (error) {
            this.showToast('Failed to logout', 'error');
        }
    }

    async quitApp() {
        if (confirm('Are you sure you want to quit the application?')) {
            try {
                if (window.settingsAPI) {
                    await window.settingsAPI.quitApp();
                } else {
                    window.close();
                }
            } catch (error) {
                this.showToast('Failed to quit app', 'error');
            }
        }
    }

    closeSettings() {
        if (window.settingsAPI) {
            window.settingsAPI.closeSettings();
        } else {
            window.close();
        }
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize settings modal when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.settingsModalInstance = new SettingsModal();
});

// Export for use in other files
window.SettingsModal = SettingsModal;