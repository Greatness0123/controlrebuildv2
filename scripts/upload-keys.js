/**
 * Utility script to upload API keys to Firebase config/api_keys
 * Supports uploading multiple Gemini API keys for rotation.
 *
 * Usage:
 * node upload-keys.js <porcupine_key> <gemini_model> <gemini_key1> <gemini_key2> ...
 *
 * Example:
 * node upload-keys.js YOUR_PORCUPINE_KEY gemini-2.0-flash KEY1 KEY2 KEY3 KEY4 KEY5
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

async function uploadKeys() {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.error('Usage: node upload-keys.js <porcupine_key> <gemini_model> <gemini_key1> [gemini_key2] ...');
        console.log('You must provide at least one Porcupine key, a model name, and one or more Gemini keys.');
        process.exit(1);
    }

    const porcupineKey = args[0];
    const geminiModel = args[1];
    const geminiKeys = args.slice(2);

    console.log(`Porcupine Key: ${porcupineKey.substring(0, 5)}...`);
    console.log(`Gemini Model: ${geminiModel}`);
    console.log(`Gemini Keys: ${geminiKeys.length} keys provided`);

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

        const dataToUpload = {
            porcupine: porcupineKey,
            porcupine_access_key: porcupineKey,
            gemini_model: geminiModel,
            gemini_keys: geminiKeys,
            // Keep legacy fields for compatibility during transition
            gemini: geminiKeys[0],
            gemini_free: geminiKeys[0],
            updatedAt: new Date().toISOString()
        };

        await db.collection('config').doc('api_keys').set(dataToUpload, { merge: true });

        console.log('✓ API keys uploaded successfully!');
        console.log(`Uploaded ${geminiKeys.length} Gemini keys to 'gemini_keys' array.`);
        process.exit(0);
    } catch (error) {
        console.error('✗ Failed to upload keys:', error.message);
        process.exit(1);
    }
}

uploadKeys();
