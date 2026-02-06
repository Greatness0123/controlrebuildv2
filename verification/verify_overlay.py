from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1920, "height": 1080})

        # Load the local HTML file
        file_path = os.path.abspath("src/renderer/main-overlay.html")
        page.goto(f"file://{file_path}")

        # Simulate edge glow active
        page.evaluate("document.getElementById('edgeGlow').classList.add('active')")

        # Take a screenshot
        page.screenshot(path="verification/overlay_glow.png")

        browser.close()

if __name__ == "__main__":
    run()
