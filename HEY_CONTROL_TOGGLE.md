# How to Make "Hey Control" Toggle Chat

The wake word "Hey Control" can be configured to toggle the chat window. Here's how it works:

## Current Implementation

The wake word detection is handled by `wakeword_helper.py` which sends a `wakeword-detected` event to the Electron main process.

## To Enable Chat Toggle on Wake Word:

1. **In `src/main/main.js`**, the wake word handler is already set up:
   ```javascript
   ipcMain.on('wakeword-detected', () => {
       // This event is received from the Python wakeword helper
       this.windowManager.toggleWindow('chat');
   });
   ```

2. **The toggle functionality** is already implemented in `window-manager.js`:
   ```javascript
   toggleWindow(windowType) {
       const window = this.windows[windowType];
       if (window) {
           if (window.isVisible()) {
               window.hide();
           } else {
               window.show();
               window.focus();
           }
       }
   }
   ```

## Current Behavior

- When "Hey Control" is detected, it shows the chat window and focuses the input
- The chat window can be toggled with Ctrl+Space (keyboard shortcut)

## To Make Wake Word Toggle Instead of Just Show:

The current implementation in `chat-window.js` shows the chat on wake word. To make it toggle:

1. Modify `src/renderer/chat-window.js` in the `handleWakeWordDetection()` method:
   ```javascript
   handleWakeWordDetection() {
       if (window.chatAPI) {
           window.chatAPI.toggleChat(); // Use toggle instead of show
       }
   }
   ```

2. Ensure `toggleChat` is exposed in `src/preload/chat-preload.js`:
   ```javascript
   toggleChat: () => ipcRenderer.invoke('toggle-chat'),
   ```

3. Add the IPC handler in `src/main/main.js`:
   ```javascript
   ipcMain.handle('toggle-chat', () => {
       this.windowManager.toggleWindow('chat');
   });
   ```

## Alternative: Keep Current Behavior

The current implementation shows and focuses the chat, which is often preferred. The toggle behavior can be added as an option in settings if desired.
