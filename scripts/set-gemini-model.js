/**
 * Utility script to update the Gemini model in Firebase config/api_keys
 * Interactive version.
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

async function setModel() {
    console.log('\n--- Control Model Updater ---\n');

    const modelName = await ask('Enter new Gemini Model Name (e.g. gemini-2.0-flash): ');
    if (!modelName) {
        console.log('No model name entered. Aborted.');
        process.exit(0);
    }

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
        console.error('\n✗ Failed to update model:', error.message);
        process.exit(1);
    }
}

setModel();
