try {
    require('./src/main/backends/ask-backend.js');
    console.log("ask-backend.js LOAD SUCCESS");
} catch (e) {
    console.error("ask-backend.js LOAD FAILED:");
    console.error(e);
    process.exit(1);
}
