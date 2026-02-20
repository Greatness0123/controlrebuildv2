class SettingsModal {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.freeDefaultsApplied = false; // <- guard to avoid repeated auto-save loops for free users
        this.settings = {
            pinEnabled: false,
            voiceActivation: false,
            voiceResponse: false,
            muteNotifications: false,
            autoSendAfterWakeWord: false,
            floatingButtonVisible: true,
            greetingTTS: false,
            windowVisibility: false,
            windowVisibility: false,
            wakeWordToggleChat: false,
            modelProvider: 'gemini',
            openrouterModel: 'anthropic/claude-3.5-sonnet',
            openrouterCustomModel: '',
            openrouterApiKey: '',
            ollamaEnabled: false,
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'llama3',
            hotkeys: {
                toggleChat: 'CommandOrControl+Space',
                stopAction: 'Alt+Z'
            }
        };

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupIPCListeners();
        this.setupDragging();
        await this.loadUserStatus();
        await this.loadSettings();
        // Load whether a per-user Picovoice/Porcupine key exists
        await this.loadPicovoiceKey();
        this.updateUI();
        this.initializeLucideIcons();

        const staticPin = document.getElementById('pinModal');
        if (staticPin) {
            staticPin.classList.remove('show');
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

        document.getElementById('greetingTTSToggle')?.addEventListener('click', () => {
            this.toggleGreetingTTS();
        });

        document.getElementById('floatingButtonToggle')?.addEventListener('click', () => {
            this.toggleFloatingButton();
        });

        document.getElementById('windowVisibilityToggle')?.addEventListener('click', () => {
            this.toggleWindowVisibility();
        });

        document.getElementById('autoStartToggle')?.addEventListener('click', () => {
            this.toggleAutoStart();
        });

        document.getElementById('wakeWordToggleChatToggle')?.addEventListener('click', () => {
            this.toggleWakeWordToggleChat();
        });

        document.getElementById('edgeGlowToggle')?.addEventListener('click', () => {
            this.toggleEdgeGlow();
        });

        document.getElementById('proceedWithoutConfirmationToggle')?.addEventListener('click', () => {
            this.toggleProceedWithoutConfirmation();
        });

        document.getElementById('ollamaUrl')?.addEventListener('change', (e) => {
            this.settings.ollamaUrl = e.target.value;
            this.saveSettings();
        });

        document.getElementById('ollamaModel')?.addEventListener('change', (e) => {
            this.settings.ollamaModel = e.target.value;
            this.saveSettings();
        });

        document.getElementById('modelProvider')?.addEventListener('change', (e) => {
            const provider = e.target.value;
            if (provider === 'openrouter' && this.isUserFreePlan()) {
                this.showToast('Upgrade to PRO to use OpenRouter models', 'error');
                e.target.value = this.settings.modelProvider;
                return;
            }
            this.settings.modelProvider = provider;
            this.settings.ollamaEnabled = (provider === 'ollama');
            this.updateUI();
            this.saveSettings();
        });

        document.getElementById('openrouterModelList')?.addEventListener('change', (e) => {
            this.settings.openrouterModel = e.target.value;
            this.updateUI();
            this.saveSettings();
        });

        document.getElementById('openrouterCustomModel')?.addEventListener('change', (e) => {
            this.settings.openrouterCustomModel = e.target.value;
            this.saveSettings();
        });

        document.getElementById('openrouterApiKey')?.addEventListener('change', (e) => {
            this.settings.openrouterApiKey = e.target.value;
            this.saveSettings();
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

        // Hotkey management
        document.getElementById('editToggleChatBtn')?.addEventListener('click', () => {
            this.showHotkeyEditor('toggleChat');
        });

        document.getElementById('editStopActionBtn')?.addEventListener('click', () => {
            this.showHotkeyEditor('stopAction');
        });

        document.getElementById('resetHotkeysBtn')?.addEventListener('click', () => {
            this.resetHotkeys();
        });

        document.getElementById('hotkeyCancelBtn')?.addEventListener('click', () => {
            this.closeHotkeyEditor();
        });

        document.getElementById('hotkeySaveBtn')?.addEventListener('click', () => {
            if (this.currentRecordedHotkey) {
                this.saveHotkey(this.currentEditingHotkeyId, this.currentRecordedHotkey);
            }
        });
    }

    setupIPCListeners() {
        if (window.settingsAPI) {
            // Listen for settings updates
            window.settingsAPI.onSettingsUpdated?.((event, settings) => {
                console.log('[Settings] onSettingsUpdated received', settings);
                this.settings = { ...this.settings, ...settings };
                this.updateUI();
            });

            // Listen for picovoice key invalid messages from main
            window.settingsAPI.onPorcupineKeyInvalid?.((event, payload) => {
                console.log('[Settings] onPorcupineKeyInvalid received', payload);
                const msg = (payload && payload.message) ? payload.message : 'Invalid Picovoice key detected';
                this.showToast(msg, 'error');
                this.hasPicovoiceKey = false;
                this.settings.voiceActivation = false;
                this.updateUI();
            });

            // Listen for user authentication changes
            window.settingsAPI.onUserChanged?.((event, user) => {
                this.currentUser = user;
                this.isAuthenticated = !!user;
                // Refresh keys and UI
                this.loadPicovoiceKey().then(() => this.updateUI());
            });

            // Listen for picovoice key invalid messages from main
            window.settingsAPI.onPorcupineKeyInvalid?.((event, payload) => {
                const msg = (payload && payload.message) ? payload.message : 'Invalid Picovoice key detected';
                this.showToast(msg, 'error');
                this.hasPicovoiceKey = false;
                this.settings.voiceActivation = false;
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

                // Robustness: perform a short delayed re-check to capture any Firebase-side changes
                // that might be applied during main process startup/sync. This won't block UI.
                setTimeout(async () => {
                    try {
                        const refreshed = await window.settingsAPI.getCurrentUser();
                        if (refreshed && refreshed.isAuthenticated && refreshed.id) {
                            // If plan or critical fields changed, update local state and UI
                            if (!this.currentUser || refreshed.plan !== this.currentUser.plan || refreshed.picovoiceKey !== this.currentUser.picovoiceKey) {
                                console.log('[Settings] Detected refreshed user data from main:', { before: this.currentUser ? this.currentUser.plan : null, after: refreshed.plan });
                                this.currentUser = refreshed;
                                this.isAuthenticated = true;
                                // Trigger UI update and reload any per-user keys
                                await this.loadPicovoiceKey();
                                this.updateUI();
                            }
                        }
                    } catch (e) {
                        console.warn('[Settings] Delayed user refresh failed:', e.message || e);
                    }
                }, 2000);

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

    async loadPicovoiceKey() {
        console.log('[Settings] loadPicovoiceKey: checking main process for stored key');
        try {
            if (window.settingsAPI) {
                const res = await window.settingsAPI.getPicovoiceKey();
                console.log('[Settings] loadPicovoiceKey: main returned', { success: !!(res && res.success), hasKey: !!(res && res.key) });
                this.hasPicovoiceKey = !!(res && res.success && res.key);
                if (!this.hasPicovoiceKey) {
                    // Ensure voiceActivation is off when there's no key
                    this.settings.voiceActivation = false;
                }
            } else {
                console.log('[Settings] loadPicovoiceKey: settingsAPI not available');
                this.hasPicovoiceKey = false;
            }
        } catch (e) {
            console.error('[Settings] loadPicovoiceKey: Failed to check Picovoice key:', e);
            this.hasPicovoiceKey = false;
        }
        console.log('[Settings] loadPicovoiceKey: final hasPicovoiceKey=', !!this.hasPicovoiceKey);
    }

    setFreeDefaults() {
        // Apply fixed defaults for free users (visible but locked)
        this.settings.voiceActivation = false;
        this.settings.wakeWordToggleChat = false;
        this.settings.windowVisibility = true;
        this.settings.floatingButtonVisible = true;
        if (this.settings.edgeGlowEnabled === undefined) this.settings.edgeGlowEnabled = true;
    }

    async saveSettings() {
        try {
            console.log('[Settings] saveSettings: saving settings', this.settings);
            if (window.settingsAPI) {
                const res = await window.settingsAPI.saveSettings(this.settings);
                console.log('[Settings] saveSettings: main returned', res);
            } else {
                // Fallback to sessionStorage
                sessionStorage.setItem('appSettings', JSON.stringify(this.settings));
                console.log('[Settings] saveSettings: saved to sessionStorage');
            }
        } catch (error) {
            console.error('[Settings] Failed to save settings:', error);
            this.showToast('Failed to save settings', 'error');
        }
    }

    updateUI() {
        // Update user info
        this.updateUserInfo();

        // Update hotkey text
        this.updateHotkeyDisplay();

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

            // Apply plan-based restrictions
            try {
                // Normalize plan string (handles values like 'Free Plan', 'Pro Plan', etc.)
                const planRaw = (this.currentUser.plan || '').toLowerCase();
                const plan = planRaw.replace(/\s*plan\s*/gi, '').trim();
                console.log('[Settings] Detected user plan:', { raw: planRaw, normalized: plan });
                if (plan === 'free') {
                    this.setFreeDefaults();
                    // Persist enforced defaults only once per session to avoid continuous save/update loops
                    if (!this.freeDefaultsApplied) {
                        this.freeDefaultsApplied = true;
                        this.saveSettings().then(() => console.log('[Settings] Free defaults applied and saved'));
                    }
                    this.isFreePlan = true;
                } else {
                    // pro / master: no forced defaults
                    this.isFreePlan = false;
                    // Reset the guard so if user later downgrades, defaults will be applied once
                    this.freeDefaultsApplied = false;
                }
            } catch (e) {
                // ignore
                this.isFreePlan = false;
            }
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
        // Determine plan-level restrictions (normalized plan string)
        const planRaw = (this.currentUser && (this.currentUser.plan || '')) ? (this.currentUser.plan || '').toLowerCase() : '';
        const normalizedPlan = planRaw.replace(/\s*plan\s*/gi, '').trim();
        const isFreePlan = !!(normalizedPlan === 'free' || this.isFreePlan);

        // Update Provider selection
        const modelProvider = document.getElementById('modelProvider');
        if (modelProvider) {
            modelProvider.value = this.settings.modelProvider || 'gemini';

            // Show/hide sub-sections
            document.getElementById('geminiSettings').style.display = (modelProvider.value === 'gemini') ? 'block' : 'none';
            document.getElementById('openrouterSettings').style.display = (modelProvider.value === 'openrouter') ? 'block' : 'none';
            document.getElementById('ollamaSettings').style.display = (modelProvider.value === 'ollama') ? 'block' : 'none';

            // Disable OpenRouter for free users in dropdown
            const openrouterOption = modelProvider.querySelector('option[value="openrouter"]');
            if (openrouterOption) {
                if (isFreePlan) {
                    openrouterOption.disabled = true;
                    openrouterOption.textContent = 'OpenRouter (PRO Only)';
                } else {
                    openrouterOption.disabled = false;
                    openrouterOption.textContent = 'OpenRouter (Pro/Master)';
                }
            }
        }

        // Update OpenRouter inputs
        const openrouterModelList = document.getElementById('openrouterModelList');
        if (openrouterModelList) {
            openrouterModelList.value = this.settings.openrouterModel || 'anthropic/claude-3.5-sonnet';
            document.getElementById('customModelContainer').style.display = (this.settings.openrouterModel === 'custom') ? 'block' : 'none';
        }

        const openrouterCustomModel = document.getElementById('openrouterCustomModel');
        if (openrouterCustomModel) openrouterCustomModel.value = this.settings.openrouterCustomModel || '';

        const openrouterApiKey = document.getElementById('openrouterApiKey');
        if (openrouterApiKey) openrouterApiKey.value = this.settings.openrouterApiKey || '';

        // Update Ollama inputs
        const ollamaUrlInput = document.getElementById('ollamaUrl');
        if (ollamaUrlInput) ollamaUrlInput.value = this.settings.ollamaUrl || 'http://localhost:11434';
        const ollamaModelInput = document.getElementById('ollamaModel');
        if (ollamaModelInput) ollamaModelInput.value = this.settings.ollamaModel || 'llama3';

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
            // If no per-user Picovoice key is present, ensure feature is off
            if (!this.hasPicovoiceKey) {
                this.settings.voiceActivation = false;
            }

            if (this.settings.voiceActivation) {
                voiceToggle.classList.add('active');
            } else {
                voiceToggle.classList.remove('active');
            }

            // Disable interaction for free users
            if (isFreePlan) {
                voiceToggle.style.pointerEvents = 'none';
                voiceToggle.style.opacity = '0.5';
                this.addUpgradeNoteToSetting('voiceToggle', 'Upgrade to PRO to activate voice activation');
            } else {
                voiceToggle.style.pointerEvents = '';
                voiceToggle.style.opacity = '1';
                this.removeUpgradeNoteFromSetting('voiceToggle');
                // If pro/master but key is missing, show instruction
                if (!this.hasPicovoiceKey) {
                    this.addUpgradeNoteToSetting('voiceToggle', 'Add Picovoice key to enable voice activation');
                }
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

        // Update greeting TTS toggle
        const greetingTTSToggle = document.getElementById('greetingTTSToggle');
        if (greetingTTSToggle) {
            if (this.settings.greetingTTS) {
                greetingTTSToggle.classList.add('active');
            } else {
                greetingTTSToggle.classList.remove('active');
            }
        }

        // Update floating button toggle
        const floatingButtonToggle = document.getElementById('floatingButtonToggle');
        if (floatingButtonToggle) {
            if (this.settings.floatingButtonVisible) {
                floatingButtonToggle.classList.add('active');
            } else {
                floatingButtonToggle.classList.remove('active');
            }
            if (isFreePlan) {
                floatingButtonToggle.style.pointerEvents = 'none';
                floatingButtonToggle.style.opacity = '0.5';
                this.addUpgradeNoteToSetting('floatingButtonToggle', 'Upgrade to PRO to control floating button');
            } else {
                floatingButtonToggle.style.pointerEvents = '';
                floatingButtonToggle.style.opacity = '1';
                this.removeUpgradeNoteFromSetting('floatingButtonToggle');
            }
        }

        // Update edge glow toggle
        const edgeGlowToggle = document.getElementById('edgeGlowToggle');
        if (edgeGlowToggle) {
            // Default to true if not explicitly set
            if (this.settings.edgeGlowEnabled !== false) {
                edgeGlowToggle.classList.add('active');
            } else {
                edgeGlowToggle.classList.remove('active');
            }
            if (isFreePlan) {
                edgeGlowToggle.style.pointerEvents = 'none';
                edgeGlowToggle.style.opacity = '0.5';
                this.addUpgradeNoteToSetting('edgeGlowToggle', 'Upgrade to PRO to control edge glow effect');
            } else {
                edgeGlowToggle.style.pointerEvents = '';
                edgeGlowToggle.style.opacity = '1';
                this.removeUpgradeNoteFromSetting('edgeGlowToggle');
            }
        }

        // Update window visibility toggle
        const windowVisibilityToggle = document.getElementById('windowVisibilityToggle');
        if (windowVisibilityToggle) {
            if (this.settings.windowVisibility !== false) {
                windowVisibilityToggle.classList.add('active');
            } else {
                windowVisibilityToggle.classList.remove('active');
            }
            if (isFreePlan) {
                windowVisibilityToggle.style.pointerEvents = 'none';
                windowVisibilityToggle.style.opacity = '0.5';
                this.addUpgradeNoteToSetting('windowVisibilityToggle', 'Upgrade to PRO to control window visibility');
            } else {
                windowVisibilityToggle.style.pointerEvents = '';
                windowVisibilityToggle.style.opacity = '1';
                this.removeUpgradeNoteFromSetting('windowVisibilityToggle');
            }
        }

        // Update wake word toggle chat toggle
        const wakeWordToggleChatToggle = document.getElementById('wakeWordToggleChatToggle');
        if (wakeWordToggleChatToggle) {
            if (this.settings.wakeWordToggleChat) {
                wakeWordToggleChatToggle.classList.add('active');
            } else {
                wakeWordToggleChatToggle.classList.remove('active');
            }
            if (isFreePlan) {
                wakeWordToggleChatToggle.style.pointerEvents = 'none';
                wakeWordToggleChatToggle.style.opacity = '0.5';
                this.addUpgradeNoteToSetting('wakeWordToggleChatToggle', 'Upgrade to PRO to activate wake word chat toggle');
            } else {
                wakeWordToggleChatToggle.style.pointerEvents = '';
                wakeWordToggleChatToggle.style.opacity = '1';
                this.removeUpgradeNoteFromSetting('wakeWordToggleChatToggle');
            }
        }

        // Update auto start toggle
        const autoStartToggle = document.getElementById('autoStartToggle');
        if (autoStartToggle) {
            if (this.settings.openAtLogin) {
                autoStartToggle.classList.add('active');
            } else {
                autoStartToggle.classList.remove('active');
            }
        }

        // Update proceed without confirmation toggle
        const proceedToggle = document.getElementById('proceedWithoutConfirmationToggle');
        if (proceedToggle) {
            if (this.settings.proceedWithoutConfirmation) {
                proceedToggle.classList.add('active');
            } else {
                proceedToggle.classList.remove('active');
            }
        }
    }

    async toggleAutoStart() {
        this.settings.openAtLogin = !this.settings.openAtLogin;
        this.updateToggleStates();

        // Call main process to set login item
        if (window.settingsAPI && window.settingsAPI.setAutoStart) {
            try {
                await window.settingsAPI.setAutoStart(this.settings.openAtLogin);
            } catch (e) {
                console.error('Failed to set auto-start:', e);
            }
        }

        await this.saveSettings();

        this.showToast(
            this.settings.openAtLogin ? 'App will start when your computer starts' : 'App will not auto-start',
            'success'
        );
    }

    async toggleProceedWithoutConfirmation() {
        this.settings.proceedWithoutConfirmation = !this.settings.proceedWithoutConfirmation;
        this.updateToggleStates();
        await this.saveSettings();

        this.showToast(
            this.settings.proceedWithoutConfirmation ? 'AI will proceed without confirmation' : 'AI will ask for confirmation for high-risk tasks',
            'success'
        );
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
        const isFree = this.isUserFreePlan();
        console.log('[Settings] toggleVoiceActivation called', { isFree, hasPicovoiceKey: !!this.hasPicovoiceKey, current: !!this.settings.voiceActivation });

        // Free users cannot enable voice activation
        if (isFree) {
            this.showToast('Upgrade to PRO to activate voice activation', 'error');
            console.log('[Settings] toggleVoiceActivation blocked: free plan');
            return;
        }

        // For pro/master users, ensure there's a picovoice key
        if (!this.hasPicovoiceKey) {
            // Double-check with main process (in case cache/state is out of sync)
            try {
                console.log('[Settings] toggleVoiceActivation: querying main for key');
                const res = await window.settingsAPI.getPicovoiceKey();
                console.log('[Settings] toggleVoiceActivation: getPicovoiceKey returned', { success: !!(res && res.success), hasKey: !!(res && res.key) });
                const keyExists = !!(res && res.success && res.key);
                if (keyExists) {
                    // update local state and proceed with toggle
                    this.hasPicovoiceKey = true;
                }
            } catch (e) {
                console.error('[Settings] toggleVoiceActivation: error checking key from main', e);
                // ignore and fall through to modal
            }
        }

        if (!this.hasPicovoiceKey) {
            // Show modal that instructs user to obtain their Picovoice access key
            console.log('[Settings] toggleVoiceActivation: no key, showing modal');
            this.showPicovoiceKeyModal();
            return;
        }

        // Toggle normally when key present
        this.settings.voiceActivation = !this.settings.voiceActivation;
        console.log('[Settings] toggleVoiceActivation: toggling, new value=', !!this.settings.voiceActivation);
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

    async toggleGreetingTTS() {
        this.settings.greetingTTS = !this.settings.greetingTTS;
        this.updateToggleStates();
        await this.saveSettings();

        this.showToast(
            this.settings.greetingTTS ? 'Greeting voice enabled' : 'Greeting voice disabled',
            'success'
        );
    }

    isUserFreePlan() {
        const pr = (this.currentUser && (this.currentUser.plan || '')) ? (this.currentUser.plan || '').toLowerCase() : '';
        const normalized = pr.replace(/\s*plan\s*/gi, '').trim();
        return normalized === 'free' || !!this.isFreePlan;
    }

    async toggleEdgeGlow() {
        if (this.isUserFreePlan()) {
            this.showToast('Upgrade to PRO to control edge glow effect', 'error');
            console.log('[Settings] toggleEdgeGlow blocked: free plan');
            return;
        }

        // Default to true if undefined, then toggle
        this.settings.edgeGlowEnabled = !(this.settings.edgeGlowEnabled !== false);
        this.updateToggleStates();
        await this.saveSettings();

        this.showToast(
            this.settings.edgeGlowEnabled ? 'Edge glow enabled' : 'Edge glow disabled',
            'success'
        );
    }

    async toggleFloatingButton() {
        if (this.isUserFreePlan()) {
            this.showToast('Upgrade to PRO to control floating button', 'error');
            console.log('[Settings] toggleFloatingButton blocked: free plan');
            return;
        }

        this.settings.floatingButtonVisible = !this.settings.floatingButtonVisible;
        this.updateToggleStates();
        await this.saveSettings();

        // Send message to main process to update floating button visibility
        if (window.settingsAPI && window.settingsAPI.updateFloatingButton) {
            window.settingsAPI.updateFloatingButton(this.settings.floatingButtonVisible);
        }

        this.showToast(
            this.settings.floatingButtonVisible ? 'Floating button shown' : 'Floating button hidden',
            'success'
        );
    }

    async toggleWindowVisibility() {
        if (this.isUserFreePlan()) {
            this.showToast('Upgrade to PRO to control window visibility', 'error');
            console.log('[Settings] toggleWindowVisibility blocked: free plan');
            return;
        }

        this.settings.windowVisibility = !this.settings.windowVisibility;
        this.updateToggleStates();
        await this.saveSettings();

        this.showToast(
            this.settings.windowVisibility ? 'Windows visible in screenshots' : 'Windows hidden in screenshots',
            'success'
        );
    }

    async toggleWakeWordToggleChat() {
        if (this.isUserFreePlan()) {
            this.showToast('Upgrade to PRO to activate wake word chat toggle', 'error');
            console.log('[Settings] toggleWakeWordToggleChat blocked: free plan');
            return;
        }

        this.settings.wakeWordToggleChat = !this.settings.wakeWordToggleChat;
        this.updateToggleStates();
        await this.saveSettings();

        this.showToast(
            this.settings.wakeWordToggleChat ? 'Wake word will toggle chat' : 'Wake word will only open chat',
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

    addUpgradeNoteToSetting(toggleId, message) {
        try {
            const toggle = document.getElementById(toggleId);
            if (!toggle) return;
            const item = toggle.closest('.setting-item');
            if (!item) return;
            let note = item.querySelector('.upgrade-note');
            if (!note) {
                note = document.createElement('div');
                note.className = 'upgrade-note';
                note.style.color = '#ef4444';
                note.style.fontSize = '12px';
                note.style.marginTop = '6px';
                note.style.fontWeight = '600';
                const info = item.querySelector('.setting-info');
                if (info) info.appendChild(note);
            }
            note.textContent = message;
        } catch (e) {
            // ignore
        }
    }

    removeUpgradeNoteFromSetting(toggleId) {
        try {
            const toggle = document.getElementById(toggleId);
            if (!toggle) return;
            const item = toggle.closest('.setting-item');
            if (!item) return;
            const note = item.querySelector('.upgrade-note');
            if (note) note.remove();
        } catch (e) {
            // ignore
        }
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

    showPicovoiceKeyModal() {
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'pin-modal';
        modal.style.alignItems = 'center';
        modal.innerHTML = `
            <div class="pin-content" style="width:420px;">
                <h3 class="pin-title">Picovoice Access Key</h3>
                <p class="pin-description">To use Voice Activation, please login to your Picovoice dashboard and copy your access key.</p>
                <div style="margin-top:12px;">
                    <input type="text" id="picovoiceKeyInput" placeholder="Paste access key here" style="width:100%; padding:8px; font-size:14px;" />
                    <div id="picovoiceKeyError" style="color:#ef4444; font-size:13px; margin-top:8px; display:none;"></div>
                </div>
                <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
                    <button class="button button-secondary" id="picovoiceKeyCancel">Cancel</button>
                    <button class="button button-primary" id="picovoiceKeyValidate">Validate & Save</button>
                </div>
                <div style="font-size:12px; color:#6b7280; margin-top:12px;">Get your Access Key from <span style="font-weight:600;">https://console.picovoice.ai/</span></div>
            </div>
        `;

        // Append and show
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);

        // Close when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        const input = modal.querySelector('#picovoiceKeyInput');
        const errDiv = modal.querySelector('#picovoiceKeyError');
        const validateBtn = modal.querySelector('#picovoiceKeyValidate');
        const cancelBtn = modal.querySelector('#picovoiceKeyCancel');

        cancelBtn.addEventListener('click', () => modal.remove());

        validateBtn.addEventListener('click', async () => {
            const key = input.value && input.value.trim();
            if (!key) {
                errDiv.textContent = 'Please paste your access key';
                errDiv.style.display = 'block';
                return;
            }

            try {
                validateBtn.disabled = true;
                console.log('[Settings] Picovoice modal: validating key (length=', key.length, ')');
                const res = await window.settingsAPI.validatePicovoiceKey(key);
                console.log('[Settings] Picovoice modal: validate response:', res);
                if (!res || !res.success) {
                    errDiv.textContent = res && res.message ? res.message : 'Invalid key';
                    errDiv.style.display = 'block';
                    validateBtn.disabled = false;
                    return;
                }

                // Save key for user
                console.log('[Settings] Picovoice modal: saving key');
                const saveRes = await window.settingsAPI.setPicovoiceKey(key);
                console.log('[Settings] Picovoice modal: save response:', saveRes);
                if (!saveRes || !saveRes.success) {
                    errDiv.textContent = saveRes && saveRes.message ? saveRes.message : 'Failed to save key';
                    errDiv.style.display = 'block';
                    validateBtn.disabled = false;
                    return;
                }

                // Update local state and remove upgrade note
                this.hasPicovoiceKey = true;
                this.settings.voiceActivation = true;
                this.removeUpgradeNoteFromSetting('voiceToggle');

                // Persist settings and refresh keys from main to ensure cache/sync consistency
                await this.saveSettings();
                await this.loadPicovoiceKey();
                console.log('[Settings] Picovoice modal: key saved and state updated');
                this.showToast('Picovoice key saved and voice activation enabled', 'success');
                modal.remove();
                this.updateUI();
            } catch (e) {
                console.error('[Settings] Picovoice modal: validation/save error', e);
                errDiv.textContent = e.message || 'Validation failed';
                errDiv.style.display = 'block';
                validateBtn.disabled = false;
            }
        });

        // Provide an explicit link/button instead of auto-redirect
        const linkRow = document.createElement('div');
        linkRow.style.marginTop = '12px';
        linkRow.style.display = 'flex';
        linkRow.style.justifyContent = 'space-between';

        const anchor = document.createElement('a');
        anchor.href = '#';
        // anchor.textContent = 'picovoice Console';
        anchor.style.fontWeight = '600';
        anchor.style.color = '#0d0d0d';
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                window.settingsAPI.openExternal('https://console.picovoice.ai/');
            } catch (err) {
                // ignore
            }
        });
        const openBtn = document.createElement('button');
        openBtn.className = 'button button-secondary';
        openBtn.textContent = 'Open Console';
        openBtn.addEventListener('click', () => {
            try {
                window.settingsAPI.openExternal('https://console.picovoice.ai/');
            } catch (err) {}
        });

        linkRow.appendChild(anchor);
        linkRow.appendChild(openBtn);

        const content = modal.querySelector('.pin-content');
        if (content) content.appendChild(linkRow);
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

    setupDragging() {
        const header = document.querySelector('.settings-header');
        if (!header) return;

        let isDragging = false;
        let startX, startY;

        header.addEventListener('mousedown', (e) => {
            // Only drag on left click and not on children with no-drag
            if (e.button !== 0) return;

            // Check if the click target or its parents have no-drag
            if (e.target.closest('.user-profile') || e.target.closest('.close-button') || e.target.closest('button')) {
                return;
            }

            isDragging = true;
            startX = e.screenX;
            startY = e.screenY;

            // Prevent text selection during drag
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.screenX - startX;
            const deltaY = e.screenY - startY;

            startX = e.screenX;
            startY = e.screenY;

            if (window.settingsAPI && window.settingsAPI.dragWindow) {
                window.settingsAPI.dragWindow({ deltaX, deltaY });
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });

        window.addEventListener('blur', () => {
            isDragging = false;
        });
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

    // Hotkey Management Methods

    updateHotkeyDisplay() {
        const toggleEl = document.getElementById('toggleChatHotkeyDisplay');
        const stopEl = document.getElementById('stopActionHotkeyDisplay');

        if (toggleEl && this.settings.hotkeys?.toggleChat) {
            toggleEl.textContent = this.formatHotkeyParams(this.settings.hotkeys.toggleChat);
        }

        if (stopEl && this.settings.hotkeys?.stopAction) {
            stopEl.textContent = this.formatHotkeyParams(this.settings.hotkeys.stopAction);
        }
    }

    formatHotkeyParams(accelerator) {
        // Make it look nicer (CommandOrControl -> Ctrl)
        return accelerator
            .replace('CommandOrControl', 'Ctrl')
            .replace('Control', 'Ctrl')
            .replace('Command', 'Cmd');
    }

    async resetHotkeys() {
        if (!confirm('Are you sure you want to restore default hotkeys?')) return;

        const defaults = {
            toggleChat: 'CommandOrControl+Space',
            stopAction: 'Alt+Z'
        };

        await this.saveHotkeys(defaults);
        this.showToast('Hotkeys restored to default', 'success');
    }

    showHotkeyEditor(id) {
        this.currentEditingHotkeyId = id;
        this.currentRecordedHotkey = null;

        const modal = document.getElementById('hotkeyModal');
        const title = document.getElementById('hotkeyTitle');
        const display = document.getElementById('hotkeyDisplay');
        const saveBtn = document.getElementById('hotkeySaveBtn');

        if (title) title.textContent = id === 'toggleChat' ? 'Set "Toggle Chat" Hotkey' : 'Set "Stop Task" Hotkey';
        if (display) display.textContent = 'Press new key combo...';
        if (saveBtn) saveBtn.disabled = true;

        if (modal) {
            modal.classList.add('show');
            this.startRecordingKeys();
        }
    }

    closeHotkeyEditor() {
        const modal = document.getElementById('hotkeyModal');
        if (modal) modal.classList.remove('show');
        this.stopRecordingKeys();
        this.currentEditingHotkeyId = null;
        this.currentRecordedHotkey = null;
    }

    startRecordingKeys() {
        this.recordedKeys = new Set();

        this.keyHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // On key down
            if (e.type === 'keydown') {
                // Ignore just modifiers being pressed alone unless combined logic
                // But for Electron Accelerators, we need modifiers + key usually.

                let key = e.key;
                let code = e.code;

                // Map logical keys
                if (key === ' ') key = 'Space';
                if (key.length === 1) key = key.toUpperCase();

                // Build accelerator string
                const modifiers = [];
                if (e.ctrlKey) modifiers.push('Ctrl');
                // CommandOrControl is usually Ctrl on Windows/Linux, Cmd on Mac. 
                // We'll stick to 'Ctrl' or 'Alt' or 'Shift' as detected.

                if (e.metaKey) modifiers.push('Super'); // CMD/Win
                if (e.altKey) modifiers.push('Alt');
                if (e.shiftKey) modifiers.push('Shift');

                // If the key itself is a modifier, don't double add it to the end
                const isModifierKey = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key);

                if (!isModifierKey) {
                    const combo = [...modifiers, key].join('+');

                    // Update display
                    const display = document.getElementById('hotkeyDisplay');
                    if (display) display.textContent = combo;

                    // Validate: Need at least one modifier? Or just accept provided.
                    // Electron accepts single keys too like 'F11'.
                    // But 'A' is probably bad.

                    this.currentRecordedHotkey = combo.replace('Ctrl', 'CommandOrControl').replace('Super', 'Command');

                    const saveBtn = document.getElementById('hotkeySaveBtn');
                    if (saveBtn) saveBtn.disabled = false;
                }
            }
        };

        window.addEventListener('keydown', this.keyHandler);
    }

    stopRecordingKeys() {
        if (this.keyHandler) {
            window.removeEventListener('keydown', this.keyHandler);
            this.keyHandler = null;
        }
    }

    async saveHotkey(id, accelerator) {
        if (!id || !accelerator) return;

        // Clone current hotkeys or init defaults logic if undefined
        const newHotkeys = { ...this.settings.hotkeys } || {};
        newHotkeys[id] = accelerator;

        await this.saveHotkeys(newHotkeys);
        this.closeHotkeyEditor();
        this.showToast('Hotkey saved successfully', 'success');
    }

    async saveHotkeys(newHotkeys) {
        try {
            this.settings.hotkeys = newHotkeys;

            if (window.settingsAPI && window.settingsAPI.updateHotkeys) {
                await window.settingsAPI.updateHotkeys(newHotkeys);
            }
            // else: fallback handled in load/saveSettings via session storage logic if needed

            this.updateHotkeyDisplay();
        } catch (e) {
            console.error('Failed to save hotkeys:', e);
            this.showToast('Failed to save hotkeys', 'error');
        }
    }
}

// Initialize settings modal when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.settingsModalInstance = new SettingsModal();
});

// Export for use in other files
window.SettingsModal = SettingsModal;