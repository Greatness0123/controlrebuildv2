# Rate Limiting Implementation Plan

## Overview
Implement rate limiting based on user subscription plans (Free, Pro, Master) with task counters stored in Firebase.

## Plan Structure

### Subscription Tiers
- **Free**: 10 tasks per week
- **Pro**: 200 tasks per week  
- **Master**: Unlimited

### Implementation Steps

1. **Firebase Schema Update**
   - Add `taskCount` field to user documents
   - Add `taskResetDate` field to track weekly reset
   - Add `plan` field if not already present (free, pro, master)

2. **Settings UI**
   - Add subscription plan selector in settings
   - Display current plan and remaining tasks
   - Show task counter with progress bar
   - Add upgrade prompts when limit is reached

3. **Backend Rate Limiting**
   - Check task count before executing tasks
   - Increment counter after successful task execution
   - Reset counters weekly (on Monday 00:00 UTC)
   - Return error if limit exceeded

4. **Firebase Functions** (if using Cloud Functions)
   - Scheduled function to reset weekly counters
   - Function to check and update task counts

5. **Frontend Integration**
   - Display rate limit warnings
   - Show remaining tasks in UI
   - Block task execution when limit reached
   - Show upgrade modal when appropriate

## Code Locations

### Settings UI
- `src/renderer/settings-modal.html` - Add subscription section
- `src/renderer/settings-modal.js` - Handle plan selection and display

### Backend Checks
- `src/main/main.js` - Add rate limit check before task execution
- `src/main/firebase-service.js` - Add methods for task counting

### Firebase Schema
```javascript
{
  id: "123456789012",
  name: "User Name",
  email: "user@example.com",
  plan: "free", // or "pro" or "master"
  taskCount: 5,
  taskResetDate: "2024-01-15T00:00:00Z",
  isActive: true
}
```

## Implementation Priority
1. High: Basic rate limiting check
2. Medium: UI display of limits
3. Low: Weekly reset automation
4. Low: Upgrade prompts

