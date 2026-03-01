import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1000, 'height': 800})

        # Load the chat window
        import os
        file_path = "file://" + os.path.abspath("src/renderer/chat-window.html")
        await page.goto(file_path)

        # Enable dark mode to see if it affects anything
        await page.evaluate("document.body.classList.add('dark-mode')")

        # Type a slash command with arguments
        await page.fill('#chatInput', '/test some arguments')
        await asyncio.sleep(0.5)

        # Take screenshot of the input area
        await page.locator('.input-container').screenshot(path='highlight_check.png')

        # Also check the innerHTML of backdrop
        backdrop_html = await page.inner_html('#inputBackdrop')
        print(f"Backdrop HTML: {backdrop_html}")

        await browser.close()

asyncio.run(run())
