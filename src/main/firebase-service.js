const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const getCacheFile = () => {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'cached_user.json');
};

const getKeysCacheFile = () => {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'api_keys.json');
};

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
            // Priority 1: Try Firebase if available
            if (db) {
                try {
                    const userDoc = await db.collection('users').doc(userId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();

                        // Update cache with fresh data
                        const freshUser = { id: userDoc.id, ...userData };
                        this.cacheUser(freshUser);

                        return {
                            success: true,
                            user: freshUser,
                            source: 'firebase'
                        };
                    }
                } catch (dbError) {
                    console.warn('Firebase getUserById failed, trying cache:', dbError.message);
                }
            }

            // Priority 2: Fallback to local cache
            const cachedUser = this.checkCachedUser();
            if (cachedUser && cachedUser.id === userId) {
                console.log('Returning cached user data for:', userId);
                return {
                    success: true,
                    user: cachedUser,
                    source: 'cache'
                };
            }

            if (!db) {
                return { success: false, message: 'Database not initialized and no cache found' };
            }

            return {
                success: false,
                message: 'User not found'
            };
        } catch (error) {
            console.error('Get user error:', error.message);
            // Emergency fallback
            const cachedUser = this.checkCachedUser();
            if (cachedUser && cachedUser.id === userId) {
                return {
                    success: true,
                    user: cachedUser,
                    source: 'cache'
                };
            }

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
            const cacheFile = getCacheFile();
            fs.writeFileSync(cacheFile, JSON.stringify(userData));
            console.log('User data cached successfully to', cacheFile);
        } catch (error) {
            console.error('Failed to cache user data:', error);
        }
    },

    checkCachedUser() {
        try {
            const cacheFile = getCacheFile();
            if (fs.existsSync(cacheFile)) {
                const data = fs.readFileSync(cacheFile, 'utf8');
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

    async checkRateLimit(userId, mode) {
        try {
            // Get cached user data first
            const cachedUser = this.checkCachedUser();
            let currentCount = 0;
            let plan = 'free';

            // Try to get from Firebase if online
            if (db) {
                try {
                    const snapshot = await db.collection('users').where('id', '==', userId).get();
                    if (!snapshot.empty) {
                        const userData = snapshot.docs[0].data();
                        plan = userData.plan || 'free';
                        currentCount = userData[`${mode}Count`] || 0;

                        // Update local cache with Firebase data
                        if (cachedUser && cachedUser.id === userId) {
                            cachedUser[`${mode}Count`] = currentCount;
                            cachedUser.plan = plan;
                            this.cacheUser(cachedUser);
                        }
                    } else {
                        return { allowed: false, error: 'User profile not found' };
                    }
                } catch (firebaseError) {
                    console.log('Firebase offline, using cached data');
                    // Use cached data if Firebase fails
                    if (cachedUser && cachedUser.id === userId) {
                        currentCount = cachedUser[`${mode}Count`] || 0;
                        plan = cachedUser.plan || 'free';
                    }
                }
            } else if (cachedUser && cachedUser.id === userId) {
                // Offline mode - use cached data
                currentCount = cachedUser[`${mode}Count`] || 0;
                plan = cachedUser.plan || 'free';
            }

            // Define limits
            const limits = {
                free: { act: 10, ask: 20 },
                pro: { act: 200, ask: 300 },
                master: { act: Infinity, ask: Infinity }
            };

            // Normalize plan name (Firebase may store "Free Plan", "Pro Plan", etc.)
            const normalizedPlan = String(plan).toLowerCase().replace(/\s*plan\s*/gi, '').trim() || 'free';
            const userLimit = limits[normalizedPlan] || limits.free;
            const limit = userLimit[mode];

            if (currentCount >= limit) {
                return {
                    allowed: false,
                    error: `Rate limit exceeded for ${mode} tasks. Upgrade your plan.`
                };
            }

            return { allowed: true, plan, remaining: limit - currentCount, currentCount };
        } catch (error) {
            console.error('Rate limit check error:', error);
            return { allowed: true };
        }
    },

    async incrementTaskCount(userId, mode) {
        try {
            const field = `${mode}Count`;

            // Update local cache first
            const cachedUser = this.checkCachedUser();
            if (cachedUser && cachedUser.id === userId) {
                cachedUser[field] = (cachedUser[field] || 0) + 1;
                cachedUser.lastTaskDate = new Date().toISOString();
                this.cacheUser(cachedUser);
                console.log(`Local ${mode}Count updated to:`, cachedUser[field]);
            }

            // Update Firebase if online
            if (db) {
                try {
                    const snapshot = await db.collection('users').where('id', '==', userId).get();
                    if (!snapshot.empty) {
                        const docRef = snapshot.docs[0].ref;
                        await docRef.update({
                            [field]: admin.firestore.FieldValue.increment(1),
                            lastTaskDate: new Date().toISOString()
                        });
                        console.log(`Firebase ${mode}Count incremented`);
                    }
                } catch (firebaseError) {
                    console.error('Firebase update failed, count saved locally:', firebaseError.message);
                }
            }
        } catch (error) {
            console.error('Increment task count error:', error);
        }
    },

    /**
     * Sync user data from local storage to Firebase on startup.
     * Ensures all local progress (counts, stats) is pushed to the database.
     */
    async syncUserData(userId) {
        try {
            if (!db) return null;

            const cachedUser = this.checkCachedUser();
            if (!cachedUser || cachedUser.id !== userId) return null;

            console.log('Syncing user data to Firebase for:', userId);

            // Get current remote data
            const snapshot = await db.collection('users').where('id', '==', userId).get();
            if (snapshot.empty) return null;

            const userDoc = snapshot.docs[0];
            const remoteData = userDoc.data();

            // 1. Sync counts (take higher value to account for offline activity)
            const syncedActCount = Math.max(cachedUser.actCount || 0, remoteData.actCount || 0);
            const syncedAskCount = Math.max(cachedUser.askCount || 0, remoteData.askCount || 0);
            const syncedTasksCompleted = Math.max(cachedUser.tasksCompleted || 0, remoteData.tasksCompleted || 0);

            // 2. Prepare data to update Firebase
            const firebaseUpdates = {
                actCount: syncedActCount,
                askCount: syncedAskCount,
                tasksCompleted: syncedTasksCompleted,
                lastLogin: new Date().toISOString(),
                lastLoginTimestamp: Date.now(),
                // Pushing other local info if newer (e.g. metadata)
                lastTaskDate: cachedUser.lastTaskDate || remoteData.lastTaskDate || null
            };

            // Update remote Firebase database
            await userDoc.ref.update(firebaseUpdates);

            // 3. Update local cache with synced values and latest remote fields (like plan)
            const finalSyncedUser = {
                ...cachedUser,
                ...firebaseUpdates,
                plan: remoteData.plan || cachedUser.plan, // Plan upgrades happen on server
                isActive: remoteData.isActive !== false
            };

            this.cacheUser(finalSyncedUser);

            console.log('✓ User data successfully synced to Firebase');
            return finalSyncedUser;
        } catch (error) {
            console.error('✗ Sync user data error:', error.message);
            return null;
        }
    },

    async getGeminiKey(plan) {
        try {
            if (!db) return null;
            // Assuming keys are stored in a 'config' collection or 'secrets' document
            const configDoc = await db.collection('config').doc('api_keys').get();
            if (configDoc.exists) {
                const keys = configDoc.data();
                if (plan === 'free') return keys.gemini_free;
                // Pro/Master might use a different key or the same
                return keys.gemini_pro || keys.gemini_free;
            }
            return null;
        } catch (error) {
            console.error('Get API key error:', error);
            return null;
        }
    },

    clearCachedUser() {
        try {
            const cacheFile = getCacheFile();
            if (fs.existsSync(cacheFile)) {
                fs.unlinkSync(cacheFile);
                console.log('Cached user cleared');
            }
        } catch (error) {
            console.error('Error clearing cached user:', error);
        }
    },

    /**
     * Fetch API keys from Firebase and cache them locally.
     * Checks local cache first.
     */
    async fetchAndCacheKeys() {
        let cachedKeys = null;
        const keysCacheFile = getKeysCacheFile();
        try {
            // 1. Load from local cache first for immediate availability
            if (fs.existsSync(keysCacheFile)) {
                const data = fs.readFileSync(keysCacheFile, 'utf8');
                cachedKeys = JSON.parse(data);
                console.log('✓ API keys loaded from local cache');
            }

            // 2. Try to check with the database to see if they changed
            if (!db) {
                console.warn('! Firebase not initialized, returning cached keys if any');
                return cachedKeys;
            }

            console.log('Checking for updated API keys from Firebase...');
            // Set a timeout for the Firebase request to avoid hanging on poor connection
            const configDoc = await Promise.race([
                db.collection('config').doc('api_keys').get(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase timeout')), 5000))
            ]);

            if (configDoc.exists) {
                const remoteKeys = configDoc.data();
                const keysToCache = {
                    gemini: remoteKeys.gemini_free || remoteKeys.gemini,
                    porcupine: remoteKeys.porcupine_access_key || remoteKeys.porcupine,
                    gemini_model: remoteKeys.gemini_model || "gemini-2.0-flash"
                };

                if (keysToCache.gemini && keysToCache.porcupine) {
                    // Check if they are different from cached
                    const keysChanged = !cachedKeys ||
                        cachedKeys.gemini !== keysToCache.gemini ||
                        cachedKeys.porcupine !== keysToCache.porcupine ||
                        cachedKeys.gemini_model !== keysToCache.gemini_model;

                    if (keysChanged) {
                        // 3. Update local cache
                        fs.writeFileSync(keysCacheFile, JSON.stringify(keysToCache));
                        console.log('✓ API keys updated from Firebase and cached locally');
                    } else {
                        console.log('✓ Local keys are up to date with Firebase');
                    }
                    return keysToCache;
                }
            }

            console.log('! No newer keys found in Firebase, using cache');
            return cachedKeys;
        } catch (error) {
            console.error('✗ Error checking remote keys:', error.message, '- Using cache');
            return cachedKeys;
        }
    },

    /**
     * Get API keys from local cache.
     */
    getKeys() {
        try {
            const keysCacheFile = getKeysCacheFile();
            if (fs.existsSync(keysCacheFile)) {
                const data = fs.readFileSync(keysCacheFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('Error reading keys cache:', e);
        }
        return null;
    }
};