# Pushing Updates Guide (Electron Updater)

This guide explains how to use `electron-updater` to push updates to your users.

## Prerequisites
1.  **Code Signing**: You must sign your application for auto-updates to work on Windows and macOS.
2.  **GitHub Token**: If using GitHub for hosting, you need a personal access token with `repo` scope.

## How to Push an Update

### 1. Update Version
Increment the version number in `package.json`:
```json
"version": "1.0.1"
```

### 2. Build and Publish
Run the following command to build and publish the release:
```bash
# Windows
set GH_TOKEN=your_github_token
npm run dist -- -p always

# Mac/Linux
export GH_TOKEN=your_github_token
npm run dist -- -p always
```
This will:
-   Package the application.
-   Generate `latest.yml` (Windows) or `latest-mac.yml`.
-   Upload the binaries and `.yml` files to your GitHub Releases page as a draft.

### 3. Publish the Release
Go to your GitHub repository's "Releases" page and publish the draft release.

## How the App Checks for Updates
The application uses `electron-updater` to check for new versions on startup.

### Configuration in `package.json`:
```json
"build": {
  "publish": {
    "provider": "github",
    "owner": "your-username",
    "repo": "your-repo-name"
  }
}
```

### Implementation in Main Process:
Ensure `autoUpdater` is initialized in `main.js`:
```javascript
const { autoUpdater } = require("electron-updater");

app.on('ready', () => {
  autoUpdater.checkForUpdatesAndNotify();
});
```

## Manual Update Check
You can trigger a manual check via IPC if desired:
```javascript
ipcMain.handle('check-for-updates', () => {
  autoUpdater.checkForUpdates();
});
```

## Useful Events
You can listen to these events to show progress in the UI:
-   `update-available`: When a new version is found.
-   `download-progress`: During the download.
-   `update-downloaded`: When the update is ready to install.
