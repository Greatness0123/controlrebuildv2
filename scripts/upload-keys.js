/**
 * Utility script to upload API keys to Firebase config/api_keys
 * Usage: node upload-keys.js <gemini_key> <porcupine_key>
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

async function uploadKeys() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node upload-keys.js <gemini_key> <porcupine_key>');
        process.exit(1);
    }

    const geminiKey = args[0];
    const porcupineKey = args[1];

    // Initialize Firebase
    try {
        const serviceAccountPath = path.join(__dirname, '../src/config/firebase-service-account.json');
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(`Service account file not found at ${serviceAccountPath}`);
        }

        const serviceAccount = require(serviceAccountPath);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        const db = admin.firestore();
        console.log('✓ Firebase initialized');

        console.log('Uploading keys to config/api_keys...');
        await db.collection('config').doc('api_keys').set({
            gemini: geminiKey,
            gemini_free: geminiKey,
            porcupine: porcupineKey,
            porcupine_access_key: porcupineKey,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        console.log('✓ API keys uploaded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('✗ Failed to upload keys:', error.message);
        process.exit(1);
    }
}

uploadKeys();
