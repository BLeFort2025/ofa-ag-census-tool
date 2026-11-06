import time
import subprocess
import os
import shutil
from playwright.sync_api import sync_playwright

ART_DIR = "C:/Users/ben.lefort/.gemini/antigravity/brain/23b428a3-5d13-4e1a-9b57-721583ddcbae"
DOCS_IMG_DIR = "c:/Projects/Census Tool/docs/screenshots"
os.makedirs(ART_DIR, exist_ok=True)
os.makedirs(DOCS_IMG_DIR, exist_ok=True)


def save_shot(page, filename: str):
    p1 = f"{DOCS_IMG_DIR}/{filename}"
    p2 = f"{ART_DIR}/{filename}"
    page.screenshot(path=p1)
    shutil.copyfile(p1, p2)
    print(f"Captured {filename}")


print("Starting Vite preview server on port 5173...")
proc = subprocess.Popen(
    ["npm.cmd", "run", "preview", "--", "--port", "5173"],
    cwd="c:/Projects/Census Tool",
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)

time.sleep(3)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1600, "height": 920}, device_scale_factor=1.5
        )
        page = context.new_page()

        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))

        print("Navigating to http://localhost:5173 ...")
        page.goto("http://localhost:5173", wait_until="networkidle", timeout=30000)
        time.sleep(2.5)

        # 1. Module 01: Ag Snapshot (Ontario default)
        save_shot(page, "01_snapshot_ontario.png")

        # Click 'Click here to show map'
        map_btn = page.locator("button:has-text('Click here to show map')")
        if map_btn.count() > 0:
            map_btn.first.click()
            time.sleep(2.0)
            save_shot(page, "01b_snapshot_map_modal.png")
            hide_btn = page.locator("button:has-text('Click here to hide map')")
            if hide_btn.count() > 0:
                hide_btn.first.click()
                time.sleep(0.5)

        # 2. Module 02: Ag Explorer
        page.locator("aside nav button").nth(1).click()
        time.sleep(1.5)
        save_shot(page, "02_explorer_bars.png")

        hist_btn = page.locator(
            "button[title='Multi-Census Historical Time-Series (1976-2021)']"
        )
        if hist_btn.count() > 0:
            hist_btn.first.click()
            time.sleep(1.0)
            save_shot(page, "02b_explorer_historical.png")

        # 3. Module 03: Ag Drilldown
        page.locator("aside nav button").nth(2).click()
        time.sleep(2.0)
        save_shot(page, "03_drilldown.png")

        # 4. Module 04: Ag Compare
        page.locator("aside nav button").nth(3).click()
        time.sleep(2.0)
        save_shot(page, "04_compare.png")

        # 5. Module 05: Ag Ranker (show Acres filter & Canada-only map)
        page.locator("aside nav button").nth(4).click()
        time.sleep(2.0)
        acres_btn = page.locator("button:has-text('Acres')").first
        if acres_btn.count() > 0:
            acres_btn.click()
            time.sleep(1.5)
        save_shot(page, "05_ranker_acres.png")

        # 6. Module 06: Ag Belts & Cluster Maps Studio
        page.locator("aside nav button").nth(5).click()
        time.sleep(2.0)
        save_shot(page, "06_belts_dominant.png")

        heatmap_btn = page.locator("button:has-text('All-CD Heat Map')").first
        if heatmap_btn.count() > 0:
            heatmap_btn.click()
            time.sleep(1.5)
            save_shot(page, "06b_belts_heatmap.png")

        # 7. Module 07: AgScore
        page.locator("aside nav button").nth(6).click()
        time.sleep(2.0)
        save_shot(page, "07_agscore.png")

        # 8. Module 08: GeoSearch (Easy Area & Data Finder)
        page.locator("aside nav button").nth(7).click()
        time.sleep(1.5)
        save_shot(page, "08_geosearch.png")

        # 9. AI Policy Brief Drawer on Snapshot
        page.locator("aside nav button").nth(0).click()
        time.sleep(1.0)
        ai_btn = page.locator("button:has-text('AI Policy Brief')").first
        if ai_btn.count() > 0:
            ai_btn.click()
            time.sleep(1.0)
            save_shot(page, "10_ai_policy_brief.png")
            # Close AI Policy Brief drawer with Escape or backdrop click
            page.keyboard.press("Escape")
            time.sleep(0.5)

        # 10. Multi-Area PDF Report Builder Modal
        multi_btn = page.locator("button:has-text('Multi-Area PDF Report')").first
        if multi_btn.count() > 0:
            multi_btn.click()
            time.sleep(1.2)
            save_shot(page, "09_multi_area_report.png")

        print("Page errors:", errors)
        browser.close()
finally:
    proc.terminate()
    print("Screenshot capture and UI verification complete!")
