import os
import shutil
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).resolve().parent.parent
DOCS_IMG_DIR = PROJECT_DIR / "docs" / "screenshots"
ART_DIR_ENV = os.environ.get(
    "AGCENSUS_ARTIFACT_DIR",
    r"C:\Users\ben.lefort\.gemini\antigravity\brain\23b428a3-5d13-4e1a-9b57-721583ddcbae",
)
ART_DIR = Path(ART_DIR_ENV) if ART_DIR_ENV else None
DOCS_IMG_DIR.mkdir(parents=True, exist_ok=True)
if ART_DIR and ART_DIR.parent.exists():
    ART_DIR.mkdir(parents=True, exist_ok=True)


def save_shot(page, filename: str):
    p1 = DOCS_IMG_DIR / filename
    page.screenshot(path=str(p1))
    if ART_DIR and ART_DIR.exists():
        shutil.copyfile(str(p1), str(ART_DIR / filename))
    print(f"Captured {filename}")


print("Starting Vite preview server on port 5176...")
proc = subprocess.Popen(
    ["npm.cmd", "run", "preview", "--", "--port", "5176"],
    cwd=str(PROJECT_DIR),
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

        print("Navigating to http://localhost:5176 ...")
        page.goto("http://localhost:5176", wait_until="networkidle", timeout=30000)
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

        # 3. Module 03: Ag Drilldown — Mode 1 (Exact Joint Bounds) & Mode 2 (Cross-Tabulations)
        page.locator("aside nav button").nth(2).click()
        time.sleep(2.0)
        selects = page.locator("select")
        for i in range(selects.count()):
            sel = selects.nth(i)
            if sel.locator("option[value='rev_500k_plus']").count() > 0:
                sel.select_option("rev_500k_plus")
                break
        time.sleep(1.5)
        save_shot(page, "03_drilldown.png")

        xtab_btn = page.locator("button:has-text('Official StatCan Cross-Tabulations')").first
        if xtab_btn.count() > 0:
            xtab_btn.click()
            time.sleep(1.2)
            save_shot(page, "03b_drilldown_crosstabs.png")

        # 4. Module 04: Ag Compare
        page.locator("aside nav button").nth(3).click()
        time.sleep(2.0)
        match_btn = page.locator("button:has-text('Find Closest Match')").first
        if match_btn.count() > 0:
            match_btn.click()
            time.sleep(1.2)
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
            page.keyboard.press("Escape")
            time.sleep(0.5)

        # 10. Multi-Area PDF Report Builder Modal
        multi_btn = page.locator("button:has-text('Multi-Area PDF Report')").first
        if multi_btn.count() > 0:
            multi_btn.click()
            time.sleep(1.2)
            save_shot(page, "09_multi_area_report.png")

        print("Page errors:", errors)
        assert len(errors) == 0, f"Unexpected page errors: {errors}"
        browser.close()
finally:
    proc.terminate()
    print("Screenshot capture and UI verification complete!")
