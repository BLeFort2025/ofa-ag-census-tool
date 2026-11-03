import time
import subprocess
import os
from playwright.sync_api import sync_playwright

ART_DIR = "C:/Users/ben.lefort/.gemini/antigravity/brain/23b428a3-5d13-4e1a-9b57-721583ddcbae"
os.makedirs(ART_DIR, exist_ok=True)

print("Starting Vite preview server on port 5173...")
proc = subprocess.Popen(
    ["npm.cmd", "run", "preview", "--", "--port", "5173"],
    cwd="c:/Projects/Census Tool",
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)

time.sleep(3)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1600, "height": 900}, device_scale_factor=1.5)
        page = context.new_page()

        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))

        print("Navigating to http://localhost:5173 ...")
        page.goto("http://localhost:5173", wait_until="networkidle", timeout=30000)
        time.sleep(2.5)

        # 1. Ag Snapshot (Ontario default)
        page.screenshot(path=f"{ART_DIR}/ofa_01_snapshot_ontario.png")
        print("Captured ofa_01_snapshot_ontario.png")

        # Click 'Huron County' in Quick Benchmark Geographies bar
        page.get_by_role("button", name="Huron County").click()
        time.sleep(1.5)
        page.screenshot(path=f"{ART_DIR}/ofa_01b_snapshot_huron.png")
        print("Captured ofa_01b_snapshot_huron.png")

        # Click 'Click here to show map'
        page.get_by_role("button", name="Click here to show map", exact=True).click()
        time.sleep(2.5)
        page.screenshot(path=f"{ART_DIR}/ofa_01c_snapshot_map_modal.png")
        print("Captured ofa_01c_snapshot_map_modal.png")
        page.get_by_role("button", name="Click here to hide map ✕").click()
        time.sleep(0.5)

        # 2. Ag Explorer
        page.locator("aside nav button").nth(1).click()
        time.sleep(1.5)
        page.screenshot(path=f"{ART_DIR}/ofa_02_explorer_bars.png")
        print("Captured ofa_02_explorer_bars.png")

        # Switch Ag Explorer to Multi-Census Historical Trend view
        page.locator("button[title='Multi-Census Historical Time-Series (1976-2021)']").click()
        time.sleep(1.0)
        page.screenshot(path=f"{ART_DIR}/ofa_02b_explorer_historical.png")
        print("Captured ofa_02b_explorer_historical.png")

        # 3. Ag Drilldown
        page.locator("aside nav button").nth(2).click()
        time.sleep(2.5)
        page.screenshot(path=f"{ART_DIR}/ofa_03_drilldown.png")
        print("Captured ofa_03_drilldown.png")

        # 4. Ag Compare (Perth County vs Huron County)
        page.locator("aside nav button").nth(3).click()
        time.sleep(1.5)
        page.screenshot(path=f"{ART_DIR}/ofa_04_compare.png")
        print("Captured ofa_04_compare.png")

        # 5. Ag Ranker
        page.locator("aside nav button").nth(4).click()
        time.sleep(2.5)
        page.screenshot(path=f"{ART_DIR}/ofa_05_ranker.png")
        print("Captured ofa_05_ranker.png")

        # 6. AgScore
        page.locator("aside nav button").nth(5).click()
        time.sleep(2.5)
        page.screenshot(path=f"{ART_DIR}/ofa_06_agscore.png")
        print("Captured ofa_06_agscore.png")

        # 7. GeoLocator
        page.locator("aside nav button").nth(6).click()
        time.sleep(2.0)
        page.screenshot(path=f"{ART_DIR}/ofa_07_geolocator.png")
        print("Captured ofa_07_geolocator.png")

        # 8. AI Policy Summary Drawer on Snapshot
        page.locator("aside nav button").nth(0).click()
        time.sleep(1.0)
        page.get_by_role("button", name="✦ AI Policy Brief").click()
        time.sleep(1.0)
        page.screenshot(path=f"{ART_DIR}/ofa_08_ai_policy_brief.png")
        print("Captured ofa_08_ai_policy_brief.png")

        print("Page errors:", errors)
        browser.close()
finally:
    proc.terminate()
    print("Verification complete!")
