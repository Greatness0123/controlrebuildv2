# Developer Guide: Enabling Pro Features for Testing

This application restricts certain features (like OpenRouter integration and Wake Word detection) to Pro and Master plan users. If you are testing the application locally and appear as a "Free" user, you can bypass these restrictions using the following methods.

## Method 1: Modify local User Data

The application stores user information in the system's `userData` directory. You can manually edit this file to change your plan.

1. Locate the `userData` directory:
   - **Windows:** `%APPDATA%/control/`
   - **macOS:** `~/Library/Application Support/control/`
   - **Linux:** `~/.config/control/`

2. Open `settings.json` (or similar) and find the `userDetails` section.
3. Change the `"plan"` value from `"free"` to `"pro"` or `"master"`.

## Method 2: Use the Backend CLI

You can use the provided scripts to set your plan if you have access to the Firebase service account (for production syncing).

```bash
# Example (if implemented in your environment)
npm run set-plan -- --id YOUR_USER_ID --plan pro
```

## Method 3: Development Bypass

In `src/renderer/settings-modal.js`, the `isUserFreePlan()` method controls the UI restrictions. You can temporarily modify it to always return `false` during development:

```javascript
isUserFreePlan() {
    return false; // Force enable Pro features for testing
}
```

## Features restricted to Pro/Master:
- **OpenRouter Integration:** Use Claude 3.5 Sonnet, GPT-4o, and other top-tier models.
- **Voice Activation:** Enable the "Hey Control" wake word.
- **Edge Glow Effect:** Customize the visual feedback during Act mode.
- **Floating Button Control:** Toggle the visibility of the persistent overlay button.
