# Rate Limiting Implementation Plan

## Overview
Implement rate limiting based on user subscription plans (Free, Pro, Master) to manage resource usage. Provide visual feedback via a progress bar in the status area.

## Plan Structure

### Subscription Tiers & Limits
| Plan   | Act Tasks | Ask Tasks | Duration |
| :---   | :---      | :---      | :---     |
| **Free**   | 10/week       | 20/week       | Weekly reset |
| **Pro**    | 200/week      | 300/week      | Weekly reset |
| **Master** | Unlimited (∞) | Unlimited (∞) | Monthly subscription |

> **Note:** Master plan provides unlimited access for the duration of the monthly subscription. The UI displays an infinity symbol (∞) for both Act and Ask modes.

### Implementation Details

#### 1. Data Storage (Firebase & Local)
- **Firebase**:
  - `users/{userId}`:
    - `plan`: "free", "pro", "master"
    - `actCount`: Integer
    - `askCount`: Integer
    - `lastTaskDate`: Timestamp
- **Local Cache**:
  - `cached_user.json` stores the user object including counts for offline checks.

#### 2. Backend Enforcement (Main Process)
- Before `execute-task`:
  1. Check User Plan.
  2. Check `actCount` or `askCount` against limits.
  3. If limit exceeded -> Block & Error.
  4. If allowed -> Execute -> Increment Count (in Firebase & Cache).
- **API Key Fetching**:
  - Fetch `gemini_api_key` from Firebase based on plan (Free vs Pro).
  - Fallback to environment variable if fetch fails.

#### 3. Frontend UI (Chat Window)
- **Location**: Bottom status bar (replaces status text when idle).
- **Behavior**:
  - Show "Act Usage: X/Y" or "Ask Usage: X/Y" based on active toggle.
  - Progress bar visual.
  - Master plan shows Infinity symbol `∞`.
  - Briefly show status messages (e.g. "Sending...", "Thinking...") then revert to usage counter after timeout.
- **Error Handling**:
  - "User profile not loaded" -> Error prompt -> Force sign-in.
  - "No plan detected" -> Error prompt.

#### 4. How to Update Limits
To change the usage limits, you must update the `limits` object in **TWO** locations to ensure consistency between enforcement and display:

1.  **Backend (Enforcement)**:
    - File: `src/main/firebase-service.js`
    - Function: `checkRateLimit`
    - Update the `limits` constant.

2.  **Frontend (Display)**:
    - File: `src/renderer/chat-window.js`
    - Function: `updateRateLimitDisplay`
    - Update the `limits` constant to match the backend.

3.  **Documentation**:
    - Update this file (`RATE_LIMITING_PLAN.md`) to reflect the new policy.

## Verification
- Test Free plan limit (set count to 9, run 1 task, try next).
- Test Mode switching updates counter type.
- Test Offline mode (uses cached counts).


