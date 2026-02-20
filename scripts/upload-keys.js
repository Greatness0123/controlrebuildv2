/**
 * Utility script to upload API keys to Firebase config/api_keys
 * Supports uploading multiple Gemini and OpenRouter API keys for rotation.
 *
 * Interactive version - prompts for input.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

async function uploadKeys() {
    console.log('\n--- Control API Key Uploader ---\n');

    try {
        const serviceAccountPath = path.join(__dirname, '../src/config/firebase-service-account.json');
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(`Service account file not found at ${serviceAccountPath}. Please ensure it exists in src/config/`);
        }

        const serviceAccount = require(serviceAccountPath);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        const db = admin.firestore();
        console.log('✓ Firebase initialized');

        // 1. Porcupine Key
        const porcupineKey = await ask('Enter Porcupine Access Key (current system key): ');

        // 2. Gemini Model
        const geminiModel = await ask('Enter Gemini Model Name (default: gemini-2.0-flash): ') || 'gemini-2.0-flash';

        // 3. Gemini Keys
        const geminiKeysInput = await ask('Enter Gemini API Keys (comma-separated): ');
        const geminiKeys = geminiKeysInput.split(',').map(k => k.trim()).filter(k => k);

        if (geminiKeys.length === 0) {
            console.warn('! No Gemini keys provided. Skipping Gemini update.');
        }

        // 4. OpenRouter Keys
        const orKeysInput = await ask('Enter OpenRouter API Keys (comma-separated, optional): ');
        const orKeys = orKeysInput.split(',').map(k => k.trim()).filter(k => k);

        console.log('\n--- Summary ---');
        if (porcupineKey) console.log(`Porcupine Key: ${porcupineKey.substring(0, 5)}...`);
        console.log(`Gemini Model: ${geminiModel}`);
        console.log(`Gemini Keys: ${geminiKeys.length} keys`);
        console.log(`OpenRouter Keys: ${orKeys.length} keys`);

        const confirm = await ask('\nProceed with upload? (y/n): ');
        if (confirm.toLowerCase() !== 'y') {
            console.log('Aborted.');
            process.exit(0);
        }

        console.log('\nUploading to config/api_keys...');

        const dataToUpload = {
            updatedAt: new Date().toISOString()
        };

        if (porcupineKey) {
            dataToUpload.porcupine = porcupineKey;
            dataToUpload.porcupine_access_key = porcupineKey;
        }

        if (geminiModel) {
            dataToUpload.gemini_model = geminiModel;
        }

        if (geminiKeys.length > 0) {
            dataToUpload.gemini_keys = geminiKeys;
            dataToUpload.gemini = geminiKeys[0];
            dataToUpload.gemini_free = geminiKeys[0];
        }

        if (orKeys.length > 0) {
            dataToUpload.openrouter_keys = orKeys;
        }

        await db.collection('config').doc('api_keys').set(dataToUpload, { merge: true });

        console.log('\n✓ API keys uploaded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n✗ Failed to upload keys:', error.message);
        process.exit(1);
    }
}

uploadKeys();
