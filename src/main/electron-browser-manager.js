const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

class ElectronBrowserManager {
    constructor() {
        this.browserWindow = null;
        this.isVisible = false;
    }

    async ensureBrowser() {
        if (!this.browserWindow || this.browserWindow.isDestroyed()) {
            console.log('[ElectronBrowserManager] Launching browser window...');
            this.browserWindow = new BrowserWindow({
                width: 1280,
                height: 800,
                show: true, // User wants to see it
                title: 'Control Agentic Browser',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: true
                }
            });

            this.isVisible = true;

            this.browserWindow.on('closed', () => {
                console.log('[ElectronBrowserManager] Browser window closed');
                this.browserWindow = null;
                this.isVisible = false;
            });
        }
        return this.browserWindow;
    }

    async open(url) {
        const win = await this.ensureBrowser();
        console.log(`[ElectronBrowserManager] Navigating to: ${url}`);

        // Ensure URL has protocol
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }

        await win.loadURL(url);
        await this.injectBanner();
        return { success: true, url: win.webContents.getURL() };
    }

    async executeJs(script) {
        if (!this.browserWindow || this.browserWindow.isDestroyed()) {
            throw new Error('Browser not open');
        }
        console.log('[ElectronBrowserManager] Executing JS');
        const result = await this.browserWindow.webContents.executeJavaScript(script);
        return result;
    }

    async takeScreenshot() {
        if (!this.browserWindow || this.browserWindow.isDestroyed()) {
            throw new Error('Browser not open');
        }
        console.log('[ElectronBrowserManager] Taking screenshot via capturePage');
        const nativeImage = await this.browserWindow.webContents.capturePage();
        return nativeImage.toPNG();
    }

    async close() {
        if (this.browserWindow && !this.browserWindow.isDestroyed()) {
            console.log('[ElectronBrowserManager] Closing browser');
            this.browserWindow.close();
            this.browserWindow = null;
            this.isVisible = false;
        }
    }

    async getStatus() {
        if (!this.browserWindow || this.browserWindow.isDestroyed()) {
            return { success: false, message: 'Browser not open' };
        }
        return {
            success: true,
            url: this.browserWindow.webContents.getURL(),
            title: this.browserWindow.getTitle(),
            isVisible: this.isVisible
        };
    }

    async injectBanner() {
        if (!this.browserWindow || this.browserWindow.isDestroyed()) return;

        const bannerJS = `
            (function() {
                if (document.getElementById('control-agent-banner')) return;

                const style = document.createElement('style');
                style.textContent = \`
                    @keyframes banner-pulse {
                        0%, 100% { transform: translateX(-50%) scale(1); box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4); }
                        50% { transform: translateX(-50%) scale(1.02); box-shadow: 0 6px 20px rgba(124, 58, 237, 0.6); }
                    }
                \`;
                document.head.appendChild(style);

                const banner = document.createElement('div');
                banner.id = 'control-agent-banner';
                banner.style.cssText = 'position: fixed; top: 15px; left: 50%; transform: translateX(-50%); background: rgba(124, 58, 237, 0.8); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: white; padding: 6px 16px; font-size: 11px; font-weight: 800; border-radius: 30px; border: 1px solid rgba(255,255,255,0.3); z-index: 2147483647; pointer-events: none; letter-spacing: 1.2px; text-transform: uppercase; animation: banner-pulse 2s ease-in-out infinite; font-family: sans-serif;';
                banner.textContent = 'CONTROL IS USING THIS BROWSER (ELECTRON)';
                document.body.appendChild(banner);
            })();
        `;

        try {
            await this.browserWindow.webContents.executeJavaScript(bannerJS);
        } catch (e) {
            console.error('Failed to inject banner:', e);
        }
    }
}

module.exports = new ElectronBrowserManager();
