const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

class PlaywrightManager {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.isVisible = false;
    }

    async ensureBrowser() {
        if (!this.browser) {
            console.log('[PlaywrightManager] Launching browser...');
            this.browser = await chromium.launch({
                headless: false, // User wants to see it
                args: ['--start-maximized', '--window-name=Control Agentic Browser']
            });
            this.context = await this.browser.newContext({
                viewport: { width: 1280, height: 800 }
            });
            this.page = await this.context.newPage();
            this.isVisible = true;

            // Handle browser close
            this.page.on('close', () => {
                console.log('[PlaywrightManager] Page closed');
                this.isVisible = false;
                this.page = null;
                this.context = null;
                this.browser = null;
            });
        }
        return this.page;
    }

    async open(url) {
        const page = await this.ensureBrowser();
        console.log(`[PlaywrightManager] Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await this.injectBanner();
        return { success: true, url: page.url() };
    }

    async executeJs(script) {
        if (!this.page) throw new Error('Browser not open');
        console.log('[PlaywrightManager] Executing JS');
        const result = await this.page.evaluate(script);
        return result;
    }

    async takeScreenshot() {
        if (!this.page) throw new Error('Browser not open');
        console.log('[PlaywrightManager] Taking screenshot');
        const buffer = await this.page.screenshot();
        return buffer;
    }

    async close() {
        if (this.browser) {
            console.log('[PlaywrightManager] Closing browser');
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this.page = null;
            this.isVisible = false;
        }
    }

    async hide() {
        // Playwright doesn't have a direct "hide" without closing,
        // but we can minimize or just leave it.
        // For simplicity, we'll just close it if "close" action is called,
        // or we could try to use a specific window management tool if needed.
        // User asked to replace Electron browser which was hidden/shown.
        await this.close();
    }

    async getStatus() {
        if (!this.page) return { success: false, message: 'Browser not open' };
        return {
            success: true,
            url: this.page.url(),
            title: await this.page.title(),
            isVisible: this.isVisible
        };
    }

    async injectBanner() {
        if (!this.page) return;
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
                banner.textContent = 'CONTROL IS USING THIS BROWSER';
                document.body.appendChild(banner);
            })();
        `;
        await this.page.evaluate(bannerJS).catch(e => console.error('Failed to inject banner:', e));
    }
}

module.exports = new PlaywrightManager();
