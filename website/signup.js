class SignupPage {
    constructor() {
        this.firebase = new FirebaseService();
        this.selectedPlan = 'Free';
        this.setupEventListeners();
    }

    setupEventListeners() {
        const signupForm = document.getElementById('signupForm');
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');

        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.signup();
        });

        // Password strength indicator
        passwordInput.addEventListener('input', (e) => {
            this.updatePasswordStrength(e.target.value);
        });

        // Plan selection
        document.querySelectorAll('.plan-option').forEach(option => {
            option.addEventListener('click', () => {
                this.selectPlan(option);
            });
        });

        // Confirm password validation
        confirmPasswordInput.addEventListener('input', (e) => {
            this.validatePasswords();
        });

        // Auto-focus first name field
        document.getElementById('firstName').focus();
    }

    selectPlan(selectedOption) {
        document.querySelectorAll('.plan-option').forEach(option => {
            option.classList.remove('selected');
        });
        selectedOption.classList.add('selected');
        this.selectedPlan = selectedOption.dataset.plan;
    }

    updatePasswordStrength(password) {
        const strengthBar = document.getElementById('passwordStrengthBar');
        
        if (password.length === 0) {
            strengthBar.className = 'password-strength-bar';
            return;
        }

        let strength = 0;
        
        // Length check
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;
        
        // Character variety checks
        if (/[a-z]/.test(password)) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^a-zA-Z0-9]/.test(password)) strength++;

        // Update UI
        if (strength <= 2) {
            strengthBar.className = 'password-strength-bar weak';
        } else if (strength <= 4) {
            strengthBar.className = 'password-strength-bar medium';
        } else {
            strengthBar.className = 'password-strength-bar strong';
        }
    }

    validatePasswords() {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (confirmPassword && password !== confirmPassword) {
            document.getElementById('confirmPassword').style.borderColor = '#ef4444';
            return false;
        } else {
            document.getElementById('confirmPassword').style.borderColor = '';
            return true;
        }
    }

    async signup() {
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Validation
        if (!firstName || !lastName || !email || !password || !confirmPassword) {
            this.showError('Please fill in all fields');
            return;
        }

        if (password.length < 8) {
            this.showError('Password must be at least 8 characters long');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('Passwords do not match');
            return;
        }

        if (!this.validateEmail(email)) {
            this.showError('Please enter a valid email address');
            return;
        }

        this.setLoading(true);
        this.hideMessages();

        try {
            // Generate unique User ID
            const userId = await this.firebase.generateUserId();
            
            // Create user account (mock implementation)
            const userData = {
                id: userId,
                name: `${firstName} ${lastName}`,
                email: email,
                plan: this.selectedPlan + ' Plan',
                memberSince: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                tasksCompleted: 0,
                hoursSaved: 0,
                successRate: 0,
                password: 'hashed_' + password, // In real app, this would be properly hashed
                passwordLastChanged: new Date()
            };

            // Store user (mock implementation)
            this.firebase.users.set(userId, userData);

            // Show success message with User ID
            this.showSuccessMessage(`Account created successfully! Your User ID is: ${userId}`);
            this.displayUserId(userId);
            
            // Reset form
            document.getElementById('signupForm').reset();
            document.getElementById('passwordStrengthBar').className = 'password-strength-bar';

        } catch (error) {
            console.error('Signup error:', error);
            this.showError('An error occurred during signup. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    displayUserId(userId) {
        const userIdDisplay = document.getElementById('userIdDisplay');
        const userIdValue = document.getElementById('userIdValue');
        
        userIdValue.textContent = userId;
        userIdDisplay.classList.add('show');
    }

    setLoading(loading) {
        const signupBtn = document.getElementById('signupBtn');
        if (loading) {
            signupBtn.classList.add('loading');
            signupBtn.disabled = true;
        } else {
            signupBtn.classList.remove('loading');
            signupBtn.disabled = false;
        }
    }

    showError(message) {
        const errorMessage = document.getElementById('errorMessage');
        const successMessage = document.getElementById('successMessage');
        
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
        successMessage.classList.remove('show');
    }

    showSuccessMessage(message) {
        const errorMessage = document.getElementById('errorMessage');
        const successMessage = document.getElementById('successMessage');
        
        successMessage.textContent = message;
        successMessage.classList.add('show');
        errorMessage.classList.remove('show');
    }

    hideMessages() {
        document.getElementById('errorMessage').classList.remove('show');
        document.getElementById('successMessage').classList.remove('show');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SignupPage();
});