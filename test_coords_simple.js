const storageManager = {
    readPreferences: () => ({}),
    readLibraries: () => ([]),
    addLibrary: () => {}
};

class MockActBackend {
    constructor() {
        this.screenSize = { width: 1920, height: 1080, x: 0, y: 0 };
    }

    async executeAction(action) {
        const actionType = action.action.toLowerCase();
        const params = action.parameters || {};

        if (params.box2d && Array.isArray(params.box2d) && params.box2d.length === 4) {
            const [ymin, xmin, ymax, xmax] = params.box2d;
            const centerX = xmin + (xmax - xmin) / 2;
            const centerY = ymin + (ymax - ymin) / 2;

            const x = Math.round((centerX / 1000) * this.screenSize.width) + this.screenSize.x;
            const y = Math.round((centerY / 1000) * this.screenSize.height) + this.screenSize.y;

            return { success: true, message: `${actionType} at (${x}, ${y}) [${params.label || 'unlabeled'}] with ${params.confidence}% confidence` };
        }
        return { success: false, message: "Missing box2d" };
    }
}

async function test() {
    const act = new MockActBackend();

    const action = {
        action: 'click',
        parameters: {
            box2d: [100, 100, 200, 200], // Center at (150, 150) normalized
            label: 'test button',
            confidence: 99
        }
    };

    const result = await act.executeAction(action);
    console.log("Result:", result.message);
    if (result.message.includes("at (288, 162)")) {
        console.log("SUCCESS: Base coordinates correct.");
    } else {
        console.log("FAILURE: Base coordinates incorrect.");
    }

    act.screenSize.x = 1000;
    act.screenSize.y = 500;
    const result2 = await act.executeAction(action);
    console.log("Result with offset:", result2.message);
    if (result2.message.includes("at (1288, 662)")) {
        console.log("SUCCESS: Offset coordinates correct.");
    } else {
        console.log("FAILURE: Offset coordinates incorrect.");
    }
}

test();
