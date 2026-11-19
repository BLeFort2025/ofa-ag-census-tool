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

        # 1. Module 01: Overview (formerly Snapshot — Huron County showcasing Quick-Start, Key Takeaway, #Rank/49 & ON avg benchmarks)
        huron_btn = page.locator("button:has-text('Huron')").first
        if huron_btn.count() > 0:
            huron_btn.click()
            time.sleep(1.0)
        save_shot(page, "01_snapshot_ontario.png")

        # Click 'Show Map' to capture the interactive Peer Distance Map Modal
        map_btn = page.locator("button:has-text('Show Map')").first
        if map_btn.count() > 0:
            map_btn.click()
            time.sleep(2.0)
            save_shot(page, "01b_snapshot_map_modal.png")
            page.keyboard.press("Escape")
            time.sleep(0.5)

        # Reset back to Ontario for Topic Charts historical series
        ont_btn = page.locator("button:has-text('Ontario')").first
        if ont_btn.count() > 0:
            ont_btn.click()
            time.sleep(0.6)

        # 2. Topic Charts (Explorer)
        page.locator("aside nav button", has_text="Topic Charts").click()
        time.sleep(1.5)
        save_shot(page, "02_explorer_bars.png")

        hist_btn = page.locator(
            "button[title='Multi-Census Historical Time-Series (1976-2021)']"
        )
        if hist_btn.count() > 0:
            hist_btn.first.click()
            time.sleep(1.0)
            save_shot(page, "02b_explorer_historical.png")

        # 3. Multi-Filter (Drilldown) — Mode 1 (Confirmed Matching Range) & Mode 2 (Cross-Tabulations)
        page.locator("aside nav button", has_text="Multi-Filter").click()
        time.sleep(2.0)
        selects = page.locator("main select")
        for i in range(selects.count()):
            sel = selects.nth(i)
            if sel.locator("option[value='rev_500k_plus']").count() > 0:
                sel.select_option("rev_500k_plus")
                break
        time.sleep(1.5)
        save_shot(page, "03_drilldown.png")

        xtab_btn = page.locator("button:has-text('2. Farm Specialization')").first
        if xtab_btn.count() > 0:
            xtab_btn.click()
            time.sleep(1.2)
            save_shot(page, "03b_drilldown_crosstabs.png")

        # 4. Compare 2 (Compare)
        page.locator("aside nav button", has_text="Compare 2").click()
        time.sleep(2.0)
        match_btn = page.locator("button:has-text('Find Closest Match')").first
        if match_btn.count() > 0:
            match_btn.click()
            time.sleep(1.2)
        save_shot(page, "04_compare.png")

        # 5. Rankings (Ranker)
        page.locator("aside nav button", has_text="Rankings").click()
        time.sleep(2.0)
        acres_btn = page.locator("button:has-text('Acres')").first
        if acres_btn.count() > 0:
            acres_btn.click()
            time.sleep(1.5)
        save_shot(page, "05_ranker_acres.png")

        # 6. Crop Maps (Ag Belts & Cluster Maps Studio)
        page.locator("aside nav button", has_text="Crop Maps").click()
        time.sleep(2.0)
        save_shot(page, "06_belts_dominant.png")

        heatmap_btn = page.locator("button:has-text('All-CD Heat Map')").first
        if heatmap_btn.count() > 0:
            heatmap_btn.click()
            time.sleep(1.5)
            save_shot(page, "06b_belts_heatmap.png")

        # 7. Scorecard (AgScore)
        page.locator("aside nav button", has_text="Scorecard").click()
        time.sleep(2.0)
        save_shot(page, "07_agscore.png")

        # 8. Area Finder (GeoSearch)
        page.locator("aside nav button", has_text="Area Finder").click()
        time.sleep(1.5)
        save_shot(page, "08_geosearch.png")

        # 9. OFA Profiles (Profiles 2.0 — Huron Summary, Townships, Tax/Soil/Broadband, Zone 15)
        page.locator("aside nav button", has_text="OFA Profiles").click()
        time.sleep(2.0)
        counties_btn = page.locator("button:has-text('Counties (49)')").first
        if counties_btn.count() > 0:
            counties_btn.click()
            time.sleep(0.6)
        huron_row = page.locator("main button:has-text('Huron')").first
        if huron_row.count() > 0:
            huron_row.click()
            time.sleep(0.6)
        save_shot(page, "11_profiles_huron_summary.png")

        twp_btn = page.locator("button:has-text('2. Townships')").first
        if twp_btn.count() > 0:
            twp_btn.click()
            time.sleep(0.6)
            save_shot(page, "11b_profiles_huron_townships.png")

        tax_btn = page.locator("button:has-text('6. Tax, Prime Soil & Broadband')").first
        if tax_btn.count() > 0:
            tax_btn.click()
            time.sleep(0.6)
            save_shot(page, "11c_profiles_huron_tax_soil_broadband.png")

        zones_btn = page.locator("button:has-text('OFA Zones (15)')").first
        if zones_btn.count() > 0:
            zones_btn.click()
            time.sleep(0.6)
            z15_btn = page.locator("button:has-text('Zone 15')").first
            if z15_btn.count() > 0:
                z15_btn.click()
                time.sleep(0.6)
            exec_btn = page.locator("button:has-text('1. Executive Summary')").first
            if exec_btn.count() > 0:
                exec_btn.click()
                time.sleep(0.6)
            save_shot(page, "11d_profiles_zone15_sudbury_footnote.png")

        # 10. AI Policy Brief Drawer on Overview
        page.locator("aside nav button", has_text="Overview").click()
        time.sleep(1.0)
        ai_btn = page.locator("button:has-text('AI Policy Brief')").first
        if ai_btn.count() > 0:
            ai_btn.click()
            time.sleep(1.0)
            save_shot(page, "10_ai_policy_brief.png")
            page.keyboard.press("Escape")
            time.sleep(0.5)

        # 11. Multi-Area PDF Report Builder Modal
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
