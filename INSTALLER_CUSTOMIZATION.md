# NSIS Installer Customization Guide

The application uses `electron-builder` with the `nsis` target to create the Windows installer. You can customize the installer by modifying the `build` section in `package.json`.

## Current Configuration
```json
"nsis": {
  "oneClick": false,
  "perMachine": false,
  "allowToChangeInstallationDirectory": true,
  "deleteAppDataOnUninstall": false,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true
}
```

## How to Customize

### 1. Custom Splash Screen
To add a splash screen that shows while the installer is preparing, add the `installerHeader` and `installerSidebar` properties.
- **Header**: 150x57 px.
- **Sidebar**: 164x314 px.

```json
"nsis": {
  "installerHeader": "assets/installer/header.bmp",
  "installerSidebar": "assets/installer/sidebar.bmp",
  "installerHeaderIcon": "assets/icons/icon.ico"
}
```

### 2. Custom Images (Sidebar/Header)
You can use `installerSidebar` and `uninstallerSidebar` to set images for the left panel of the installer.
Images must be in `.bmp` format (24-bit).

### 3. Custom Scripting
For advanced customization (like custom pages, registry keys, or bundled dependencies), create a file named `installer.nsh` and include it:

```json
"nsis": {
  "include": "build/installer.nsh"
}
```

Example `installer.nsh`:
```nsis
!macro customHeader
  !system "echo Custom header macro called"
!macroend

!macro customInstall
  DetailPrint "Performing custom installation steps..."
  WriteRegStr HKLM "Software\Control" "InstallDir" "$INSTDIR"
!macroend
```

### 4. License Agreement
To add a license page, point to a `.txt` or `.rtf` file:
```json
"nsis": {
  "license": "assets/license.txt"
}
```

### 5. Multi-Language Support
You can enable multi-language support:
```json
"nsis": {
  "language": "1033", // English
  "multiLanguageInstaller": true
}
```

## Useful Tools
- **NSIS (Nullsoft Scriptable Install System)**: The engine behind the installer.
- **GIMP/Photoshop**: To create 24-bit `.bmp` images for the sidebar and header.
