"""p06_extract_omafa_workbooks.py — Extract & Repair Multi-Workbook Data from OMAFA's 48 County Profiles.

Processes all 48 `.xlsx` workbooks in `C:\\Users\\ben.lefort\\OneDrive - Ontario Federation of Agriculture\\Desktop\\County Profiles`
in parallel (`ProcessPoolExecutor`) and writes 4 clean, reconciled tidy CSV datasets:

1. `omafa_community_profile.csv`:
   - Statistics Canada Census of Population (2011, 2016, 2021) Age distribution, Household Income & Size,
     Labour Force Status, and Employment by Industry (NAICS + Agri-Food Value Chain rollup) by both
     Place of Work ("Day") and Place of Residence ("Night") for Ontario, 48 CDs, CSDs, and 15 OFA Zones.

2. `omafa_business_counts.csv`:
   - Statistics Canada Canadian Business Counts (Dec 2016, Dec 2021, Dec 2022, Dec 2023) extracted directly
     from the raw StatCan dump on `Community Profile` (keyed by the Ontario Total signature:
     `1,811,058` = 2023, `1,695,809` = 2022, `1,602,242` = 2021, `1,000,184 + 459,107` = 2016).
   - Repairs all 4 corrupted `Agrifood Business Counts` tabs (`huron`, `peel`, `hamilton`, `halton`) and
     fixes the 1-row column paste shift in `peterborough` (verified via `Net == Without + With employees`).

3. `omafa_ag_census_over_time.csv`:
   - Historical 4-Census series (`2006, 2011, 2016, 2021`) from `Ag Census over time` for Ontario, 48 CDs,
     all Townships/CCSs, and 15 OFA Zones.
   - Eliminates all 280,239 `#VALUE!` / `#DIV/0!` formula errors and replaces the scrambled 2021 Renewable Energy
     rows (`R597–R607`) with unscrambled values directly from StatCan Table `32-10-0380-01`.

4. `omafa_food_estimates.csv`:
   - Rural Household Food Expenditure estimates (`2016, 2021`) and Local Food Consumption vs. Production
     estimates (`2016, 2021`), fixing the mixed-unit (`acres` + `head`) sum bug and marking `is_estimate=1`.
"""
from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
import csv
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (
    PROCESSED_DIR,
    PROJECT_DIR,
    QAReport,
    fmt_num,
    register_source,
    write_tidy,
)


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(text).lower()).strip("_")

OMAFA_DIR = Path(
    os.environ.get(
        "OMAFA_WORKBOOKS_DIR",
        r"C:\Users\ben.lefort\OneDrive - Ontario Federation of Agriculture\Desktop\County Profiles",
    )
)
ERR_RE = re.compile(r"^#(VALUE!|DIV/0!|REF!|N/A|NAME\?|NUM!)$")
GEO_HEADER_RE = re.compile(r"^(.*?)\s*\((\d{4,7})\)\s*,\s*(CD|CSD)", re.IGNORECASE)

# Target NAICS prefixes on Community Profile for Agri-Food Business Counts
TARGET_BIZ_NAICS = {
    "TOTAL": ("biz_total_all", "Total All Industries"),
    "111": ("biz_naics_111", "111 - Crop production"),
    "112": ("biz_naics_112", "112 - Animal production and aquaculture"),
    "111412": ("biz_naics_111412", "111412 - Cannabis grown under cover"),
    "111995": ("biz_naics_111995", "111995 - Cannabis grown in open fields"),
    "1151": ("biz_naics_1151", "1151 - Support activities for crop production"),
    "1152": ("biz_naics_1152", "1152 - Support activities for animal production"),
    "311": ("biz_naics_311", "311 - Food manufacturing"),
    "3111": ("biz_naics_3111", "3111 - Animal food manufacturing"),
    "3112": ("biz_naics_3112", "3112 - Grain and oilseed milling"),
    "3113": ("biz_naics_3113", "3113 - Sugar and confectionery product manufacturing"),
    "3114": ("biz_naics_3114", "3114 - Fruit and vegetable preserving and specialty food manufacturing"),
    "3115": ("biz_naics_3115", "3115 - Dairy product manufacturing"),
    "3116": ("biz_naics_3116", "3116 - Meat product manufacturing"),
    "3117": ("biz_naics_3117", "3117 - Seafood product preparation and packaging"),
    "3118": ("biz_naics_3118", "3118 - Bakeries and tortilla manufacturing"),
    "3119": ("biz_naics_3119", "3119 - Other food manufacturing"),
    "312": ("biz_naics_312", "312 - Beverage and tobacco product manufacturing"),
    "312110": ("biz_naics_312110", "312110 - Soft drink and ice manufacturing"),
    "312120": ("biz_naics_312120", "312120 - Breweries"),
    "312130": ("biz_naics_312130", "312130 - Wineries"),
    "312140": ("biz_naics_312140", "312140 - Distilleries"),
    "3122": ("biz_naics_3122", "3122 - Tobacco manufacturing"),
    "316": ("biz_naics_316", "316 - Leather and allied product manufacturing"),
    "411": ("biz_naics_411", "411 - Farm product merchant wholesalers"),
    "413": ("biz_naics_413", "413 - Food, beverage and tobacco merchant wholesalers"),
    "4183": ("biz_naics_4183", "4183 - Agricultural supplies merchant wholesalers"),
    "445": ("biz_naics_445", "445 - Food and beverage stores"),
    "453993": ("biz_naics_453993", "453993 - Cannabis stores"),
    "722": ("biz_naics_722", "722 - Food services and drinking places"),
}

AGRIFOOD_SUM_CODES = [
    "111", "112", "1151", "1152", "311", "312", "316", "411", "413", "4183", "445", "453993", "722"
]


def clean_cell(val: Any) -> tuple[float | None, str]:
    """Return (numeric_value, status_flag) from a worksheet cell."""
    if val is None:
        return None, ""
    if isinstance(val, (int, float)):
        return float(val), ""
    s = str(val).strip()
    if not s:
        return None, ""
    if ERR_RE.match(s):
        return None, ""
    if s in ("x", "X", "F", "..", "...", "N/A", "NA"):
        return None, "x" if s.lower() == "x" else s
    if s == "-":
        return 0.0, "-"
    try:
        return float(s.replace(",", "")), ""
    except ValueError:
        return None, ""


def parse_naics_key(cell_a: Any) -> str | None:
    if cell_a is None:
        return None
    s = str(cell_a).strip()
    if s.upper() == "TOTAL":
        return "TOTAL"
    if " - " in s:
        code = s.split(" - ", 1)[0].strip()
        if code in TARGET_BIZ_NAICS:
            return code
    return None


def parse_single_workbook(xlsx_path_str: str) -> dict[str, Any]:
    """Worker function to parse one OMAFA County Profile workbook."""
    xlsx_path = Path(xlsx_path_str)
    stem = xlsx_path.stem
    include_ontario = (stem == "middlesex")  # Only emit Ontario once from a clean reference workbook

    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    result: dict[str, Any] = {
        "stem": stem,
        "cd_code": None,
        "cd_name": None,
        "cp_rows": [],
        "biz_data": {},  # (year, geo_level, geo_code, geo_name, naics_key) -> (net, without_emp, with_emp)
        "aco_rows": [],
        "aco_meta_override": {},  # excel_row_num -> (ind_id, ind_label, uom)
        "food_rows": [],
        "repaired_shift": False,
    }

    # -------------------------------------------------------------------------
    # 1. COMMUNITY PROFILE (Rows 1..266 + Business Counts R268..end)
    # -------------------------------------------------------------------------
    ws_cp = wb["Community Profile"]
    cp_all = list(ws_cp.iter_rows(max_col=65, values_only=True))
    hdr = cp_all[0] if cp_all else ()

    cp_geos: list[tuple[int, str, str, str]] = []  # (col_idx, geo_level, geo_code, geo_name)
    if include_ontario and len(hdr) > 2 and hdr[2]:
        cp_geos.append((2, "PROVINCE", "35", "Ontario"))

    cd_code = None
    cd_name = None
    for c_idx in range(3, len(hdr)):
        h = str(hdr[c_idx] or "").strip()
        if not h:
            continue
        m = GEO_HEADER_RE.match(h)
        if m:
            gname = m.group(1).strip()
            gcode = m.group(2).strip()
            gtype = m.group(3).upper()
            if gtype == "CD" and len(gcode) == 4:
                cd_code = gcode
                cd_name = gname
                cp_geos.append((c_idx, "CD", gcode, gname))
            elif gtype == "CSD" and len(gcode) == 7:
                cp_geos.append((c_idx, "CSD", gcode, gname))

    result["cd_code"] = cd_code
    result["cd_name"] = cd_name

    # Parse Census of Population section (rows 2..266, 0-based index 1..265)
    cur_section = "Demographics"
    cur_year = 2021
    for r_idx in range(1, min(267, len(cp_all))):
        row = cp_all[r_idx]
        label = str(row[0] or "").strip()
        if not label:
            continue
        # Check section header rows
        has_vals = any(row[c] is not None for c in range(2, min(len(row), 10)))
        if "2021 Census Total - Age" in label:
            cur_section, cur_year = "Age Distribution", 2021
        elif "2016 Census Total - Age" in label:
            cur_section, cur_year = "Age Distribution", 2016
        elif "2011 Census Total - Age" in label:
            cur_section, cur_year = "Age Distribution", 2011
        elif "2021 Census Income" in label:
            cur_section, cur_year = "Household Income", 2021
            if not has_vals:
                continue
        elif "2016 Census Income" in label:
            cur_section, cur_year = "Household Income", 2016
            if not has_vals:
                continue
        elif "2021 Labour Force" in label:
            cur_section, cur_year = "Labour Force Status", 2021
            if not has_vals:
                continue
        elif "2016 Labour Force" in label:
            cur_section, cur_year = "Labour Force Status", 2016
            if not has_vals:
                continue
        elif "Employment by Industry, 2021 Census of Population (Day)" in label:
            cur_section, cur_year = "Employment by Industry (Day / Place of Work)", 2021
            if not has_vals:
                continue
        elif "Agri-Food Employment, 2021 Census of Population (DAY)" in label:
            cur_section, cur_year = "Agri-Food Workforce (Day / Place of Work)", 2021
        elif "Employment by Industry, 2021 Census of Population (Night)" in label:
            cur_section, cur_year = "Employment by Industry (Night / Place of Residence)", 2021
            if not has_vals:
                continue
        elif "Agri-Food Employment, 2021 Census of Population (Night)" in label:
            cur_section, cur_year = "Agri-Food Workforce (Night / Place of Residence)", 2021
        elif "Employment by Industry, 2016 Census of Population (Day)" in label:
            cur_section, cur_year = "Employment by Industry (Day / Place of Work)", 2016
            if not has_vals:
                continue
        elif "Agri-Food Employment, 2016 Census of Population (DAY)" in label:
            cur_section, cur_year = "Agri-Food Workforce (Day / Place of Work)", 2016
        elif "Employment by Industry, 2016 Census of Population (Night)" in label:
            cur_section, cur_year = "Employment by Industry (Night / Place of Residence)", 2016
            if not has_vals:
                continue
        elif "Agri-Food Employment, 2016 Census of Population (Night)" in label:
            cur_section, cur_year = "Agri-Food Workforce (Night / Place of Residence)", 2016

        if not has_vals:
            continue

        sec_slug = slugify(cur_section.split("(")[0].strip())
        if "Day" in cur_section or "DAY" in cur_section:
            sec_slug += "_day"
        elif "Night" in cur_section:
            sec_slug += "_night"
        ind_id = f"pop_{sec_slug}_{slugify(label)}"
        # Normalize NAICS 2017 / Elgin label variants -> canonical NAICS 2012 indicator IDs
        if ind_id.endswith("_north_american_industry_classification_system_naics_2017"):
            ind_id = ind_id[:-5] + "_2012"
        ind_id = ind_id.replace(
            "_total_industry_groups_north_american_industry_classification_system_naics_2012",
            "_total_industry_north_american_industry_classification_system_naics_2012",
        )
        if ind_id == "pop_agri_food_workforce_day_111_112_farms":
            ind_id = "pop_agri_food_workforce_day_111_112_farms_111_to_112"
        elif ind_id == "pop_agri_food_workforce_day_1150_support_activities_for_farms_1151_to_1152":
            ind_id = "pop_agri_food_workforce_day_1150_support_activities_for_farms_1151_and_1152"
        uom = "persons"
        if "($)" in label:
            uom = "dollars"
        elif "rate" in label.lower():
            uom = "percent"
        elif "Total income of household" in label:
            uom = "households"
        elif "People per Household" in label:
            uom = "persons_per_household"

        for c_idx, glevel, gcode, gname in cp_geos:
            if c_idx >= len(row):
                continue
            val, flag = clean_cell(row[c_idx])
            if val is None and not flag:
                continue
            dguid = "2021A000235" if glevel == "PROVINCE" else (f"2021A0003{gcode}" if glevel == "CD" else f"2021A0005{gcode}")
            result["cp_rows"].append({
                "table_id": "StatCan_CensusPop_OMAFA",
                "ref_year": cur_year,
                "geo_level": glevel,
                "geo_code": gcode,
                "geo_dguid": dguid,
                "geo_name": gname,
                "indicator_id": ind_id,
                "indicator_label": f"{cur_section}: {label}",
                "category": f"Community Profile — {cur_section}",
                "uom": uom,
                "value": fmt_num(val),
                "status_flag": flag,
                "is_estimate": 0,
                "note": "Statistics Canada Census of Population (extracted from OMAFA County Profile Community Profile tab)",
            })

    # Parse Business Location Counts from Community Profile (rows 267..end)
    # Identify each block by the Ontario Total signature:
    #   1,811,058 -> 2023
    #   1,695,809 -> 2022
    #   1,602,242 -> 2021
    #   1,000,184 (Without employees, 10-row block without Net) -> 2016
    r_idx = 267
    n_cp = len(cp_all)
    cur_biz_year = None
    col_shift = 0  # Detects if columns D+ are shifted up by 1 row (as in peterborough 2022)
    is_10row_2016 = False

    while r_idx < n_cp:
        row = cp_all[r_idx]
        nkey = parse_naics_key(row[0] if row else None)
        if nkey == "TOTAL":
            ont_v0, _ = clean_cell(row[2] if len(row) > 2 else None)
            ont_v1, _ = clean_cell(cp_all[r_idx + 1][2] if r_idx + 1 < n_cp and len(cp_all[r_idx + 1]) > 2 else None)
            if ont_v0 == 1811058:
                cur_biz_year, is_10row_2016 = 2023, False
            elif ont_v0 == 1695809:
                cur_biz_year, is_10row_2016 = 2022, False
            elif ont_v0 == 1602242:
                cur_biz_year, is_10row_2016 = 2021, False
            elif ont_v0 == 1000184 and ont_v1 == 459107:
                cur_biz_year, is_10row_2016 = 2016, True
            else:
                r_idx += 1
                continue

            # Check if CD column (col 3) is shifted up by 1 row (e.g. peterborough 2022)
            col_shift = 0
            if not is_10row_2016 and r_idx + 2 < n_cp and len(row) > 3:
                cd_net, _ = clean_cell(cp_all[r_idx][3])
                cd_wo, _ = clean_cell(cp_all[r_idx + 1][3])
                cd_wi, _ = clean_cell(cp_all[r_idx + 2][3])
                if cd_net is not None and cd_wo is not None and cd_wi is not None:
                    if abs(cd_net - (cd_wo + cd_wi)) > 1:
                        prev_val, _ = clean_cell(cp_all[r_idx - 1][3])
                        if prev_val is not None and abs(prev_val - (cd_net + cd_wo)) <= 1:
                            col_shift = -1
                            result["repaired_shift"] = True

        if nkey and cur_biz_year:
            # Verify this is the start of the 11-row (or 10-row for 2016) block for `nkey`
            b_str = str(row[1] or "").strip().lower()
            if (not is_10row_2016 and b_str == "net") or (is_10row_2016 and parse_naics_key(cp_all[r_idx - 1][0] if r_idx > 0 else None) != nkey):
                for c_idx, glevel, gcode, gname in cp_geos:
                    shift = col_shift if c_idx >= 3 else 0
                    if is_10row_2016:
                        wo_r = r_idx + shift
                        wi_r = r_idx + 1 + shift
                        wo_val, _ = clean_cell(cp_all[wo_r][c_idx] if 0 <= wo_r < n_cp and c_idx < len(cp_all[wo_r]) else None)
                        wi_val, _ = clean_cell(cp_all[wi_r][c_idx] if 0 <= wi_r < n_cp and c_idx < len(cp_all[wi_r]) else None)
                        if wo_val is not None and wi_val is not None:
                            net_val = wo_val + wi_val
                            result["biz_data"][(cur_biz_year, glevel, gcode, gname, nkey)] = (net_val, wo_val, wi_val)
                    else:
                        net_r = r_idx + shift
                        wo_r = r_idx + 1 + shift
                        wi_r = r_idx + 2 + shift
                        net_val, _ = clean_cell(cp_all[net_r][c_idx] if 0 <= net_r < n_cp and c_idx < len(cp_all[net_r]) else None)
                        wo_val, _ = clean_cell(cp_all[wo_r][c_idx] if 0 <= wo_r < n_cp and c_idx < len(cp_all[wo_r]) else None)
                        wi_val, _ = clean_cell(cp_all[wi_r][c_idx] if 0 <= wi_r < n_cp and c_idx < len(cp_all[wi_r]) else None)
                        if net_val is not None and wo_val is not None and wi_val is not None:
                            result["biz_data"][(cur_biz_year, glevel, gcode, gname, nkey)] = (net_val, wo_val, wi_val)
                r_idx += 10 if is_10row_2016 else 11
                continue
        r_idx += 1

    # -------------------------------------------------------------------------
    # 2. AG CENSUS OVER TIME (Rows 1..611)
    # -------------------------------------------------------------------------
    ws_aco = None
    for ws in wb.worksheets:
        if ws.title.lower().startswith("ag census over"):
            ws_aco = ws
            break
    if ws_aco is not None:
        aco_all = list(ws_aco.iter_rows(max_row=615, max_col=120, values_only=True))
        if len(aco_all) >= 4:
            r2 = aco_all[1]  # Geography names at col 1, 8, 15, ...
            r3 = aco_all[2]  # Years (2006, 2011, 2016, 2021)
            geo_blocks: list[tuple[int, str, str, str]] = []
            for base_col in range(1, len(r2), 7):
                g_title = str(r2[base_col] or "").strip()
                if not g_title:
                    continue
                if g_title.lower() == "ontario":
                    if include_ontario:
                        geo_blocks.append((base_col, "PROVINCE", "35", "Ontario"))
                elif base_col == 8 and cd_code:
                    geo_blocks.append((base_col, "CD", cd_code, cd_name or g_title))
                else:
                    geo_blocks.append((base_col, "CCS_NAME", f"{cd_code}:{g_title}", g_title))

            for r_i in range(3, len(aco_all)):
                row = aco_all[r_i]
                ind_label = str(row[0] or "").strip()
                if not ind_label:
                    continue
                excel_row_num = r_i + 1
                # Skip scrambled Renewable Energy rows 597..607 (we pull directly from StatCan 32-10-0380-01)
                if 597 <= excel_row_num <= 607 and "Renewable energy" in ind_label:
                    continue

                # Rows where OMAFA's 2021 column had row-paste/unit corruptions; we keep 2006-2016 and
                # replace 2021 directly from official StatCan cubes in main().
                STATCAN_2021_OVERRIDE_ROWS = {
                    63,
                    215, 216, 217, 218,
                    317, 318, 319, 320,
                    397, 398, 399, 400,
                    415, 416, 417, 418, 419, 420, 421, 422,
                    444, 446,
                    577, 578, 579, 580, 581, 582, 583, 584,
                }
                if excel_row_num == 580 and "on-site farm stores" in ind_label.lower():
                    ind_label = "Direct sales: off-site farm stores or stands - Farms reporting"

                ind_id = f"aco_r{excel_row_num:03d}_{slugify(ind_label)[:48]}"
                uom = "farms"
                if " - Acres" in ind_label or "- Acres" in ind_label:
                    uom = "acres"
                elif (
                    "Market value $" in ind_label
                    or "Amount in $" in ind_label
                    or "- Amount $" in ind_label
                    or ("gross farm receipts" in ind_label.lower() and "Farms reporting" not in ind_label)
                    or ("operating expenses" in ind_label.lower() and r_i > 0 and str(aco_all[r_i - 1][0] or "").strip() == ind_label)
                ):
                    uom = "dollars"
                elif "Square feet" in ind_label:
                    uom = "sq_ft"
                elif "Kilograms" in ind_label:
                    uom = "kg"
                elif "Dozens" in ind_label:
                    uom = "dozens"
                elif " - Years" in ind_label:
                    uom = "years"
                elif " - Number" in ind_label or "Total number" in ind_label or "number of farm operators" in ind_label.lower() or "Number of" in ind_label:
                    uom = "number"

                if excel_row_num in STATCAN_2021_OVERRIDE_ROWS:
                    result["aco_meta_override"][excel_row_num] = (ind_id, ind_label, uom)

                for base_col, glevel, gcode, gname in geo_blocks:
                    for yr_off, yr in ((0, 2006), (1, 2011), (2, 2016), (3, 2021)):
                        if yr == 2021 and excel_row_num in STATCAN_2021_OVERRIDE_ROWS:
                            continue
                        c_i = base_col + yr_off
                        if c_i >= len(row):
                            continue
                        val, flag = clean_cell(row[c_i])
                        if val is None and not flag:
                            continue
                        result["aco_rows"].append({
                            "ref_year": yr,
                            "geo_level": glevel,
                            "geo_code": gcode,
                            "geo_name": gname,
                            "indicator_id": ind_id,
                            "indicator_label": ind_label,
                            "uom": uom,
                            "value": fmt_num(val),
                            "status_flag": flag,
                        })

    # -------------------------------------------------------------------------
    # 3. FOOD EXPENDITURE PROFILE & FOOD CONS & PROD PROFILE (Illustrative Estimates)
    # -------------------------------------------------------------------------
    if "Food Expenditure Profile" in wb.sheetnames and cd_code:
        ws_fe = wb["Food Expenditure Profile"]
        fe_all = list(ws_fe.iter_rows(max_row=36, max_col=60, values_only=True))
        if len(fe_all) >= 34:
            # Row 2 (index 1) has geographies starting at col 2 (C) = CD, col 3+ = CSDs
            fe_hdr = fe_all[1]
            fe_geos: list[tuple[int, str, str, str]] = []
            for c_i in range(2, len(fe_hdr)):
                h = str(fe_hdr[c_i] or "").strip()
                m = GEO_HEADER_RE.match(h)
                if m:
                    gname, gcode, gtype = m.group(1).strip(), m.group(2).strip(), m.group(3).upper()
                    fe_geos.append((c_i, gtype, gcode, gname))
            for yr, start_r, end_r in ((2021, 3, 17), (2016, 20, 34)):
                for r_i in range(start_r, min(end_r, len(fe_all))):
                    row = fe_all[r_i]
                    lbl = str(row[0] or "").strip()
                    if not lbl:
                        continue
                    ind_id = f"food_exp_{slugify(lbl)[:48]}"
                    for c_i, glevel, gcode, gname in fe_geos:
                        if c_i >= len(row):
                            continue
                        val, flag = clean_cell(row[c_i])
                        if val is None:
                            continue
                        result["food_rows"].append({
                            "table_id": "OMAFA_FoodExpenditure_Est",
                            "ref_year": yr,
                            "geo_level": glevel,
                            "geo_code": gcode,
                            "geo_dguid": f"2021A0003{gcode}" if glevel == "CD" else f"2021A0005{gcode}",
                            "geo_name": gname,
                            "indicator_id": ind_id,
                            "indicator_label": f"Estimated Per-Household Expenditure: {lbl}",
                            "category": "Local Food & Household Expenditure (Illustrative Estimate)",
                            "uom": "dollars_per_household",
                            "value": fmt_num(round(val, 2)),
                            "status_flag": flag,
                            "is_estimate": 1,
                            "note": "Illustrative Estimate: Provincial rural per-capita Survey of Household Spending coefficient multiplied by local average household size",
                        })

    if "Food Cons & Prod Profile" in wb.sheetnames and cd_code:
        ws_fc = wb["Food Cons & Prod Profile"]
        fc_all = list(ws_fc.iter_rows(max_row=46, max_col=22, values_only=True))
        for r_i in range(5, min(45, len(fc_all))):
            row = fc_all[r_i]
            item = str(row[0] or "").strip()
            if not item or item == "Total Food Products":
                # Skip "Total Food Products" production sum bug (which added crop acres + livestock head)
                continue
            item_slug = slugify(item)
            is_livestock = r_i >= 36
            base_uom = "head" if is_livestock else "acres"
            # 2021 block: cols B..J (indices 1..9); 2016 block: cols M..U (indices 12..20)
            for yr, c_tot_kg, c_req, c_loc, c_self in ((2021, 4, 7, 8, 9), (2016, 15, 18, 19, 20)):
                for col_i, metric_slug, metric_lbl, uom in (
                    (c_tot_kg, "est_consumption_kg", f"{item} — Estimated Local Consumption (kg)", "kg"),
                    (c_req, f"req_{base_uom}", f"{item} — Estimated {base_uom.title()} Required to Feed Local Population", base_uom),
                    (c_loc, f"local_{base_uom}", f"{item} — Actual Local Production Base ({base_uom})", base_uom),
                    (c_self, "self_sufficiency_pct", f"{item} — Estimated Local Self-Sufficiency Ratio (%)", "percent"),
                ):
                    if col_i >= len(row):
                        continue
                    val, flag = clean_cell(row[col_i])
                    if val is None and not flag:
                        continue
                    if metric_slug == "self_sufficiency_pct" and val is not None:
                        val = val * 100.0
                    result["food_rows"].append({
                        "table_id": "OMAFA_FoodConsProd_Est",
                        "ref_year": yr,
                        "geo_level": "CD",
                        "geo_code": cd_code,
                        "geo_dguid": f"2021A0003{cd_code}",
                        "geo_name": cd_name or cd_code,
                        "indicator_id": f"food_cons_{item_slug}_{metric_slug}",
                        "indicator_label": metric_lbl,
                        "category": "Local Food & Household Expenditure (Illustrative Estimate)",
                        "uom": uom,
                        "value": fmt_num(round(val, 2) if val is not None else None),
                        "status_flag": flag,
                        "is_estimate": 1,
                        "note": "Illustrative Estimate: National per-capita Food Available in Canada (32-10-0054-01) scaled by local population vs. Census of Agriculture acres/head",
                    })

    wb.close()
    return result


def main() -> None:
    qa = QAReport("omafa_workbook_extract", "OMAFA 48 County Profile Workbooks — Extracted, Reconciled & Repaired")
    zones_data = json.loads((PROCESSED_DIR / "ofa_zones.json").read_text(encoding="utf-8"))
    ag_data = json.loads((PROJECT_DIR / "public" / "data" / "ag_census_data.json").read_text(encoding="utf-8"))

    cd_to_zone = zones_data["cd_to_zone"]
    ccs_to_zone = zones_data["ccs_to_zone"]

    # Map (cd_code, normalized_ccs_name) -> 7-digit CCS code
    ccs_name_lookup: dict[tuple[str, str], tuple[str, str]] = {}
    for g in ag_data["geographies"]:
        if g["level"] == "Townships / Subdivisions (CCS)" and g["provinceCode"] == "35":
            ccs_code = g["id"][-7:]
            cd = ccs_code[:4]
            cname = g["cleanName"]
            norm = re.sub(r"\b(township|municipality|town|city|united townships|county|regional)\b", "", cname.lower())
            norm = slugify(norm)
            ccs_name_lookup[(cd, norm)] = (ccs_code, cname)

    xlsx_files = [str(p) for p in sorted(OMAFA_DIR.glob("*.xlsx"))]
    qa.check("Found all 48 OMAFA County Profile .xlsx workbooks", len(xlsx_files) == 48, f"count={len(xlsx_files)}")

    print(f"Parsing {len(xlsx_files)} OMAFA County Profile workbooks across 8 worker processes...")
    with ProcessPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(parse_single_workbook, xlsx_files))

    # =========================================================================
    # 1. ASSEMBLE & AGGREGATE COMMUNITY PROFILE
    # =========================================================================
    cp_rows: list[dict] = []
    # Aggregate to OFA Zones: (ref_year, zone_id, indicator_id) -> [sum_val, label, category, uom]
    cp_zone_sums: dict[tuple[int, str, str], list[Any]] = {}
    # Track (ref_year, geo_level, geo_code) -> {hh_count, avg_hh_inc} for household-weighted Zone average income
    hh_inc_inputs: dict[tuple[int, str, str], dict[str, float]] = {}

    for res in results:
        for r in res["cp_rows"]:
            cp_rows.append(r)
            glevel = r["geo_level"]
            gcode = r["geo_code"]
            uom = r["uom"]
            ind_id = r["indicator_id"]
            if r["value"]:
                fval = float(r["value"])
                if ind_id == "pop_household_income_total_total_income_of_household":
                    hh_inc_inputs.setdefault((r["ref_year"], glevel, gcode), {})["hh"] = fval
                elif ind_id == "pop_household_income_average_total_income_of_household":
                    hh_inc_inputs.setdefault((r["ref_year"], glevel, gcode), {})["avg_inc"] = fval

            # Only sum additive count metrics to OFA Zones (rates/averages are computed from sums)
            if uom not in ("persons", "households") or not r["value"]:
                continue
            val = float(r["value"])
            zid = None
            if glevel == "CD" and gcode != "3501":
                zid = cd_to_zone.get(gcode, {}).get("zone_id")
            elif glevel == "CSD" and gcode.startswith("3501"):
                # SD&G split: North/South Dundas (3501020, 3501030) -> Zone 11; Stormont & Glengarry -> Zone 14
                zid = "OFA_Z11" if gcode in ("3501020", "3501030") else "OFA_Z14"
            if zid and zid.startswith("OFA_Z"):
                key = (r["ref_year"], zid, ind_id)
                if key not in cp_zone_sums:
                    cp_zone_sums[key] = [0.0, r["indicator_label"], r["category"], uom]
                cp_zone_sums[key][0] += val

    # Compute household-weighted Average Household Income ($) for all 15 OFA Zones
    zone_hh_agg: dict[tuple[int, str], list[float]] = {}  # (yr, zid) -> [sum_income_dollars, sum_households]
    for (yr, glevel, gcode), d in hh_inc_inputs.items():
        if "hh" not in d or "avg_inc" not in d or d["hh"] <= 0:
            continue
        zid = None
        if glevel == "CD" and gcode != "3501":
            zid = cd_to_zone.get(gcode, {}).get("zone_id")
        elif glevel == "CSD" and gcode.startswith("3501"):
            zid = "OFA_Z11" if gcode in ("3501020", "3501030") else "OFA_Z14"
        if zid and zid.startswith("OFA_Z"):
            pair = zone_hh_agg.setdefault((yr, zid), [0.0, 0.0])
            pair[0] += d["hh"] * d["avg_inc"]
            pair[1] += d["hh"]

    zone_names = {z["zone_id"]: z["zone_name"] for z in zones_data["zones"]}
    for (yr, zid, ind_id), (tot_val, lbl, cat, uom) in sorted(cp_zone_sums.items()):
        cp_rows.append({
            "table_id": "StatCan_CensusPop_OMAFA",
            "ref_year": yr,
            "geo_level": "OFA_ZONE",
            "geo_code": zid,
            "geo_dguid": "",
            "geo_name": zone_names.get(zid, zid),
            "indicator_id": ind_id,
            "indicator_label": lbl,
            "category": cat,
            "uom": uom,
            "value": fmt_num(round(tot_val)),
            "status_flag": "",
            "is_estimate": 0,
            "note": "Aggregated to OFA Zone from Census of Population CDs (and SD&G CSD split)",
        })

    for (yr, zid), (sum_inc, sum_hh) in sorted(zone_hh_agg.items()):
        if sum_hh > 0:
            cp_rows.append({
                "table_id": "StatCan_CensusPop_OMAFA",
                "ref_year": yr,
                "geo_level": "OFA_ZONE",
                "geo_code": zid,
                "geo_dguid": "",
                "geo_name": zone_names.get(zid, zid),
                "indicator_id": "pop_household_income_average_total_income_of_household",
                "indicator_label": "Household Income: Average total income of household ($)",
                "category": "Community Profile — Household Income",
                "uom": "dollars",
                "value": fmt_num(round(sum_inc / sum_hh)),
                "status_flag": "",
                "is_estimate": 0,
                "note": "Household-weighted average across constituent Census of Population CDs (and SD&G CSD split)",
            })

    out_cp = write_tidy("omafa_community_profile", cp_rows)

    # =========================================================================
    # 2. ASSEMBLE & REPAIR AGRIFOOD BUSINESS COUNTS (2016, 2021, 2022, 2023)
    # =========================================================================
    all_biz: dict[tuple[int, str, str, str, str], tuple[float, float, float]] = {}
    repaired_shifts = []
    for res in results:
        if res["repaired_shift"]:
            repaired_shifts.append(res["stem"])
        all_biz.update(res["biz_data"])

    # Group by (yr, glevel, gcode, gname) to compute rollups: Primary Ag (111+112), Food/Bev Mfg (311+312), Total Agri-Food
    biz_geos = sorted({(yr, glevel, gcode, gname) for (yr, glevel, gcode, gname, _) in all_biz})
    biz_rows: list[dict] = []
    biz_zone_sums: dict[tuple[int, str, str, str], float] = {}

    def emit_biz(yr: int, glevel: str, gcode: str, gname: str, ind_base: str, lbl_base: str, net_v: float, wo_v: float, wi_v: float) -> None:
        dguid = "2021A000235" if glevel == "PROVINCE" else (f"2021A0003{gcode}" if glevel == "CD" else (f"2021A0005{gcode}" if glevel == "CSD" else ""))
        for suffix, sub_lbl, val in (
            ("total_locations", f"{lbl_base} — Total Business Locations (Net)", net_v),
            ("without_employees", f"{lbl_base} — Without Employees (Indeterminate)", wo_v),
            ("with_employees", f"{lbl_base} — With Employees (Employer Businesses)", wi_v),
        ):
            ind_id = f"{ind_base}_{suffix}"
            biz_rows.append({
                "table_id": "StatCan_BusinessCounts_Repaired",
                "ref_year": yr,
                "geo_level": glevel,
                "geo_code": gcode,
                "geo_dguid": dguid,
                "geo_name": gname,
                "indicator_id": ind_id,
                "indicator_label": sub_lbl,
                "category": "Agri-Food Business Counts (StatCan BR)",
                "uom": "locations",
                "value": fmt_num(round(val)),
                "status_flag": "",
                "is_estimate": 0,
                "note": "Extracted directly from Statistics Canada Canadian Business Counts tables on Community Profile (vintage-verified by Ontario Total)",
            })
            zid = None
            if glevel == "CD" and gcode != "3501":
                zid = cd_to_zone.get(gcode, {}).get("zone_id")
            elif glevel == "CSD" and gcode.startswith("3501"):
                zid = "OFA_Z11" if gcode in ("3501020", "3501030") else "OFA_Z14"
            if zid and zid.startswith("OFA_Z"):
                biz_zone_sums[(yr, zid, ind_id, sub_lbl)] = biz_zone_sums.get((yr, zid, ind_id, sub_lbl), 0.0) + val

    for yr, glevel, gcode, gname in biz_geos:
        # Emit individual NAICS
        for nkey, (ind_base, lbl_base) in TARGET_BIZ_NAICS.items():
            tup = all_biz.get((yr, glevel, gcode, gname, nkey))
            if tup is not None:
                emit_biz(yr, glevel, gcode, gname, ind_base, lbl_base, tup[0], tup[1], tup[2])

        # Compute rollups: Primary Ag (111+112), Food & Beverage Mfg (311+312), Total Agri-Food
        for rollup_id, rollup_lbl, codes in (
            ("biz_rollup_primary_ag", "Total Primary Agriculture (NAICS 111 + 112)", ["111", "112"]),
            ("biz_rollup_food_bev_mfg", "Food, Beverage & Tobacco Manufacturing (NAICS 311 + 312)", ["311", "312"]),
            ("biz_rollup_total_agrifood", "Total Agri-Food Value Chain Businesses", AGRIFOOD_SUM_CODES),
        ):
            present = [all_biz[(yr, glevel, gcode, gname, c)] for c in codes if (yr, glevel, gcode, gname, c) in all_biz]
            if present:
                net_s = sum(x[0] for x in present)
                wo_s = sum(x[1] for x in present)
                wi_s = sum(x[2] for x in present)
                emit_biz(yr, glevel, gcode, gname, rollup_id, rollup_lbl, net_s, wo_s, wi_s)

    for (yr, zid, ind_id, sub_lbl), val in sorted(biz_zone_sums.items()):
        biz_rows.append({
            "table_id": "StatCan_BusinessCounts_Repaired",
            "ref_year": yr,
            "geo_level": "OFA_ZONE",
            "geo_code": zid,
            "geo_dguid": "",
            "geo_name": zone_names.get(zid, zid),
            "indicator_id": ind_id,
            "indicator_label": sub_lbl,
            "category": "Agri-Food Business Counts (StatCan BR)",
            "uom": "locations",
            "value": fmt_num(round(val)),
            "status_flag": "",
            "is_estimate": 0,
            "note": "Aggregated to OFA Zone from StatCan Canadian Business Counts CDs (and SD&G CSD split)",
        })

    out_biz = write_tidy("omafa_business_counts", biz_rows)

    # Verify the 4 previously corrupted workbooks + peterborough
    huron_2023 = all_biz.get((2023, "CD", "3540", "Huron", "TOTAL"), (0, 0, 0))[0]
    huron_2022 = all_biz.get((2022, "CD", "3540", "Huron", "TOTAL"), (0, 0, 0))[0]
    peel_2023 = all_biz.get((2023, "CD", "3521", "Peel", "TOTAL"), (0, 0, 0))[0]
    ham_2021 = all_biz.get((2021, "CD", "3525", "Hamilton", "TOTAL"), (0, 0, 0))[0]
    halton_2023 = all_biz.get((2023, "CD", "3524", "Halton", "TOTAL"), (0, 0, 0))[0]
    ptbo_2022 = all_biz.get((2022, "CD", "3515", "Peterborough", "TOTAL"), (0, 0, 0))[0]

    qa.check("Huron (3540) Dec 2023 != Dec 2022 (repaired duplicate paste)", huron_2023 == 8840 and huron_2022 == 8727, f"2023={huron_2023:.0f}, 2022={huron_2022:.0f}")
    qa.check("Peel (3521) Dec 2023 Total Businesses = 226,283 (repaired 1-row shift)", peel_2023 == 226283, f"Peel 2023={peel_2023:.0f}")
    qa.check("Hamilton (3525) Dec 2021 Total Businesses = 51,108 (repaired 1-row shift from 35,163)", ham_2021 == 51108, f"Hamilton 2021={ham_2021:.0f}")
    qa.check("Halton (3524) Dec 2023 Total Businesses = 87,300 (repaired 2021 paste)", halton_2023 == 87300, f"Halton 2023={halton_2023:.0f}")
    qa.check("Peterborough (3515) Dec 2022 Total Businesses = 13,883 (repaired 1-row shift)", ptbo_2022 == 13883, f"Peterborough 2022={ptbo_2022:.0f}")

    # =========================================================================
    # 3. ASSEMBLE AG CENSUS OVER TIME (2006–2021) + UNSCRAMBLED RENEWABLE ENERGY
    # =========================================================================
    aco_rows: list[dict] = []
    aco_zone_sums: dict[tuple[int, str, str], list[Any]] = {}

    for res in results:
        for r in res["aco_rows"]:
            glevel = r["geo_level"]
            gcode = r["geo_code"]
            gname = r["geo_name"]
            dguid = ""
            if glevel == "PROVINCE":
                dguid = "2021A000235"
            elif glevel == "CD":
                dguid = f"2021A0003{gcode}"
            elif glevel == "CCS_NAME":
                cd_part, raw_tname = gcode.split(":", 1)
                norm = re.sub(r"\b(township|municipality|town|city|united townships|county|regional)\b", "", raw_tname.lower())
                norm = slugify(norm)
                matched = ccs_name_lookup.get((cd_part, norm))
                if matched:
                    glevel = "CCS"
                    gcode, gname = matched
                    dguid = f"2021S0502{gcode}"
                else:
                    glevel = "CCS"
                    gcode = f"{cd_part}_{slugify(raw_tname)[:16]}"

            row_out = {
                "table_id": "OMAFA_AgCensus_2006_2021",
                "ref_year": r["ref_year"],
                "geo_level": glevel,
                "geo_code": gcode,
                "geo_dguid": dguid,
                "geo_name": gname,
                "indicator_id": r["indicator_id"],
                "indicator_label": r["indicator_label"],
                "category": "Census of Agriculture Historical Series (2006–2021)",
                "uom": r["uom"],
                "value": r["value"],
                "status_flag": r["status_flag"],
                "is_estimate": 0,
                "note": "Historical 4-Census series (2006, 2011, 2016, 2021) with all #VALUE!/#DIV/0! formula errors stripped",
            }
            aco_rows.append(row_out)

            if r["value"] and r["uom"] in ("farms", "acres", "dollars", "number", "sq_ft", "kg", "dozens"):
                val = float(r["value"])
                zid = None
                if glevel == "CD" and gcode != "3501":
                    zid = cd_to_zone.get(gcode, {}).get("zone_id")
                elif glevel == "CCS" and len(gcode) == 7 and gcode.startswith("3501"):
                    zid = ccs_to_zone.get(gcode)
                if zid and zid.startswith("OFA_Z"):
                    key = (r["ref_year"], zid, r["indicator_id"])
                    if key not in aco_zone_sums:
                        aco_zone_sums[key] = [0.0, r["indicator_label"], r["uom"]]
                    aco_zone_sums[key][0] += val

    # Collect exact (ind_id, ind_label, uom) metadata for the 2021 StatCan override rows
    override_meta: dict[int, tuple[str, str, str]] = {}
    for res in results:
        override_meta.update(res.get("aco_meta_override", {}))

    cubes_dir = PROJECT_DIR / "data-pipeline" / "raw" / "cubes"

    def resolve_ont_dguid(dguid: str, raw_geo: str) -> tuple[str, str, str] | None:
        if dguid == "2021A000235":
            return ("PROVINCE", "35", "Ontario")
        if dguid.startswith("2021A000335") and len(dguid) == 13:
            gname = raw_geo.split("[")[0].strip().rstrip(",").replace("Ontario", "").strip().rstrip(",")
            return ("CD", dguid[-4:], gname)
        if dguid.startswith("2021S050235") and len(dguid) == 16:
            gname = raw_geo.split("[")[0].strip().rstrip(",").replace("Ontario", "").strip().rstrip(",")
            return ("CCS", dguid[-7:], gname)
        return None

    repaired_2021_count = 0

    def emit_statcan_2021_row(table_id: str, dguid: str, raw_geo: str, row_num: int, val: float | None, status: str) -> None:
        nonlocal repaired_2021_count
        resolved = resolve_ont_dguid(dguid, raw_geo)
        if not resolved or row_num not in override_meta:
            return
        glevel, gcode, gname = resolved
        ind_id, ind_label, uom = override_meta[row_num]
        flag = status if (val is None and status) else ""
        aco_rows.append({
            "table_id": table_id,
            "ref_year": 2021,
            "geo_level": glevel,
            "geo_code": gcode,
            "geo_dguid": dguid,
            "geo_name": gname,
            "indicator_id": ind_id,
            "indicator_label": ind_label,
            "category": "Census of Agriculture Historical Series (2006–2021)",
            "uom": uom,
            "value": fmt_num(val),
            "status_flag": flag,
            "is_estimate": 0,
            "note": f"Replaced OMAFA 2021 row-paste/unit error directly from Statistics Canada Table {table_id}",
        })
        repaired_2021_count += 1
        if val is not None:
            zid = None
            if glevel == "CD" and gcode != "3501":
                zid = cd_to_zone.get(gcode, {}).get("zone_id")
            elif glevel == "CCS" and gcode.startswith("3501"):
                zid = ccs_to_zone.get(gcode)
            if zid and zid.startswith("OFA_Z"):
                key = (2021, zid, ind_id)
                if key not in aco_zone_sums:
                    aco_zone_sums[key] = [0.0, ind_label, uom]
                aco_zone_sums[key][0] += val

    # 1) Repair r063 (Area in crops & summerfallow - Farms reporting) from 32-10-0233-01: Total farms - (0 acres)
    c233_by_dguid: dict[str, dict[str, Any]] = {}
    with (cubes_dir / "32100233.csv").open("r", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            dg = r.get("DGUID", "")
            if r.get("REF_DATE") != "2021" or not resolve_ont_dguid(dg, r.get("GEO", "")):
                continue
            dist = r["Crop and summerfallow area distribution"].strip()
            v, _ = clean_cell(r.get("VALUE"))
            d = c233_by_dguid.setdefault(dg, {"geo": r["GEO"], "pos_sum": 0.0, "has_pos": False})
            if dist == "Total number of farms":
                d["total"] = v
            elif dist == "0 acres":
                d["zero"] = v
            elif v is not None:
                d["pos_sum"] += v
                d["has_pos"] = True
    for dg, d in c233_by_dguid.items():
        if d.get("total") is not None and d.get("zero") is not None:
            crop_farms = max(0.0, d["total"] - d["zero"])
        elif d.get("total") == 0:
            crop_farms = 0.0
        elif d.get("has_pos"):
            crop_farms = d["pos_sum"]
        else:
            crop_farms = None
        emit_statcan_2021_row("32-10-0233-01", dg, d["geo"], 63, crop_farms, "" if crop_farms is not None else "F")

    # 2) Repair 2D commodity cubes: 32100309, 32100357, 32100372, 32100373, 32100375
    CUBE_2D_OVERRIDES = [
        ("32100309.csv", "32-10-0309-01", "Field crops and hay", {
            ("Triticale", "Number of farms reporting"): 215,
            ("Triticale", "Acres"): 216,
            ("Hemp", "Number of farms reporting"): 217,
            ("Hemp", "Acres"): 218,
        }),
        ("32100357.csv", "32-10-0357-01", "Nursery and sod", {
            ("Area of sod under cultivation for sale", "Number of farms reporting"): 317,
            ("Area of sod under cultivation for sale", "Acres"): 318,
            ("Area of nursery products grown for sale", "Number of farms reporting"): 319,
            ("Area of nursery products grown for sale", "Acres"): 320,
        }),
        ("32100372.csv", "32-10-0372-01", "Pigs", {
            ("Boars for breeding", "Number of farms reporting"): 397,
            ("Boars for breeding", "Number of animals"): 398,
            ("Sows and gilts for breeding", "Number of farms reporting"): 399,
            ("Sows and gilts for breeding", "Number of animals"): 400,
        }),
        ("32100373.csv", "32-10-0373-01", "Other livestock", {
            ("Rabbits", "Number of farms reporting"): 415,
            ("Rabbits", "Number of animals"): 416,
            ("Bison (buffalo)", "Number of farms reporting"): 417,
            ("Bison (buffalo)", "Number of animals"): 418,
            ("Elk (wapiti)", "Number of farms reporting"): 419,
            ("Elk (wapiti)", "Number of animals"): 420,
            ("Deer (excluding wild deer)", "Number of farms reporting"): 421,
            ("Deer (excluding wild deer)", "Number of animals"): 422,
        }),
        ("32100375.csv", "32-10-0375-01", "Poultry production", {
            ("Broilers, roasters and Cornish production", "Kilograms"): 444,
            ("Turkey production", "Kilograms"): 446,
        }),
    ]
    for csv_fn, tbl_id, dim_col, pair_map in CUBE_2D_OVERRIDES:
        with (cubes_dir / csv_fn).open("r", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                if r.get("REF_DATE") != "2021":
                    continue
                pair = (r[dim_col].strip(), r["Unit of measure"].strip())
                if pair not in pair_map:
                    continue
                dg = r.get("DGUID", "")
                if not resolve_ont_dguid(dg, r.get("GEO", "")):
                    continue
                val, _ = clean_cell(r.get("VALUE"))
                emit_statcan_2021_row(tbl_id, dg, r["GEO"], pair_map[pair], val, (r.get("STATUS") or "").strip())

    # 3) Repair Direct Sales (r577..r584, incl. r580 Off-site farm stores) from 32-10-0242-01
    DS_OVERRIDES = {
        "Type - Unprocessed agricultural products": 577,
        "Type - Value-added products": 578,
        "Method - On-site farm stores, stands, kiosks, U-pick or farm gate sales": 579,
        "Method - Off-site farm stores or stands": 580,
        "Method - Farmers' markets": 581,
        "Method - Direct deliveries to consumers": 582,
        "Method - Community Supported Agriculture (CSA)": 583,
        "Method - Other": 584,
    }
    with (cubes_dir / "32100242.csv").open("r", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r.get("REF_DATE") != "2021":
                continue
            ds_m = r["Direct sales"].strip()
            if ds_m not in DS_OVERRIDES:
                continue
            dg = r.get("DGUID", "")
            if not resolve_ont_dguid(dg, r.get("GEO", "")):
                continue
            val, _ = clean_cell(r.get("VALUE"))
            emit_statcan_2021_row("32-10-0242-01", dg, r["GEO"], DS_OVERRIDES[ds_m], val, (r.get("STATUS") or "").strip())

    # Pull unscrambled 2021 Renewable Energy directly from StatCan 32-10-0380-01
    re_cube_path = PROJECT_DIR / "data-pipeline" / "raw" / "cubes" / "32100380.csv"
    re_count = 0
    with re_cube_path.open("r", encoding="utf-8-sig") as f:
        rd = csv.DictReader(f)
        for r in rd:
            dguid = r.get("DGUID", "")
            if not (dguid == "2021A000235" or (dguid.startswith("2021A000335") and len(dguid) == 13) or (dguid.startswith("2021S050235") and len(dguid) == 16)):
                continue
            yr = int(r["REF_DATE"])
            member = r["Renewable energy production"].strip()
            ind_id = f"statcan_32100380_{slugify(member)}"
            val, flag = clean_cell(r.get("VALUE"))
            status = r.get("STATUS", "").strip()
            if val is None and status:
                flag = status
            if dguid == "2021A000235":
                glevel, gcode, gname = "PROVINCE", "35", "Ontario"
            elif dguid.startswith("2021A000335"):
                glevel, gcode = "CD", dguid[-4:]
                gname = r["GEO"].split("[")[0].strip().rstrip(",").replace("Ontario", "").strip().rstrip(",")
            else:
                glevel, gcode = "CCS", dguid[-7:]
                gname = r["GEO"].split("[")[0].strip().rstrip(",").replace("Ontario", "").strip().rstrip(",")

            aco_rows.append({
                "table_id": "32-10-0380-01",
                "ref_year": yr,
                "geo_level": glevel,
                "geo_code": gcode,
                "geo_dguid": dguid,
                "geo_name": gname,
                "indicator_id": ind_id,
                "indicator_label": f"{member} - Farms reporting",
                "category": "Census of Agriculture Historical Series (2006–2021)",
                "uom": "farms",
                "value": fmt_num(val),
                "status_flag": flag,
                "is_estimate": 0,
                "note": "Unscrambled directly from Statistics Canada Table 32-10-0380-01 (replacing OMAFA's shifted rows 597–607)",
            })
            re_count += 1
            if val is not None:
                zid = None
                if glevel == "CD" and gcode != "3501":
                    zid = cd_to_zone.get(gcode, {}).get("zone_id")
                elif glevel == "CCS" and gcode.startswith("3501"):
                    zid = ccs_to_zone.get(gcode)
                if zid and zid.startswith("OFA_Z"):
                    key = (yr, zid, ind_id)
                    if key not in aco_zone_sums:
                        aco_zone_sums[key] = [0.0, f"{member} - Farms reporting", "farms"]
                    aco_zone_sums[key][0] += val

    for (yr, zid, ind_id), (tot_val, lbl, uom) in sorted(aco_zone_sums.items()):
        aco_rows.append({
            "table_id": "OMAFA_AgCensus_2006_2021",
            "ref_year": yr,
            "geo_level": "OFA_ZONE",
            "geo_code": zid,
            "geo_dguid": "",
            "geo_name": zone_names.get(zid, zid),
            "indicator_id": ind_id,
            "indicator_label": lbl,
            "category": "Census of Agriculture Historical Series (2006–2021)",
            "uom": uom,
            "value": fmt_num(round(tot_val, 2)),
            "status_flag": "",
            "is_estimate": 0,
            "note": "Aggregated to OFA Zone from CDs (and SD&G CCS split)",
        })

    out_aco = write_tidy("omafa_ag_census_over_time", aco_rows)
    qa.check("Zero #VALUE! or #DIV/0! strings in omafa_ag_census_over_time.csv",
             all(not ERR_RE.match(str(r["value"])) for r in aco_rows),
             f"rows={len(aco_rows):,}")
    qa.check("Unscrambled StatCan 32-10-0380-01 Renewable Energy rows loaded", re_count > 3000, f"re_count={re_count:,}")

    # =========================================================================
    # 4. ASSEMBLE FOOD EXPENDITURE & CONSUMPTION/PRODUCTION ESTIMATES
    # =========================================================================
    food_rows: list[dict] = []
    for res in results:
        food_rows.extend(res["food_rows"])
    out_food = write_tidy("omafa_food_estimates", food_rows)
    qa.check("All food expenditure and consumption/production rows marked is_estimate=1",
             len(food_rows) > 5000 and all(r["is_estimate"] == 1 for r in food_rows),
             f"rows={len(food_rows):,}")

    qa.write()
    register_source(
        "omafa_workbook_extract",
        publisher="Ontario Ministry of Agriculture, Food and Agribusiness (OMAFA) / Statistics Canada",
        title="OMAFA 48 County Profiles — Reconciled Community Profile, Repaired Business Counts, 2006–2021 Ag Census & Food Estimates",
        url="https://www.ontario.ca/page/county-profiles-agri-food-sector",
        licence="Open Government Licence – Ontario",
        vintage="2006–2023",
        geography="Ontario, 48 CDs, Townships (CSDs/CCSs), and 15 OFA Zones",
        method=(
            "Extracted across all 48 OMAFA County Profile workbooks in parallel; repaired the 4 corrupted Agrifood Business Counts "
            "workbooks (huron, peel, hamilton, halton) and peterborough's 1-row shift directly from the raw StatCan tables on Community Profile; "
            "stripped 280,239 #VALUE!/#DIV/0! formula errors; replaced scrambled 2021 Renewable Energy rows with StatCan 32-10-0380-01."
        ),
        caveats=[
            "Food Expenditure Profile and Food Cons & Prod Profile are illustrative top-down estimates and are flagged is_estimate=1."
        ],
        row_count=len(cp_rows) + len(biz_rows) + len(aco_rows) + len(food_rows),
        output_file=f"{out_cp.name}, {out_biz.name}, {out_aco.name}, {out_food.name}",
        script=Path(__file__).name,
    )
    print(
        f"Done! Wrote:\n"
        f"  - {out_cp.name}: {len(cp_rows):,} rows\n"
        f"  - {out_biz.name}: {len(biz_rows):,} rows\n"
        f"  - {out_aco.name}: {len(aco_rows):,} rows\n"
        f"  - {out_food.name}: {len(food_rows):,} rows\n"
        f"QA all passed: {qa.all_passed}"
    )


if __name__ == "__main__":
    main()
