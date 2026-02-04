# Token Limits Guide

This guide explains how the daily token limits work and how you can customize them.

## How it works
The application tracks token usage for each user and stores it in Firebase Firestore.
Limits are applied per plan (Free, Pro, Master) and checked before every task execution.

## Customizing Limits
To change the token limits, you need to modify the `checkRateLimit` function in `src/main/firebase-service.js`.

### Location:
`src/main/backends/firebase-service.js` (around line 380)

### Code to change:
```javascript
// Define limits
const limits = {
    free: {
        act: 10,           // Daily task limit for ACT mode
        ask: 20,           // Daily task limit for ASK mode
        tokens: 200000     // DAILY total token limit (prompt + completion)
    },
    pro: {
        act: 200,
        ask: 300,
        tokens: 2000000
    },
    master: {
        act: Infinity,
        ask: Infinity,
        tokens: Infinity
    }
};
```

## Token Tracking
The application tracks the following metrics:
- `promptTokenCount`: Tokens sent to the AI.
- `candidatesTokenCount`: Tokens received from the AI.
- `totalTokenCount`: Sum of the above.

These are stored in the user's document under:
- `tokenUsage.ask`: Lifetime total for Ask mode.
- `tokenUsage.act`: Lifetime total for Act mode.
- `dailyTokenUsage.YYYY-MM-DD`: Usage for a specific day.

## Viewing Usage
Usage is displayed in the Chat Window status bar as a progress bar (percentage of task limit) or token count.
