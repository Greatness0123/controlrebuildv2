// Import Firebase service (assuming it's shared)
// In a real app, this would be imported from a shared file

class LoginPage {
    constructor() {
        this.firebase = new FirebaseService();
        this.setupEventListeners();
    }

    setupEventListeners() {
        const loginForm = document.getElementById('loginForm');
        const userIdInput = document.getElementById('userId');
        const passwordInput = document.getElementById('password');

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.login();
        });

        // Auto-focus user ID field
        userIdInput.focus();

        // Format user ID as user types
        userIdInput.addEventListener('input', (e) => {
            this.formatUserId(e.target);
        });
    }

    formatUserId(input) {
        // Remove non-alphanumeric characters except hyphens
        let value = input.value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
        
        // Auto-format as XXXX-XXXX-XXXX-XXXX (24 chars with hyphens)
        if (value.length > 4 && value.length <= 8) {
            value = value.slice(0, 4) + '-' + value.slice(4);
        } else if (value.length > 8 && value.length <= 12) {
            value = value.slice(0, 4) + '-' + value.slice(4, 8) + '-' + value.slice(8, 12);
        } else if (value.length > 12 && value.length <= 16) {
            value = value.slice(0, 4) + '-' + value.slice(4, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16);
        } else if (value.length > 16 && value.length <= 20) {
            value = value.slice(0, 4) + '-' + value.slice(4, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' + value.slice(16, 20);
        } else if (value.length > 20) {
            value = value.slice(0, 4) + '-' + value.slice(4, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' + value.slice(16, 20) + '-' + value.slice(20, 24);
        }
        
        input.value = value;
    }

    async login() {
        const userId = document.getElementById('userId').value.trim();
        const password = document.getElementById('password').value;
        const errorMessage = document.getElementById('errorMessage');
        const loginBtn = document.getElementById('loginBtn');

        // Validation
        if (!userId || !password) {
            this.showError('Please enter both User ID and password');
            return;
        }

        if (userId.length !== 23 && userId.length !== 24) {
            this.showError('Invalid User ID format');
            return;
        }

        this.setLoading(true);
        this.hideError();

        try {
            // In a real app, we'd verify the password
            // For demo, we'll just authenticate by User ID
            const result = await this.firebase.signIn(userId);

            if (result.success) {
                // Redirect to dashboard
                window.location.href = 'index.html';
            } else {
                this.showError(result.message || 'Invalid User ID or password');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('An error occurred during login. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        const loginBtn = document.getElementById('loginBtn');
        if (loading) {
            loginBtn.classList.add('loading');
            loginBtn.disabled = true;
        } else {
            loginBtn.classList.remove('loading');
            loginBtn.disabled = false;
        }
    }

    showError(message) {
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
    }

    hideError() {
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.classList.remove('show');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LoginPage();
});