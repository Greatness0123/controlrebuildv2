# How to Enable Restricted Features for Free Users

This guide explains how to enable Pro/Master features for the "Free Plan" in the Control application.

## Prerequisites

You need access to the source code of the application.

## 1. Enable OpenRouter and Model Selection

To allow Free users to use OpenRouter models, modify `src/renderer/settings-modal.js`.

**Find this block in `updateToggleStates()`:**

```javascript
// Disable OpenRouter for free users in dropdown
const openrouterOption = modelProvider.querySelector('option[value="openrouter"]');
if (openrouterOption) {
    if (isFreePlan) { // Change this to 'false'
        openrouterOption.disabled = true;
        openrouterOption.textContent = 'OpenRouter (PRO Only)';
    } else {
        openrouterOption.disabled = false;
        openrouterOption.textContent = 'OpenRouter (Pro/Master)';
    }
}
```

**Change `if (isFreePlan)` to `if (false)` or simply remove the check.**

Also, in the `modelProvider` event listener:

```javascript
document.getElementById('modelProvider')?.addEventListener('change', (e) => {
    const provider = e.target.value;
    if (provider === 'openrouter' && this.isUserFreePlan()) { // Change this condition
        // ...
    }
});
```

## 2. Enable Floating Button Control

In `src/renderer/settings-modal.js`, find where `floatingButtonToggle` is handled in `updateToggleStates()`:

```javascript
if (isFreePlan) { // Change to false
    floatingButtonToggle.style.pointerEvents = 'none';
    floatingButtonToggle.style.opacity = '0.5';
    this.addUpgradeNoteToSetting('floatingButtonToggle', 'Upgrade to PRO to control floating button');
}
```

## 3. Enable Voice Activation for Free Users

In `src/renderer/settings-modal.js`, find the `voiceToggle` handling in `updateToggleStates()`:

```javascript
// Disable interaction for free users
if (isFreePlan) { // Change to false
    voiceToggle.style.pointerEvents = 'none';
    voiceToggle.style.opacity = '0.5';
    this.addUpgradeNoteToSetting('voiceToggle', 'Upgrade to PRO to activate voice activation');
}
```

And in `toggleVoiceActivation()`:

```javascript
async toggleVoiceActivation() {
    const isFree = this.isUserFreePlan(); // Change to false
    if (isFree) {
        // ...
    }
}
```

## 4. General Rule

Most plan-based restrictions are checked using `this.isUserFreePlan()` or the `isFreePlan` variable in `settings-modal.js`. Search for these terms and set them to `false` to bypass the restrictions locally.

For server-side rate limits, you would need to modify the Firebase security rules or the plan definitions in `src/main/firebase-service.js`.

### Firebase Service Limits

In `src/main/firebase-service.js`, the `checkRateLimit` function defines the hard limits:

```javascript
const limits = {
    free: { act: 10, ask: 20, tokens: 200000 },
    pro: { act: 200, ask: 300, tokens: 2000000 },
    master: { act: Infinity, ask: Infinity, tokens: Infinity }
};
```

You can increase the numbers in the `free` object to grant more usage to free users.
