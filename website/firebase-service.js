// Firebase Configuration - Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDSdp2kTxfS1YYxneulH7JeobGbHOdsjgc",
  authDomain: "control-rebuild.firebaseapp.com",
  projectId: "control-rebuild",
  storageBucket: "control-rebuild.firebasestorage.app",
  messagingSenderId: "978116999118",
  appId: "1:978116999118:web:924c440301d9d30adcdd9f",
  measurementId: "G-NLFSE2CG06"
};

// Mock Firebase SDK implementation
// In production, replace this with actual Firebase SDK imports
class MockFirebase {
    constructor() {
        this.firestore = new MockFirestore();
        this.auth = new MockAuth();
    }
}

class MockFirestore {
    constructor() {
        this.collections = new Map();
        this.initData();
    }

    initData() {
        // Initialize with some sample users
        const users = [
            {
                id: 'demo-user-1234-abcd-5678-efgh',
                name: 'Demo User',
                email: 'demo@example.com',
                plan: 'Pro Plan',
                memberSince: 'Oct 2023',
                tasksCompleted: 247,
                hoursSaved: 12.5,
                successRate: 98,
                password: 'hashed_demo_password',
                passwordLastChanged: new Date('2023-10-15'),
                createdAt: new Date('2023-10-01'),
                isActive: true
            },
            {
                id: 'test-user-9876-wxyz-4321-stuv',
                name: 'Test User',
                email: 'test@example.com',
                plan: 'Free Plan',
                memberSince: 'Nov 2023',
                tasksCompleted: 45,
                hoursSaved: 2.3,
                successRate: 92,
                password: 'hashed_test_password',
                passwordLastChanged: new Date('2023-11-10'),
                createdAt: new Date('2023-11-01'),
                isActive: true
            }
        ];

        const usersCollection = users.map(user => ({
            id: user.id,
            data: () => ({ ...user }),
            ...user
        }));

        this.collections.set('users', usersCollection);
    }

    collection(name) {
        return new MockCollection(this.collections.get(name) || []);
    }
}

class MockCollection {
    constructor(data) {
        this.data = data;
    }

    where(field, operator, value) {
        const filtered = this.data.filter(item => {
            if (operator === '==') {
                return item[field] === value;
            } else if (operator === '>=') {
                return item[field] >= value;
            }
            return false;
        });
        return new MockCollection(filtered);
    }

    get() {
        return Promise.resolve({
            docs: this.data.map(item => ({
                id: item.id,
                data: () => ({ ...item })
            }))
        });
    }

    add(data) {
        const id = this.generateId();
        const newItem = { id, ...data };
        this.data.push(newItem);
        return Promise.resolve({ id });
    }

    doc(id) {
        const item = this.data.find(item => item.id === id);
        return new MockDocument(item, id);
    }

    generateId() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 24; i++) {
            if (i > 0 && i % 4 === 0) result += '-';
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}

class MockDocument {
    constructor(data, id) {
        this.data = data;
        this.id = id;
    }

    get() {
        if (this.data) {
            return Promise.resolve({
                exists: true,
                id: this.id,
                data: () => ({ ...this.data })
            });
        } else {
            return Promise.resolve({
                exists: false,
                id: this.id,
                data: () => ({})
            });
        }
    }

    set(data) {
        Object.assign(this.data, data);
        return Promise.resolve();
    }

    update(data) {
        Object.assign(this.data, data);
        return Promise.resolve();
    }

    delete() {
        const index = this.data.findIndex(item => item.id === this.id);
        if (index > -1) {
            this.data.splice(index, 1);
        }
        return Promise.resolve();
    }
}

class MockAuth {
    constructor() {
        this.currentUser = null;
    }

    signInWithEmailAndPassword(email, password) {
        // Mock authentication - always succeeds for demo
        return Promise.resolve({
            user: {
                uid: 'demo-user-1234-abcd-5678-efgh',
                email: email
            }
        });
    }

    createUserWithEmailAndPassword(email, password) {
        // Mock user creation
        return Promise.resolve({
            user: {
                uid: 'new-user-' + Date.now(),
                email: email
            }
        });
    }

    signOut() {
        this.currentUser = null;
        return Promise.resolve();
    }

    onAuthStateChanged(callback) {
        // Immediately call with no user (signed out)
        callback(null);
    }
}

// Initialize Firebase
const firebase = new MockFirebase();

// Export Firebase services
const db = firebase.firestore;
const auth = firebase.auth;

// Utility functions
export const db = db;
export const auth = auth;
export const firebase = firebase;

// User management functions
export async function getUserById(userId) {
    try {
        const doc = await db.collection('users').doc(userId).get();
        if (doc.exists) {
            return {
                success: true,
                user: doc.data()
            };
        } else {
            return {
                success: false,
                message: 'User not found'
            };
        }
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

export async function createUser(userData) {
    try {
        const docRef = await db.collection('users').add({
            ...userData,
            createdAt: new Date(),
            isActive: true
        });
        
        return {
            success: true,
            userId: docRef.id
        };
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

export async function updateUser(userId, updateData) {
    try {
        await db.collection('users').doc(userId).update({
            ...updateData,
            updatedAt: new Date()
        });
        
        return {
            success: true
        };
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

export async function authenticateUser(userId) {
    try {
        const result = await getUserById(userId);
        return result;
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

export function generateUserId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 24; i++) {
        if (i > 0 && i % 4 === 0) result += '-';
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}