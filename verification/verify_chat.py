import os
from playwright.sync_api import sync_playwright

def verify_chat_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Get absolute path to the html file
        file_path = os.path.abspath("src/renderer/chat-window.html")
        page.goto(f"file://{file_path}")

        # Mock what's missing in browser env
        page.evaluate('''() => {
            window.chatAPI = {
                onAIResponse: (cb) => { window.aiResponseCb = cb; },
                onActionStart: () => {},
                onActionComplete: () => {},
                onActionStep: () => {},
                onTaskStart: () => {},
                onTaskComplete: () => {},
                onTaskStopped: () => {},
                onBackendError: () => {},
                onWakeWordDetected: () => {},
                onSettingsUpdated: () => {},
                onUserDataUpdated: () => {},
                onUserChanged: () => {},
                onAudioStarted: () => {},
                onAudioStopped: () => {},
                onAfterMessage: () => {},
                onAppInitialized: () => {},
                getSettings: () => Promise.resolve({theme: 'light', borderStreakEnabled: true}),
                saveSettings: () => Promise.resolve({success: true}),
                isAppLocked: () => Promise.resolve({locked: false})
            };
        }''')

        # Wait for chatWindowInstance to be ready
        page.wait_for_function('window.chatWindowInstance !== undefined')

        # Add test messages
        page.evaluate('''() => {
            const chat = window.chatWindowInstance;
            chat.setMode('ask');
            // Mock dynamic greeting to avoid randomness in screenshot
            chat.getDynamicGreeting = () => "Hello, Test User!";
            chat.showWelcomeScreen();

            chat.addMessage('This is a test message with some padding and a code block below.', 'ai', false, null, true);
            chat.addCodeMessage('def hello():\\n    print("Hello World")', 'python');
        }''')

        # Wait for rendering
        page.wait_for_timeout(2000)

        # Set viewport to mobile-ish size
        page.set_viewport_size({"width": 360, "height": 600})

        # Take screenshot
        os.makedirs("verification", exist_ok=True)
        page.screenshot(path="verification/chat_verification.png")
        browser.close()

if __name__ == "__main__":
    verify_chat_ui()
