// Import Firebase service
import { getUserById, updateUser, generateUserId } from './firebase-service.js';

// Firebase Service - Real implementation using Firebase
class FirebaseService {
    constructor() {
        this.isInitialized = true;
        this.currentUser = null;
    }

    async signIn(userId) {
        try {
            const result = await getUserById(userId);
            if (result.success) {
                this.currentUser = result.user;
                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                return { success: true, user: this.currentUser };
            }
            return { success: false, message: result.message || 'User not found' };
        } catch (error) {
            console.error('Sign in error:', error);
            return { success: false, message: 'Authentication failed' };
        }
    }

    async signOut() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        return { success: true };
    }

    async getCurrentUser() {
        if (this.currentUser) {
            return this.currentUser;
        }
        
        // Check localStorage for cached user
        const stored = localStorage.getItem('currentUser');
        if (stored) {
            try {
                const userData = JSON.parse(stored);
                // Verify user still exists in database
                const result = await getUserById(userData.id);
                if (result.success) {
                    this.currentUser = result.user;
                    return this.currentUser;
                } else {
                    // User no longer exists, clear cache
                    localStorage.removeItem('currentUser');
                    return null;
                }
            } catch (error) {
                console.error('Error parsing stored user data:', error);
                localStorage.removeItem('currentUser');
                return null;
            }
        }
        
        return null;
    }

    async changePassword(userId, currentPassword, newPassword) {
        try {
            // In a real app, we'd verify the current password hash
            // For now, we'll just update the password
            const result = await updateUser(userId, {
                password: 'hashed_' + newPassword, // In production, use proper hashing
                passwordLastChanged: new Date()
            });

            if (result.success) {
                // Update cached user data
                if (this.currentUser && this.currentUser.id === userId) {
                    this.currentUser.passwordLastChanged = new Date();
                    localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                }
            }

            return result;
        } catch (error) {
            console.error('Password change error:', error);
            return { success: false, message: 'Failed to change password' };
        }
    }

    async generateUserId() {
        return generateUserId();
    }
}

class Dashboard {
    constructor() {
        this.firebase = new FirebaseService();
        this.currentUser = null;
        this.init();
    }

    async init() {
        // Check authentication
        this.currentUser = await this.firebase.getCurrentUser();
        
        if (!this.currentUser) {
            // Redirect to login if not authenticated
            window.location.href = 'login.html';
            return;
        }

        this.setupEventListeners();
        this.updateUI();
    }

    setupEventListeners() {
        // Copy User ID
        document.getElementById('copyUserId').addEventListener('click', () => {
            this.copyToClipboard('userId');
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Password modal
        document.getElementById('changePasswordBtn').addEventListener('click', () => {
            this.showPasswordModal();
        });

        document.getElementById('closeModal').addEventListener('click', () => {
            this.hidePasswordModal();
        });

        document.getElementById('passwordForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.changePassword();
        });

        // Close modal on outside click
        document.getElementById('passwordModal').addEventListener('click', (e) => {
            if (e.target.id === 'passwordModal') {
                this.hidePasswordModal();
            }
        });
    }

    updateUI() {
        if (!this.currentUser) return;

        // Update profile information
        document.getElementById('profileInitials').textContent = 
            this.currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase();
        
        document.getElementById('profileName').textContent = this.currentUser.name;
        document.getElementById('profileEmail').textContent = this.currentUser.email;
        document.getElementById('userId').textContent = this.currentUser.id;

        // Update stats
        document.querySelector('.stat:nth-child(1) .stat-value').textContent = 
            this.currentUser.tasksCompleted;
        document.querySelector('.stat:nth-child(2) .stat-value').textContent = 
            this.currentUser.hoursSaved;
        document.querySelector('.stat:nth-child(3) .stat-value').textContent = 
            this.currentUser.successRate + '%';

        // Update password info
        const lastChanged = new Date(this.currentUser.passwordLastChanged);
        const monthsAgo = Math.floor((new Date() - lastChanged) / (1000 * 60 * 60 * 24 * 30));
        document.getElementById('passwordInfo').textContent = 
            `Last changed ${monthsAgo} month${monthsAgo !== 1 ? 's' : ''} ago`;
    }

    copyToClipboard(elementId) {
        const text = document.getElementById(elementId).textContent;
        
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('User ID copied to clipboard!', 'success');
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showToast('User ID copied to clipboard!', 'success');
        });
    }

    showPasswordModal() {
        document.getElementById('passwordModal').classList.add('show');
        document.getElementById('passwordForm').reset();
    }

    hidePasswordModal() {
        document.getElementById('passwordModal').classList.remove('show');
    }

    async changePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Validation
        if (newPassword.length < 8) {
            this.showToast('Password must be at least 8 characters long', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showToast('Passwords do not match', 'error');
            return;
        }

        try {
            const result = await this.firebase.changePassword(
                this.currentUser.id,
                currentPassword,
                newPassword
            );

            if (result.success) {
                this.showToast('Password changed successfully!', 'success');
                this.hidePasswordModal();
                this.updateUI(); // Update the "last changed" text
            } else {
                this.showToast(result.message || 'Failed to change password', 'error');
            }
        } catch (error) {
            console.error('Password change error:', error);
            this.showToast('An error occurred while changing password', 'error');
        }
    }

    async logout() {
        try {
            await this.firebase.signOut();
            this.showToast('Logged out successfully', 'success');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1000);
        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('Failed to logout', 'error');
        }
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});

// Export for use in other files
window.FirebaseService = FirebaseService;
window.Dashboard = Dashboard;