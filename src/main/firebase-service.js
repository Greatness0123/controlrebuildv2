const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const CACHE_FILE = path.join(app.getPath('userData'), 'cached_user.json');

let db = null;

// Initialize Firebase Admin SDK
try {
    const serviceAccountPath = path.join(__dirname, '../config/firebase-service-account.json');
    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    db = admin.firestore();
    console.log('✓ Firebase Admin SDK initialized');
} catch (error) {
    console.error('✗ Failed to initialize Firebase:', error.message);
    console.error('Make sure firebase-service-account.json exists in /config folder');
}

module.exports = {
    db,

    /**
     * Verify user by Entry ID (12-digit user ID from website)
     * @param {string} entryId - 12 digit user ID (numbers only)
     */
    async verifyEntryID(entryId) {
        try {
            if (!db) {
                return {
                    success: false,
                    message: 'Database not initialized. Please check Firebase configuration.'
                };
            }

            // Normalize ID - remove any dashes/spaces
            const normalizedId = String(entryId).replace(/[-\s]/g, '').trim();

            console.log('Verifying entry ID:', normalizedId);

            if (normalizedId.length !== 12) {
                return {
                    success: false,
                    message: 'Invalid Entry ID format. Must be 12 digits.'
                };
            }

            // Query Firestore for user with matching 'id' field
            const usersRef = db.collection('users');
            const snapshot = await usersRef.where('id', '==', normalizedId).get();

            if (snapshot.empty) {
                console.log('Entry ID not found:', normalizedId);
                return {
                    success: false,
                    message: 'Entry ID not found. Please check your ID or get one from the dashboard.'
                };
            }

            // Get user data
            const userDoc = snapshot.docs[0];
            const userData = userDoc.data();

            console.log('Entry ID verified:', normalizedId);

            // Check if account is active
            if (userData.isActive === false) {
                return {
                    success: false,
                    message: 'This account has been deactivated. Please contact support.'
                };
            }

            // Update last login timestamp
            try {
                await userDoc.ref.update({
                    lastLogin: new Date().toISOString(),
                    lastLoginTimestamp: Date.now()
                });
            } catch (updateError) {
                console.warn('Could not update login timestamp:', updateError.message);
            }

            const finalUserData = {
                id: userData.id,
                name: userData.name || 'User',
                email: userData.email || '',
                avatar: (userData.name || 'U').charAt(0).toUpperCase(),
                plan: userData.plan || 'Free Plan',
                memberSince: userData.memberSince || 'Recently',
                tasksCompleted: userData.tasksCompleted || 0,
                hoursSaved: userData.hoursSaved || 0,
                successRate: userData.successRate || 0,
                isActive: userData.isActive !== false
            };

            // Cache user data
            this.cacheUser(finalUserData);

            // Return user data
            return {
                success: true,
                user: finalUserData
            };

        } catch (error) {
            console.error('Entry ID verification error:', error.message);
            return {
                success: false,
                message: 'Failed to verify Entry ID. Please check your connection and try again.'
            };
        }
    },

    /**
     * Get user by Firebase document ID
     */
    async getUserById(userId) {
        try {
            if (!db) {
                return { success: false, message: 'Database not initialized' };
            }

            const userDoc = await db.collection('users').doc(userId).get();

            if (!userDoc.exists) {
                return {
                    success: false,
                    message: 'User not found'
                };
            }

            const userData = userDoc.data();
            return {
                success: true,
                user: {
                    id: userDoc.id,
                    ...userData
                }
            };
        } catch (error) {
            console.error('Get user error:', error.message);
            return {
                success: false,
                message: error.message
            };
        }
    },

    /**
     * Get user by email
     */
    async getUserByEmail(email) {
        try {
            if (!db) {
                return { success: false, message: 'Database not initialized' };
            }

            const snapshot = await db.collection('users')
                .where('email', '==', email)
                .get();

            if (snapshot.empty) {
                return {
                    success: false,
                    message: 'User not found'
                };
            }

            const userData = snapshot.docs[0].data();
            return {
                success: true,
                user: {
                    id: snapshot.docs[0].id,
                    ...userData
                }
            };
        } catch (error) {
            console.error('Get user by email error:', error.message);
            return {
                success: false,
                message: error.message
            };
        }
    },

    /**
     * Update user data
     */
    async updateUser(userId, updateData) {
        try {
            if (!db) {
                return { success: false, message: 'Database not initialized' };
            }

            await db.collection('users').doc(userId).update({
                ...updateData,
                updatedAt: new Date().toISOString(),
                updatedTimestamp: Date.now()
            });

            // Update cache if we have the current user ID context?
            // For now, assume update happens mostly on reading fresh data or stats.

            return { success: true };
        } catch (error) {
            console.error('Update user error:', error.message);
            return {
                success: false,
                message: error.message
            };
        }
    },

    /**
     * Update user stats (tasks, hours saved, success rate)
     */
    async updateUserStats(userId, stats) {
        try {
            if (!db) {
                return { success: false, message: 'Database not initialized' };
            }

            const updates = {};

            if (stats.tasksCompleted !== undefined) {
                updates.tasksCompleted = stats.tasksCompleted;
            }
            if (stats.hoursSaved !== undefined) {
                updates.hoursSaved = stats.hoursSaved;
            }
            if (stats.successRate !== undefined) {
                updates.successRate = stats.successRate;
            }

            await db.collection('users').doc(userId).update({
                ...updates,
                lastStatsUpdate: new Date().toISOString()
            });

            return { success: true };
        } catch (error) {
            console.error('Update stats error:', error.message);
            return {
                success: false,
                message: error.message
            };
        }
    },

    cacheUser(userData) {
        try {
            fs.writeFileSync(CACHE_FILE, JSON.stringify(userData));
            console.log('User data cached successfully to', CACHE_FILE);
        } catch (error) {
            console.error('Failed to cache user data:', error);
        }
    },

    checkCachedUser() {
        try {
            if (fs.existsSync(CACHE_FILE)) {
                const data = fs.readFileSync(CACHE_FILE, 'utf8');
                const user = JSON.parse(data);
                if (user && user.id) {
                    console.log('Found cached user:', user.id);
                    return user;
                }
            }
        } catch (error) {
            console.error('Error reading cached user:', error);
        }
        return null;
    },

    clearCachedUser() {
        try {
            if (fs.existsSync(CACHE_FILE)) {
                fs.unlinkSync(CACHE_FILE);
                console.log('Cached user cleared');
            }
        } catch (error) {
            console.error('Error clearing cached user:', error);
        }
    }
};