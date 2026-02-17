const ActBackend = require('./src/main/backends/act-backend');
const { screen } = require('electron');

async function test() {
    const act = new ActBackend();

    // Mock screenSize and offsets
    act.screenSize = {
        width: 1920,
        height: 1080,
        x: 0,
        y: 0
    };

    const action = {
        action: 'click',
        parameters: {
            box2d: [100, 100, 200, 200], // Center at (150, 150) normalized
            label: 'test button',
            confidence: 99
        }
    };

    console.log("Testing coordinate conversion with center (150, 150) on 1920x1080 screen...");
    // We need to mock mouse if we don't want it to actually move or if we are in headless env
    // But for verification, we can just check the result message

    const result = await act.executeAction(action, () => {});
    console.log("Result:", result.message);

    // Expected center: 150 / 1000 * 1920 = 0.15 * 1920 = 288
    // Expected message: click at (288, 162) [test button] with 99% confidence
    // (150/1000 * 1080 = 0.15 * 1080 = 162)

    if (result.message.includes("at (288, 162)")) {
        console.log("SUCCESS: Coordinates match expected values.");
    } else {
        console.log("FAILURE: Coordinates do not match expected values.");
    }

    // Test with offset
    act.screenSize.x = 1000;
    act.screenSize.y = 500;
    const result2 = await act.executeAction(action, () => {});
    console.log("Result with offset (1000, 500):", result2.message);
    // Expected: 1000 + 288 = 1288, 500 + 162 = 662
    if (result2.message.includes("at (1288, 662)")) {
        console.log("SUCCESS: Coordinates with offset match expected values.");
    } else {
        console.log("FAILURE: Coordinates with offset do not match expected values.");
    }
}

test().catch(console.error);
