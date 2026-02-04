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

const logToFile = (msg) => {
    try {
        const { app } = require('electron');
        const logPath = path.join(app.getPath('userData'), 'firebase.log');
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
    } catch (e) {}
};

let db = null;

// Initialize Firebase Admin SDK
try {
    const { app } = require('electron');
    const isPackaged = app ? app.isPackaged : !require("electron-is-dev");

    let serviceAccountPath;
    if (isPackaged) {
        // In production, look in extraResources or app data
        const searchPaths = [
            path.join(process.resourcesPath, 'config/firebase-service-account.json'),
            path.join(process.resourcesPath, 'firebase-service-account.json'),
            path.join(app.getPath('userData'), 'firebase-service-account.json'),
            path.join(app.getAppPath(), 'config/firebase-service-account.json'),
            path.join(app.getAppPath(), 'src/config/firebase-service-account.json'),
            path.join(path.dirname(app.getPath('exe')), 'resources', 'config', 'firebase-service-account.json'),
            path.join(path.dirname(app.getPath('exe')), 'resources', 'app/src/config/firebase-service-account.json'),
            // Aggressive search: look for it anywhere in the resources folder
            path.join(process.resourcesPath, 'app/src/config/firebase-service-account.json')
        ];

        logToFile(`Production search paths for service account: ${searchPaths.join('\n')}`);

        for (const p of searchPaths) {
            if (fs.existsSync(p)) {
                serviceAccountPath = p;
                logToFile(`✓ Found service account at: ${p}`);
                break;
            }
        }

        if (!serviceAccountPath) {
            logToFile(`✗ Could not find firebase-service-account.json. Checked: ${possiblePaths.join(', ')}`);
            console.error(`✗ Could not find firebase-service-account.json in any of the following paths: ${possiblePaths.join('\n')}`);
        }
    } else {
        serviceAccountPath = path.join(__dirname, '../config/firebase-service-account.json');
    }

    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
        console.log('Loading Firebase service account from:', serviceAccountPath);
        logToFile(`Loading service account from: ${serviceAccountPath}`);
        const serviceAccount = require(serviceAccountPath);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        db = admin.firestore();
        // Set settings for better connectivity in restricted environments
        db.settings({
            ignoreUndefinedProperties: true,
            ssl: true
        });

        console.log('✓ Firebase Admin SDK initialized');
        logToFile('✓ Firebase Admin SDK initialized');
    } else {
        throw new Error('Firebase service account file not found');
    }
} catch (error) {
    console.error('✗ Failed to initialize Firebase:', error.message);
    logToFile(`✗ Failed to initialize Firebase: ${error.message}`);
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
                console.error('✗ verifyEntryID: Database not initialized');
                logToFile('✗ verifyEntryID: Database not initialized');
                return {
                    success: false,
                    message: 'Database connection failed. Please check your internet or configuration.'
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
            // Add a timeout to prevent hanging on poor connection
            const snapshot = await Promise.race([
                usersRef.where('id', '==', normalizedId).get(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase connection timeout')), 10000))
            ]);

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
            let currentTokens = 0;
            let plan = 'free';
            const today = new Date().toISOString().split('T')[0];

            if (cachedUser && cachedUser.id === userId) {
                currentCount = cachedUser[`${mode}Count`] || 0;
                plan = cachedUser.plan || 'free';
                const dailyTokens = cachedUser.dailyTokenUsage || {};
                currentTokens = (dailyTokens[today] && dailyTokens[today].total) || 0;
            }

            // Try to get from Firebase if online
            if (db) {
                try {
                    const snapshot = await db.collection('users').where('id', '==', userId).get();
                    if (!snapshot.empty) {
                        const userData = snapshot.docs[0].data();
                        plan = userData.plan || 'free';
                        currentCount = userData[`${mode}Count`] || 0;

                        // Check daily token limit
                        const dailyTokens = userData.dailyTokenUsage || {};
                        currentTokens = (dailyTokens[today] && dailyTokens[today].total) || 0;

                        // Update local cache with Firebase data
                        if (cachedUser && cachedUser.id === userId) {
                            cachedUser[`${mode}Count`] = currentCount;
                            cachedUser.plan = plan;
                            cachedUser.dailyTokenUsage = dailyTokens;
                            this.cacheUser(cachedUser);
                        }
                    } else {
                        return { allowed: false, error: 'User profile not found' };
                    }
                } catch (firebaseError) {
                    console.log('Firebase offline, using cached data');
                    if (cachedUser && cachedUser.id === userId) {
                        currentCount = cachedUser[`${mode}Count`] || 0;
                        plan = cachedUser.plan || 'free';
                        const dailyTokens = cachedUser.dailyTokenUsage || {};
                        currentTokens = (dailyTokens[today] && dailyTokens[today].total) || 0;
                    }
                }
            } else if (cachedUser && cachedUser.id === userId) {
                currentCount = cachedUser[`${mode}Count`] || 0;
                plan = cachedUser.plan || 'free';
                const dailyTokens = cachedUser.dailyTokenUsage || {};
                currentTokens = (dailyTokens[today] && dailyTokens[today].total) || 0;
            }

            // Define limits
            const limits = {
                free: { act: 10, ask: 20, tokens: 200000 },
                pro: { act: 200, ask: 300, tokens: 2000000 },
                master: { act: Infinity, ask: Infinity, tokens: Infinity }
            };

            const normalizedPlan = String(plan).toLowerCase().replace(/\s*plan\s*/gi, '').trim() || 'free';
            const userLimit = limits[normalizedPlan] || limits.free;

            // 1. Check task limit
            const limit = userLimit[mode];
            if (currentCount >= limit) {
                return {
                    allowed: false,
                    error: `Rate limit exceeded for ${mode} tasks. Upgrade your plan.`
                };
            }

            // 2. Check daily token limit
            if (currentTokens >= userLimit.tokens) {
                return {
                    allowed: false,
                    error: `Daily token limit exceeded (${currentTokens}/${userLimit.tokens}). Please wait until tomorrow or upgrade.`
                };
            }

            return { allowed: true, plan, remaining: limit - currentCount, currentCount, tokenUsage: currentTokens };
        } catch (error) {
            console.error('Rate limit check error:', error);
            return { allowed: true };
        }
    },

    async updateTokenUsage(userId, mode, usage) {
        try {
            if (!usage) return;
            const { promptTokenCount, candidatesTokenCount, totalTokenCount } = usage;
            const today = new Date().toISOString().split('T')[0];

            // Update local cache
            const cachedUser = this.checkCachedUser();
            if (cachedUser && cachedUser.id === userId) {
                // Total usage
                cachedUser.tokenUsage = cachedUser.tokenUsage || { ask: { prompt: 0, candidates: 0, total: 0 }, act: { prompt: 0, candidates: 0, total: 0 } };
                const mUsage = cachedUser.tokenUsage[mode] || { prompt: 0, candidates: 0, total: 0 };
                mUsage.prompt += promptTokenCount || 0;
                mUsage.candidates += candidatesTokenCount || 0;
                mUsage.total += totalTokenCount || 0;
                cachedUser.tokenUsage[mode] = mUsage;

                // Daily usage
                cachedUser.dailyTokenUsage = cachedUser.dailyTokenUsage || {};
                const dUsage = cachedUser.dailyTokenUsage[today] || { prompt: 0, candidates: 0, total: 0 };
                dUsage.prompt += promptTokenCount || 0;
                dUsage.candidates += candidatesTokenCount || 0;
                dUsage.total += totalTokenCount || 0;
                cachedUser.dailyTokenUsage[today] = dUsage;

                this.cacheUser(cachedUser);
            }

            // Update Firebase
            if (db) {
                try {
                    const snapshot = await db.collection('users').where('id', '==', userId).get();
                    if (!snapshot.empty) {
                        const docRef = snapshot.docs[0].ref;
                        const totalPrefix = `tokenUsage.${mode}`;
                        const dailyPrefix = `dailyTokenUsage.${today}`;

                        await docRef.update({
                            [`${totalPrefix}.prompt`]: admin.firestore.FieldValue.increment(promptTokenCount || 0),
                            [`${totalPrefix}.candidates`]: admin.firestore.FieldValue.increment(candidatesTokenCount || 0),
                            [`${totalPrefix}.total`]: admin.firestore.FieldValue.increment(totalTokenCount || 0),
                            [`${dailyPrefix}.prompt`]: admin.firestore.FieldValue.increment(promptTokenCount || 0),
                            [`${dailyPrefix}.candidates`]: admin.firestore.FieldValue.increment(candidatesTokenCount || 0),
                            [`${dailyPrefix}.total`]: admin.firestore.FieldValue.increment(totalTokenCount || 0),
                            lastTokenUpdate: new Date().toISOString()
                        });
                        console.log(`✓ Firebase token usage updated for ${mode}`);
                    }
                } catch (firebaseError) {
                    console.error('Firebase token update failed:', firebaseError.message);
                }
            }
        } catch (error) {
            console.error('Update token usage error:', error);
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
            console.log('Remote user data keys present:', {
                picovoiceKey: !!remoteData.picovoiceKey,
                porcupine_access_key: !!remoteData.porcupine_access_key
            });

            const finalSyncedUser = {
                ...cachedUser,
                ...firebaseUpdates,
                plan: remoteData.plan || cachedUser.plan, // Plan upgrades happen on server
                isActive: remoteData.isActive !== false,
                picovoiceKey: remoteData.picovoiceKey || cachedUser.picovoiceKey || null,
                porcupine_access_key: remoteData.porcupine_access_key || cachedUser.porcupine_access_key || null
            };

            this.cacheUser(finalSyncedUser);
            console.log('✓ User data successfully synced to Firebase (cached includes picovoiceKey=', !!finalSyncedUser.picovoiceKey, ', porcupine_access_key=', !!finalSyncedUser.porcupine_access_key, ')');
            return finalSyncedUser;
        } catch (error) {
            console.error('✗ Sync user data error:', error.message);
            return null;
        }
    },

    async getGeminiKey(plan) {
        try {
            if (!db) {
                const cachedKeys = this.getKeys();
                return (cachedKeys && cachedKeys.gemini) || null;
            }
            // Assuming keys are stored in a 'config' collection or 'secrets' document
            const configDoc = await Promise.race([
                db.collection('config').doc('api_keys').get(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase key fetch timeout')), 5000))
            ]);
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
                new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase timeout')), 15000))
            ]);

            if (configDoc.exists) {
                const remoteKeys = configDoc.data();

                // Handle multiple keys
                const geminiKeys = remoteKeys.gemini_keys || [remoteKeys.gemini_free || remoteKeys.gemini];
                const currentIndex = cachedKeys && cachedKeys.rotationIndex !== undefined ? cachedKeys.rotationIndex : 0;

                const keysToCache = {
                    gemini_keys: geminiKeys,
                    gemini: geminiKeys[currentIndex % geminiKeys.length],
                    rotationIndex: currentIndex % geminiKeys.length,
                    gemini_model: remoteKeys.gemini_model || "gemini-2.5-flash"
                };

                if (keysToCache.gemini) {
                    const keysChanged = !cachedKeys ||
                        JSON.stringify(cachedKeys.gemini_keys) !== JSON.stringify(keysToCache.gemini_keys) ||
                        cachedKeys.gemini_model !== keysToCache.gemini_model;

                    if (keysChanged) {
                        fs.writeFileSync(keysCacheFile, JSON.stringify(keysToCache));
                        console.log(`✓ API keys updated from Firebase. Total Gemini keys: ${geminiKeys.length}`);
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
    },

    /**
     * Rotate to the next Gemini API key in the cached list.
     */
    rotateGeminiKey() {
        try {
            const keys = this.getKeys();
            if (keys && keys.gemini_keys && keys.gemini_keys.length > 1) {
                const newIndex = (keys.rotationIndex + 1) % keys.gemini_keys.length;
                keys.rotationIndex = newIndex;
                keys.gemini = keys.gemini_keys[newIndex];

                const keysCacheFile = getKeysCacheFile();
                fs.writeFileSync(keysCacheFile, JSON.stringify(keys));
                console.log(`✓ Gemini API key rotated to index ${newIndex} (Key: ${keys.gemini.substring(0, 5)}...)`);
                return keys.gemini;
            }
        } catch (e) {
            console.error('Error rotating Gemini key:', e);
        }
        return null;
    }
};