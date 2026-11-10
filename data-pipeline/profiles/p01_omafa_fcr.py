"""
p01_omafa_fcr.py — OMAFA "Ontario Farm Cash Receipts by County and Commodity" (2011–latest)

Source: Ontario Ministry of Agriculture, Food and Agribusiness (OMAFA), Ontario Data Catalogue
        https://data.ontario.ca/dataset/ontario-farm-cash-receipts-by-county-and-commodity
Licence: Open Government Licence – Ontario
Output : data-pipeline/processed/profiles/omafa_fcr_county.csv   (tidy, $ millions)

Reconciliation: Ontario totals are checked against Statistics Canada table 32-10-0045-01
(Farm cash receipts, annual), the provincial control total OMAFA allocates to counties.
"""

import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import (  # noqa: E402
    RAW_PROFILES_DIR, QAReport, download_file, fmt_num, register_source, statcan_cube_csv, to_num, write_tidy,
)
import openpyxl  # noqa: E402

SOURCE_ID = "omafa_fcr_county"
URL = ("https://data.ontario.ca/dataset/d4461f70-cab3-46c0-8adc-f4d77945a273/resource/"
       "c4cffe14-d1a0-40e8-b2b6-393a7631ec24/download/fcrcty_en.xlsx")
LANDING = "https://data.ontario.ca/dataset/ontario-farm-cash-receipts-by-county-and-commodity"
RAW = RAW_PROFILES_DIR / SOURCE_ID / "fcrcty_en.xlsx"

# OMAFA county label -> StatCan 2021 CD code
COUNTY_TO_CD = {
    "Stormont, Dundas and Glengarry Counties": "3501", "Prescott and Russell United Counties": "3502",
    "Ottawa Division": "3506", "Leeds and Grenville United Counties": "3507", "Lanark County": "3509",
    "Frontenac County": "3510", "Lennox and Addington County": "3511", "Hastings County": "3512",
    "Prince Edward Division": "3513", "Northumberland County": "3514", "Peterborough County": "3515",
    "Kawartha Lakes Division": "3516", "Durham Regional Municipality": "3518", "York Regional Municipality": "3519",
    "Peel Regional Municipality": "3521", "Dufferin County": "3522", "Wellington County": "3523",
    "Halton Regional Municipality": "3524", "Hamilton Division": "3525", "Niagara Regional Municipality": "3526",
    "Haldimand-Norfolk Regional Municipality": "3528", "Brant County": "3529",
    "Waterloo Regional Municipality": "3530", "Perth County": "3531", "Oxford County": "3532",
    "Elgin County": "3534", "Chatham-Kent Division": "3536", "Essex County": "3537", "Lambton County": "3538",
    "Middlesex County": "3539", "Huron County": "3540", "Bruce County": "3541", "Grey County": "3542",
    "Simcoe County": "3543", "Muskoka District Municipality": "3544", "Haliburton County": "3546",
    "Renfrew County": "3547", "Nipissing": "3548", "Parry Sound District": "3549", "Manitoulin": "3551",
    "Sudbury": "3552", "Greater Sudbury / Grand Sudbury": "3553", "Timiskaming": "3554", "Cochrane": "3556",
    "Algoma": "3557", "Thunder Bay": "3558", "Rainy River": "3559", "Kenora": "3560",
}
REGIONS = {
    "Southern Ontario Region": "OMAFA_SOUTHERN", "Western Ontario Region": "OMAFA_WESTERN",
    "Central Ontario Region": "OMAFA_CENTRAL", "Eastern Ontario Region": "OMAFA_EASTERN",
    "Northern Ontario Region": "OMAFA_NORTHERN",
    # 2011–2018 tabs omit the word "Region"
    "Southern Ontario": "OMAFA_SOUTHERN", "Western Ontario": "OMAFA_WESTERN", "Central Ontario": "OMAFA_CENTRAL",
    "Eastern Ontario": "OMAFA_EASTERN", "Northern Ontario": "OMAFA_NORTHERN",
}
REGION_NAMES = {v: k for k, v in REGIONS.items() if k.endswith("Region")}

CROPS = {"Wheat", "Oats", "Barley", "Rye", "Canola", "Soybeans", "Corn", "Potatoes", "Field Veg", "Greenhouse Veg",
         "Fruit", "Floriculture", "Mushrooms", "Christmas Trees", "Nursery", "Sod", "Tobacco", "Ginseng",
         "Dry Beans", "Forage and Grass Seed", "Hay and Clover", "Maple Products", "Forest Products"}
LIVESTOCK = {"Steers and Slaughter Heifers", "Calves", "Hogs", "Sheep and Lambs", "Dairy Products", "Chickens",
             "Turkeys", "Eggs", "Honey", "Furs"}


def slug(s: str) -> str:
    return "fcr_" + re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def category(col: str) -> str:
    if col in CROPS:
        return "Crop receipts"
    if col in LIVESTOCK:
        return "Livestock & product receipts"
    if col == "Program Payment":
        return "Program payments"
    if col == "Other*":
        return "Provision for suppressed county data"
    if col == "Other Crops and Livestock":
        return "Other crops & livestock"
    if col == "Total Farm Cash Receipts":
        return "Total"
    return "Other"


def main():
    qa = QAReport(SOURCE_ID, "OMAFA Farm Cash Receipts by County and Commodity")
    download_file(URL, RAW, overwrite=True)
    wb = openpyxl.load_workbook(RAW, read_only=True, data_only=True)

    rows, years = [], []
    release_stamps = {}    # year -> release date stamp printed at the foot of each tab
    totals = {}            # (year, geo_code) -> total
    comp_sums = {}         # (year, geo_code) -> sum of components
    placeholder_cells = 0
    huron_2021 = {}
    headers_by_year = {}
    canonical = None       # canonical column labels (latest tab), compared case-insensitively

    for ws in wb.worksheets:
        m = re.match(r"FCR(\d{4})_EN", ws.title)
        if not m:
            continue
        year = int(m.group(1))
        years.append(year)
        data = list(ws.iter_rows(values_only=True))
        title = next((r[0] for r in data if r and isinstance(r[0], str) and "Farm Cash Receipts" in r[0]), "")
        qa.check(f"{year}: tab title names the same year", str(year) in title, title)
        hdr_idx = next(i for i, r in enumerate(data) if r and r[0] == "County")
        raw_header = [h for h in data[hdr_idx] if h is not None]
        if canonical is None:
            canonical = raw_header
        # Normalise label case differences between years (e.g. 2016 'Other crops and livestock')
        header = [canonical[i] if i < len(canonical) and str(h).lower() == str(canonical[i]).lower() else h
                  for i, h in enumerate(raw_header)]
        headers_by_year[year] = header
        for r in data[hdr_idx + 1:]:
            name = r[0]
            if name is None or name == "":
                continue
            if hasattr(name, "year"):          # release date stamp (datetime cell)
                release_stamps[year] = str(name)[:10]
                continue
            name = str(name).strip()
            if re.match(r"^[A-Z][a-z]+ \d{1,2},? \d{4}$", name):
                release_stamps[year] = name
                continue
            if name.startswith("*") or name.startswith("Reference"):
                if year == years[0]:
                    qa.note(f"Source footnote: {name}")
                continue
            if name in COUNTY_TO_CD:
                level, code, dguid = "CD", COUNTY_TO_CD[name], f"2021A0003{COUNTY_TO_CD[name]}"
            elif name in REGIONS:
                level, code, dguid = "OMAFA_REGION", REGIONS[name], ""
                name = REGION_NAMES[code]
            elif name == "PROVINCE":
                level, code, dguid, name = "PROVINCE", "35", "2021A000235", "Ontario"
            else:
                qa.check(f"{year}: unrecognised geography row", False, name)
                continue
            comp = 0.0
            for col, raw_v in zip(header[1:], r[1:len(header)]):
                v = to_num(raw_v)
                flag, note = "", ""
                if v is not None and abs(v - 0.0005) < 1e-12:
                    # OMAFA writes 0.0005 ($500) in some cells; it behaves like a placeholder for
                    # suppressed/negligible values, so we do not publish it as a real number.
                    placeholder_cells += 1
                    flag, note = "placeholder", "OMAFA cell value 0.0005 ($ millions) treated as placeholder (suppressed/negligible); not shown"
                    out_v = ""
                else:
                    out_v = fmt_num(v)
                if col == "Total Farm Cash Receipts":
                    totals[(year, code)] = v or 0.0
                else:
                    comp += v or 0.0
                rows.append({
                    "table_id": f"fcrcty_en.xlsx:{ws.title}", "ref_year": year, "geo_level": level,
                    "geo_code": code, "geo_dguid": dguid, "geo_name": name, "indicator_id": slug(col),
                    "indicator_label": f"Farm cash receipts: {col}", "category": category(col),
                    "uom": "$ millions", "value": out_v, "status_flag": flag, "is_estimate": 1,
                    "note": note or "OMAFA modelled county estimate (provincial StatCan receipts allocated to counties by OMAFA)",
                })
                if year == 2021 and code == "3540":
                    huron_2021[col] = v
            comp_sums[(year, code)] = comp

    years.sort()
    qa.check("Years 2011–2025 all present", years == list(range(2011, max(years) + 1)) and years[0] == 2011,
             f"{years[0]}–{years[-1]} ({len(years)} tabs)")
    qa.check("Same commodity/total columns every year (after case normalisation)",
             len({tuple(h) for h in headers_by_year.values()}) == 1, f"{len(headers_by_year[years[-1]]) - 1} columns")

    source_issues = []
    for y in years:
        cds = {k[1] for k in totals if k[0] == y and k[1].isdigit() and len(k[1]) == 4}
        qa.check(f"{y}: 48 CDs present (all except Toronto 3520)", len(cds) == 48 and "3520" not in cds, f"{len(cds)} CDs")
        bad_cd = [c for (yy, c), t in totals.items()
                  if yy == y and len(c) == 4 and c.isdigit() and abs(comp_sums[(yy, c)] - t) > 0.05]
        qa.check(f"{y}: county rows — commodities sum to published total (±$0.05M)", not bad_cd,
                 f"mismatches: {bad_cd[:6]}" if bad_cd else "")
        # Aggregate rows (regions/province): OMAFA's own sheet is not always internally consistent
        for (yy, c), t in totals.items():
            if yy == y and not (len(c) == 4 and c.isdigit()):
                d = comp_sums[(yy, c)] - t
                if abs(d) > 1.0:
                    source_issues.append(f"{y} {c}: commodity columns sum to {comp_sums[(yy, c)]:,.1f} but published total is {t:,.1f} ($M diff {d:+,.1f})")
        cd_sum = sum(t for (yy, c), t in totals.items() if yy == y and len(c) == 4 and c.isdigit())
        reg_sum = sum(t for (yy, c), t in totals.items() if yy == y and c.startswith("OMAFA_"))
        prov = totals.get((y, "35"), 0)
        qa.check(f"{y}: sum of 48 CD totals = province total (±0.5%)", prov and abs(cd_sum - prov) / prov < 0.005,
                 f"CDs {cd_sum:,.1f} vs province {prov:,.1f}")
        qa.check(f"{y}: sum of 5 OMAFA region totals = province total (±0.5%)", prov and abs(reg_sum - prov) / prov < 0.005,
                 f"regions {reg_sum:,.1f} vs province {prov:,.1f}")
    qa.check("Aggregate rows internally consistent in OMAFA file (commodities vs total, ±$1M)", not source_issues,
             f"{len(source_issues)} SOURCE-FILE inconsistencies (see notes) — county rows and totals are unaffected"
             if source_issues else "")
    for s in source_issues:
        qa.note("SOURCE INCONSISTENCY (OMAFA file, not pipeline): " + s)

    # Spot check vs pictures in the OMAFA Huron County Profile workbook (2021 chart)
    expected = {"Hogs": 307.0, "Corn": 140.2, "Dairy Products": 130.5, "Soybeans": 116.2, "Wheat": 71.7,
                "Program Payment": 37.6, "Other Crops and Livestock": 154.0, "Total Farm Cash Receipts": 1438.83}
    ok = all(abs((huron_2021.get(k) or 0) - v) < 0.06 for k, v in expected.items())
    qa.check("Huron 2021 matches OMAFA County Profile chart values", ok,
             ", ".join(f"{k}={huron_2021.get(k, 0):.1f}" for k in expected))

    # Reconcile Ontario totals with StatCan 32-10-0045-01 (Farm cash receipts, annual, $ thousands)
    try:
        csv_path = statcan_cube_csv(32100045)
        statcan = {}
        with open(csv_path, encoding="utf-8-sig") as f:
            rd = csv.DictReader(f)
            type_col = next(c for c in rd.fieldnames if c.lower().startswith("type of cash receipts"))
            for r in rd:
                if r["GEO"] == "Ontario" and r[type_col].strip().lower() == "total farm cash receipts" and r["VALUE"]:
                    statcan[int(r["REF_DATE"][:4])] = float(r["VALUE"]) / 1000.0  # -> $ millions
        for y in years:
            prov = totals.get((y, "35"))
            sc = statcan.get(y)
            if sc:
                diff = (prov - sc) / sc * 100
                qa.check(f"{y}: OMAFA Ontario total vs StatCan 32-10-0045-01 (±2%)", abs(diff) < 2.0,
                         f"OMAFA {prov:,.1f} vs StatCan {sc:,.1f} $M ({diff:+.2f}%)")
            else:
                qa.note(f"{y}: no StatCan 32-10-0045-01 Ontario total available for comparison")
        qa.note("StatCan 32-10-0045-01 values may since have been revised; small differences reflect revisions after OMAFA's release.")
    except Exception as e:  # pragma: no cover
        qa.check("StatCan 32-10-0045-01 reconciliation ran", False, str(e))

    latest_stamp = release_stamps.get(years[-1], "")
    qa.note(f"Placeholder cells (0.0005) excluded: {placeholder_cells}")
    qa.note(f"OMAFA release stamp in file: {latest_stamp or 'n/a'}")
    qa.note("Toronto (CD 3520) is not included in OMAFA's county table.")
    qa.note("Haldimand-Norfolk is published as one row (CD 3528); it is not split into Haldimand and Norfolk.")

    out = write_tidy(SOURCE_ID, rows)
    qa.write()
    register_source(
        SOURCE_ID,
        publisher="Ontario Ministry of Agriculture, Food and Agribusiness (OMAFA)",
        title="Ontario Farm Cash Receipts by County and Commodity",
        url=LANDING, download_url=URL, licence="Open Government Licence – Ontario",
        vintage=f"{years[0]}–{years[-1]} (release stamp: {latest_stamp})",
        geography="48 Ontario Census Divisions (no Toronto), 5 OMAFA regions, Ontario",
        method=("OMAFA allocates Statistics Canada provincial farm cash receipts (32-10-0045-01) to counties. "
                "Values are OMAFA modelled estimates in $ millions; flagged is_estimate=1."),
        caveats=["County figures are OMAFA estimates, not direct StatCan publications.",
                 "'Other*' is OMAFA's provision for data suppressed at county level.",
                 "Cells equal to 0.0005 treated as placeholders and left blank.",
                 "Haldimand-Norfolk is one combined row; Toronto not included."],
        row_count=len(rows), output_file=str(out.name), script=Path(__file__).name,
    )
    print(f"Wrote {len(rows):,} rows -> {out}; QA all passed: {qa.all_passed}")


if __name__ == "__main__":
    main()
