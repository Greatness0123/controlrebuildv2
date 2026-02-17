class EntryWindow {
    constructor() {
        this.userIdInput = document.getElementById('userIdInput');
        this.connectButton = document.getElementById('connectButton');
        this.startButton = document.getElementById('startButton');
        this.errorMessage = document.getElementById('errorMessage');
        this.successMessage = document.getElementById('successMessage');
        this.unauthenticatedState = document.getElementById('unauthenticatedState');
        this.authenticatedState = document.getElementById('authenticatedState');

        this.isAuthenticated = false;
        this.currentUser = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthentication();
        this.animateTips();
        this.setupDragging();
        this.updatePlatformSpecifics();
    }

    updatePlatformSpecifics() {
        if (window.entryAPI && window.entryAPI.getPlatform) {
            const platform = window.entryAPI.getPlatform();
            if (platform === 'darwin') {
                const tipEl = document.getElementById('hotkeyTipText');
                if (tipEl) {
                    tipEl.textContent = 'Press Cmd+. to toggle chat. Alt+Z to stop current task.';
                }
            }
        }
    }

    animateTips() {
        const tips = Array.from(document.querySelectorAll('.tip-item'));
        if (tips.length === 0) return;

        let currentIndex = 0;
        const showDuration = 2000; // 2 seconds as requested
        const fadeDuration = 500;

        const showNextTip = () => {
            tips.forEach(tip => {
                tip.classList.remove('show');
                tip.style.display = 'none';
            });

            const currentTip = tips[currentIndex];
            currentTip.style.display = 'flex';
            setTimeout(() => {
                currentTip.classList.add('show');
            }, 10);

            setTimeout(() => {
                currentTip.classList.remove('show');
                setTimeout(() => {
                    currentIndex = (currentIndex + 1) % tips.length;
                    showNextTip();
                }, fadeDuration);
            }, showDuration);
        };

        showNextTip();
    }

    setupDragging() {
        let isDragging = false;
        let startX, startY;

        const leftSection = document.querySelector('.left-section');
        if (!leftSection) return;

        leftSection.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.tip-item, .feature-item, .version-info, button, input')) return;
            isDragging = true;
            startX = e.screenX;
            startY = e.screenY;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging && window.entryAPI && window.entryAPI.dragWindow) {
                const deltaX = e.screenX - startX;
                const deltaY = e.screenY - startY;

                startX = e.screenX;
                startY = e.screenY;

                window.entryAPI.dragWindow({ deltaX, deltaY });
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        window.addEventListener('blur', () => {
            isDragging = false;
        });
    }

    setupEventListeners() {
        // Connect button
        this.connectButton.addEventListener('click', () => {
            this.authenticate();
        });

        // Start button (authenticated state)
        this.startButton.addEventListener('click', () => {
            this.startApplication();
        });

        // Switch account
        document.getElementById('switchAccount').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchAccount();
        });

        // Get ID link - opens dashboard
        document.getElementById('getLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.openDashboard();
        });

        // Input validation
        this.userIdInput.addEventListener('input', (e) => {
            this.formatUserId(e.target);
        });

        this.userIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.authenticate();
            }
        });

        // Window controls
        document.getElementById('minimizeButton').addEventListener('click', () => {
            this.minimizeWindow();
        });

        document.getElementById('maximizeButton').addEventListener('click', () => {
            this.maximizeWindow();
        });

        document.getElementById('closeButton').addEventListener('click', () => {
            this.closeWindow();
        });

        // Online/Offline listeners
        window.addEventListener('offline', () => {
            this.showError('You are offline. Please check your internet connection.');
            this.showLoading(false);
        });

        window.addEventListener('online', () => {
            this.hideMessages();
            this.showSuccess('Internet connection restored.');
            setTimeout(() => this.hideMessages(), 3000);
        });
    }

    formatUserId(input) {
        // Allow only numbers
        const value = input.value.replace(/[^0-9]/g, '');
        input.value = value;
    }

    async authenticate() {
        let userId = this.userIdInput.value.trim();

        if (!navigator.onLine) {
            this.showError('You are offline. Please check your internet connection.');
            return;
        }

        if (!userId) {
            this.showError('Please enter your 12-digit User ID');
            return;
        }

        // Validate length
        if (userId.length !== 12) {
            this.showError('User ID must be exactly 12 digits');
            return;
        }

        this.showLoading(true);
        this.hideMessages();

        try {
            // Check if entryAPI is available
            if (!window.entryAPI) {
                this.showError('Application interface not available');
                this.showLoading(false);
                return;
            }

            console.log('Verifying User ID:', userId);

            // Call verifyEntryID through IPC
            const result = await window.entryAPI.verifyEntryID(userId);

            console.log('Verification result:', result);

            this.handleAuthenticationResult(result);
        } catch (error) {
            console.error('Authentication error:', error);
            this.showError('Authentication failed. Please check your User ID and try again.');
            this.showLoading(false);
        }
    }

    handleAuthenticationResult(result) {
        this.showLoading(false);

        if (result.success) {
            this.isAuthenticated = true;
            this.currentUser = result.user;
            this.showSuccess('Authentication successful!');

            // Update UI with user info
            this.updateUserInfo(result.user);

            // Show authenticated state after delay
            setTimeout(() => {
                this.showAuthenticatedState();
            }, 1000);
        } else {
            this.showError(result.message || 'Authentication failed. Please try again.');
        }
    }

    updateUserInfo(user) {
        // Create avatar from first letter of name
        const avatar = (user.name || 'U').charAt(0).toUpperCase();
        document.getElementById('userAvatar').textContent = avatar;
        document.getElementById('userName').textContent = user.name || 'User';
        document.getElementById('userEmail').textContent = user.email || 'No email';
        document.getElementById('userPlan').textContent = (user.plan || 'FREE PLAN').toUpperCase();
    }

    showAuthenticatedState() {
        this.unauthenticatedState.style.display = 'none';
        this.authenticatedState.classList.add('show');
        this.hideMessages();
    }

    switchAccount() {
        this.isAuthenticated = false;
        this.currentUser = null;
        this.userIdInput.value = '';
        this.unauthenticatedState.style.display = 'block';
        this.authenticatedState.classList.remove('show');
        this.hideMessages();
    }

    async startApplication() {
        if (this.isAuthenticated && window.entryAPI) {
            // Minimize entry window instead of closing it
            console.log('[EntryWindow] Start button clicked, minimizing entry window');
            await window.entryAPI.minimizeWindow();
        }
    }

    async checkAuthentication() {
        try {
            if (!window.entryAPI) {
                console.log('Entry API not available');
                return;
            }

            const userInfo = await window.entryAPI.getUserInfo();
            console.log('Cached user info:', userInfo);

            if (userInfo && userInfo.success && userInfo.isAuthenticated) {
                this.isAuthenticated = true;
                this.currentUser = userInfo;
                this.updateUserInfo(userInfo);
                this.showAuthenticatedState();
            }
        } catch (error) {
            console.log('No cached authentication found:', error);
        }
    }

    async openDashboard() {
        if (window.entryAPI) {
            await window.entryAPI.openWebsite();
        }
    }

    // Window controls
    async minimizeWindow() {
        if (window.entryAPI) {
            await window.entryAPI.minimizeWindow();
        }
    }

    async maximizeWindow() {
        if (window.entryAPI) {
            await window.entryAPI.maximizeWindow();
        }
    }

    async closeWindow() {
        if (window.entryAPI) {
            await window.entryAPI.closeWindow();
        } else {
            if (confirm('Are you sure you want to quit the application?')) {
                window.close();
            }
        }
    }

    // UI helpers
    showLoading(show) {
        if (show) {
            this.connectButton.classList.add('loading');
            this.connectButton.disabled = true;
        } else {
            this.connectButton.classList.remove('loading');
            this.connectButton.disabled = false;
        }
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.classList.add('show');
        this.successMessage.classList.remove('show');
    }

    showSuccess(message) {
        this.successMessage.textContent = message;
        this.successMessage.classList.add('show');
        this.errorMessage.classList.remove('show');
    }

    hideMessages() {
        this.errorMessage.classList.remove('show');
        this.successMessage.classList.remove('show');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new EntryWindow();
});