const ActBackend = require('./src/main/backends/act-backend');
const AskBackend = require('./src/main/backends/ask-backend');
const WakewordHelper = require('./src/main/backends/wakeword-helper');

try {
    console.log("Initializing ActBackend...");
    const act = new ActBackend();
    console.log("✓ ActBackend initialized");

    console.log("Initializing AskBackend...");
    const ask = new AskBackend();
    console.log("✓ AskBackend initialized");

    console.log("Initializing WakewordHelper...");
    const wakeword = new WakewordHelper();
    console.log("✓ WakewordHelper initialized");

    console.log("ALL MODULES INITIALIZED SUCCESSFULLY");
} catch (err) {
    console.error("Initialization failed:", err);
    process.exit(1);
}
