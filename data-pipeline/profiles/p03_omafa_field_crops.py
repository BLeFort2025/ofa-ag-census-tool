"""p03_omafa_field_crops.py — OMAFA Field Crop Area, Yield & Production by County (2011–2025).

Downloads and parses the 12 official OMAFA county field crop workbooks from the
Ontario Data Catalogue (dataset e30dc044-5f75-4f33-b63e-6326f8769bea) under the
Open Government Licence – Ontario:
  - Grain Corn (ctygcorn.xlsx)
  - Soybeans (ctysoy.xlsx)
  - Winter Wheat (ctywwheat.xlsx)
  - Spring Wheat (ctyswheat.xlsx)
  - Oats (ctyoats.xlsx)
  - Barley (ctybarley.xlsx)
  - Mixed Grain (ctymixed.xlsx)
  - Dry White Beans (ctywbeans.xlsx)
  - Coloured Beans (ctycbeans.xlsx)
  - Canola (ctycanola.xlsx)
  - Fodder Corn (ctyfcorn.xlsx)
  - Hay (ctyhay.xlsx)
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (
    QAReport,
    RAW_PROFILES_DIR,
    download_file,
    fmt_num,
    register_source,
    to_num,
    write_tidy,
)
from p01_omafa_fcr import COUNTY_TO_CD, REGIONS, REGION_NAMES

SOURCE_ID = "omafa_field_crops_county"
LANDING = "https://data.ontario.ca/dataset/ontario-field-crop-area-and-production-estimates-by-county"

CROPS = [
    ("grain_corn", "Grain Corn", "ctygcorn.xlsx", "bushels/acre", "000 bushels",
     "https://data.ontario.ca/dataset/e30dc044-5f75-4f33-b63e-6326f8769bea/resource/5f0973f1-6228-4b54-9e5d-9f0d252e0331/download/ctygcorn.xlsx"),
    ("soybeans", "Soybeans", "ctysoy.xlsx", "bushels/acre", "000 bushels",
     "https://data.ontario.ca/dataset/e30dc044-5f75-4f33-b63e-6326f8769bea/resource/3a2e7395-17fd-462b-bcfb-1c2e8aa53dbb/download/ctysoy.xlsx"),
    ("winter_wheat", "Winter Wheat", "ctywwheat.xlsx", "bushels/acre", "000 bushels",
     "https://data.ontario.ca/dataset/e30dc044-5f75-4f33-b63e-6326f8769bea/resource/5af26019-30c2-4c97-b7bb-803817a3469c/download/ctywwheat.xlsx"),
    ("spring_wheat", "Spring Wheat", "ctyswheat.xlsx", "bushels/acre", "000 bushels",
     "https://data.ontario.ca/dataset/e30dc044-5f75-4f33-b63e-6326f8769bea/resource/16a875b9-5a56-4ad8-ac5b-dc77bde93c6d/download/ctyswheat.xlsx"),
    ("oats", "Oats", "ctyoats.xlsx", "bushels/acre", "000 bushels",
     "https://data.ontario.ca/dataset/e30dc044-5f75-4f33-b63e-6326f8769bea/resource/e0bbc993-c44f-446b-a20f-66e4f7c0d481/download/ctyoats.xlsx"),
    ("barley", "Barley", "ctybarley.xlsx", "bushels/acre", "000 bushels",
     "https://data.ontario.ca/dataset/e30dc044-5f75-4f33-b63e-6326f8769bea/resource/6fd904fb-6c6d-4319-847e-44e4a19532ee/download/ctybarley.xlsx"),
    ("mixed_grain", "Mixed Grain", "ctymixed.xlsx", "bushels/acre", "000 bushels",
     "https://data.ontario.ca/dataset/e30dc044-5f75-4f33-b63e-6326f8769bea/resource/bee9d3b7-35a7-4661-984b-257deabd56f2/download/ctymixed.xlsx"),
    ("white_beans", "Dry White Beans", "ctywbeans.xlsx", "cwt/acre", "000 cwt",
     "https://data.ontario.ca/dataset/e30dc044-5f75-4f33-b63e-6326f8769bea/resource/d9794fb5-b923-4297-ac52-6c36b3cb08a3/download/ctywbeans.xlsx"),
    ("coloured_beans", "Coloured Beans", "ctycbeans.xlsx", "cwt/acre", "000 cwt",
     "https://data.ontario.ca/dataset/e30dc044-5f75-4f33-b63e-6326f8769bea/resource/126e1fa8-ea86-4529-adc9-1477cdc0d92e/download/ctycbeans.xlsx"),
    ("canola", "Canola", "ctycanola.xlsx", "bushels/acre", "000 bushels",
     "https://data.ontario.ca/dataset/e30dc044-5f75-4f33-b63e-6326f8769bea/resource/d2c581e3-ac7b-42ab-8081-c3926a0b7346/download/ctycanola.xlsx"),
    ("fodder_corn", "Fodder Corn", "ctyfcorn.xlsx", "tons/acre", "000 tons",
     "https://data.ontario.ca/dataset/e30dc044-5f75-4f33-b63e-6326f8769bea/resource/f9e0e381-faec-4ec1-a768-8bb1917b83be/download/ctyfcorn.xlsx"),
    ("hay", "Cultivated Hay", "ctyhay.xlsx", "tons/acre", "000 tons",
     "https://data.ontario.ca/dataset/e30dc044-5f75-4f33-b63e-6326f8769bea/resource/d24af1a6-6fa9-4890-9398-26e48e9eeca4/download/ctyhay.xlsx"),
]

SHORT_COUNTY_TO_CD: dict[str, str] = {}
for full_k, cd_v in COUNTY_TO_CD.items():
    SHORT_COUNTY_TO_CD[full_k] = cd_v
    stripped = (
        full_k.replace(" Regional Municipality", "")
        .replace(" United Counties", "")
        .replace(" Municipality", "")
        .replace(" District", "")
        .replace(" County", "")
        .replace(" City", "")
        .strip()
    )
    SHORT_COUNTY_TO_CD[stripped] = cd_v

EXTRA_COUNTY_ALIASES = {
    **SHORT_COUNTY_TO_CD,
    "Chatham-Kent": "3536",
    "Ottawa": "3506",
    "Hamilton": "3525",
    "Haldimand-Norfolk": "3528",
    "Kawartha Lakes": "3516",
    "Prince Edward": "3513",
    "Leeds and Grenville": "3507",
    "Leeds & Grenville": "3507",
    "Lennox and Addington": "3511",
    "Lennox & Addington": "3511",
    "Prescott and Russell": "3502",
    "Prescott & Russell": "3502",
    "Stormont, Dundas and Glengarry": "3501",
    "Stormont, Dundas & Glengarry": "3501",
    "Greater Sudbury": "3553",
    "Sudbury": "3552",
    "Timiskaming": "3554",
    "Temiskaming": "3554",
    "Glengarry": "3501",
    "Stormont": "3501",
    "Dundas": "3501",
    "Prescott": "3502",
    "Russell": "3502",
    "Leeds": "3507",
    "Grenville": "3507",
    "Haldimand": "3528",
    "Norfolk": "3528",
}


def parse_sheet_year(title: str) -> int | None:
    m = re.search(r"(20\d{2})", title)
    if m:
        return int(m.group(1))
    m2 = re.search(r"(\d{2})$", title.strip())
    if m2:
        yr = 2000 + int(m2.group(1))
        if 2004 <= yr <= 2030:
            return yr
    return None


def main() -> None:
    qa = QAReport(SOURCE_ID, "OMAFA Field Crop Area, Yield and Production Estimates by County (2011–2025)")
    rows = []
    crops_parsed = 0

    for cid, clabel, fn, yield_uom, prod_uom, url in CROPS:
        xlsx_path = download_file(url, RAW_PROFILES_DIR / "omafa_field_crops" / fn)
        wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)
        years_found = []

        for ws in wb.worksheets:
            yr = parse_sheet_year(ws.title)
            if yr is None or yr < 2011:
                continue
            years_found.append(yr)
            sheet_rows = list(ws.iter_rows(max_row=85, max_col=10, values_only=True))
            hdr_idx = next(
                (i for i, r in enumerate(sheet_rows)
                 if any(isinstance(x, str) and "yield" in x.lower() for x in r if x)),
                None,
            )
            if hdr_idx is None:
                continue

            # Aggregate split historic counties (if any sheet splits Haldimand/Norfolk or SD&G)
            agg: dict[tuple[str, str, str, str], list[float | None]] = {}
            for r in sheet_rows[hdr_idx + 1:]:
                if not r or r[0] is None:
                    continue
                raw_name = str(r[0]).strip()
                if not raw_name or raw_name.startswith("*") or raw_name.startswith("Note") or raw_name.startswith("Source"):
                    continue
                if re.match(r"^[A-Z][a-z]+ \d{1,2},? \d{4}$", raw_name) or hasattr(r[0], "year"):
                    continue
                # Strip trailing footnote markers
                clean_name = re.sub(r"[\*\d]+$", "", raw_name).strip()
                if clean_name in EXTRA_COUNTY_ALIASES:
                    cd_c = EXTRA_COUNTY_ALIASES[clean_name]
                    level, code, dguid, gname = "CD", cd_c, f"2021A0003{cd_c}", clean_name
                elif clean_name in REGIONS or f"{clean_name} Region" in REGIONS:
                    rc = REGIONS.get(clean_name) or REGIONS[f"{clean_name} Region"]
                    level, code, dguid, gname = "OMAFA_REGION", rc, "", REGION_NAMES[rc]
                elif clean_name.upper() in ("PROVINCE", "TOTAL PROVINCE", "ONTARIO", "PROVINCIAL TOTAL"):
                    level, code, dguid, gname = "PROVINCE", "35", "2021A000235", "Ontario"
                else:
                    continue

                vals = [to_num(x) for x in r[1:6]]
                while len(vals) < 5:
                    vals.append(None)
                agg[(level, code, dguid, gname)] = vals

            metrics = [
                (f"crop_{cid}_seeded_acres", f"{clabel}: Area seeded", "acres", 0),
                (f"crop_{cid}_harvested_acres", f"{clabel}: Area harvested", "acres", 1),
                (f"crop_{cid}_yield", f"{clabel}: Yield per harvested acre", yield_uom, 2),
                (f"crop_{cid}_prod_imp", f"{clabel}: Production ({prod_uom})", prod_uom, 3),
                (f"crop_{cid}_prod_tonnes", f"{clabel}: Production (000 tonnes)", "000 tonnes", 4),
            ]
            for (level, code, dguid, gname), vals in agg.items():
                for ind_id, ind_label, uom, idx in metrics:
                    v = vals[idx]
                    flag = "x" if v is None else ""
                    rows.append({
                        "table_id": f"{fn}:{ws.title}",
                        "ref_year": yr,
                        "geo_level": level,
                        "geo_code": code,
                        "geo_dguid": dguid,
                        "geo_name": gname,
                        "indicator_id": ind_id,
                        "indicator_label": ind_label,
                        "category": f"OMAFA County Field Crops — {clabel}",
                        "uom": uom,
                        "value": fmt_num(v),
                        "status_flag": flag,
                        "is_estimate": 1,
                        "note": "OMAFA Field Crop Area, Yield and Production by County",
                    })
        crops_parsed += 1
        qa.check(f"{clabel} ({fn}): 2011–2025 sheets parsed", 2021 in years_found and max(years_found) >= 2024,
                 f"years={min(years_found)}–{max(years_found)} ({len(years_found)} sheets)")

    distinct_cds = {r["geo_code"] for r in rows if r["geo_level"] == "CD"}
    qa.check("All 12 OMAFA field crop workbooks parsed", crops_parsed == 12, f"parsed={crops_parsed}")
    qa.check("At least 48 Ontario CDs matched across field crop workbooks", len(distinct_cds) >= 48, f"CDs={len(distinct_cds)}")
    out = write_tidy(SOURCE_ID, rows)
    qa.write()
    register_source(
        SOURCE_ID,
        publisher="Ontario Ministry of Agriculture, Food and Agribusiness (OMAFA)",
        title="Ontario Field Crop Area and Production Estimates by County (12 Crops)",
        url=LANDING,
        licence="Open Government Licence – Ontario",
        vintage="2011–2025",
        geography="48 Ontario Census Divisions, 5 OMAFA Regions, and Ontario",
        method="Annual county seeded area, harvested area, yield, and production estimates published by OMAFA.",
        caveats=[
            "County-level yields and production are OMAFA survey/modelled estimates.",
            "Suppressed county cells ('x' or '-') are preserved with status_flag='x' and blank value.",
        ],
        row_count=len(rows),
        output_file=str(out.name),
        script=Path(__file__).name,
    )
    print(f"Wrote {len(rows):,} rows -> {out}; QA all passed: {qa.all_passed}")


if __name__ == "__main__":
    main()
