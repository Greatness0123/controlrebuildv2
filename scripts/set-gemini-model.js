/**
 * Utility script to update the Gemini model in Firebase config/api_keys
 * Usage: node set-gemini-model.js <model_name>
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

async function setModel() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error('Usage: node set-gemini-model.js <model_name>');
        console.log('Example: node set-gemini-model.js gemini-2.0-flash');
        process.exit(1);
    }

    const modelName = args[0];

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

        console.log(`Updating Gemini model to: ${modelName}...`);
        await db.collection('config').doc('api_keys').set({
            gemini_model: modelName,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        console.log('✓ Gemini model updated successfully!');
        process.exit(0);
    } catch (error) {
        console.error('✗ Failed to update model:', error.message);
        process.exit(1);
    }
}

setModel();
