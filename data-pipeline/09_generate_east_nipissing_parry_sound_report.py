"""
09_generate_east_nipissing_parry_sound_report.py
Generates the ready-to-send East Nipissing & Parry Sound Combined + Individual Breakdown
Agricultural Profile Report in both PDF (.pdf) and Word (.docx) formats directly in
c:\\Projects\\Census Tool\\ for immediate OFA field staff use.
"""

import json
from pathlib import Path
from playwright.sync_api import sync_playwright
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

PROJECT_DIR = Path(r"c:\Projects\Census Tool")
DATA_PATH = PROJECT_DIR / "public" / "data" / "ag_census_data.json"
OUT_PDF = PROJECT_DIR / "East_Nipissing_Parry_Sound_Ag_Profile_OFA.pdf"
OUT_HTML = PROJECT_DIR / "East_Nipissing_Parry_Sound_Ag_Profile_OFA.html"
OUT_DOCX = PROJECT_DIR / "East_Nipissing_Parry_Sound_Ag_Profile_OFA.docx"
ARTIFACT_SCREENSHOT = Path(r"C:\Users\ben.lefort\.gemini\antigravity\brain\23b428a3-5d13-4e1a-9b57-721583ddcbae\ofa_10_multi_area_report_modal.png")

with open(DATA_PATH, "r", encoding="utf-8") as f:
    dataset = json.load(f)

# Ensure 2021 StatCan table citations are 100% synced in ag_census_data.json
TABLE_CODE_FIXES = {
    "32-10-0309-01": "32-10-0359-01",
    "32-10-0315-01": "32-10-0361-01",
    "32-10-0355-01": "32-10-0363-01",
}
json_updated = False
for c in dataset["characteristics"]:
    old_t = c.get("statcanTable")
    if old_t in TABLE_CODE_FIXES:
        new_t = TABLE_CODE_FIXES[old_t]
        c["statcanTable"] = new_t
        if "baseDescription" in c and isinstance(c["baseDescription"], str):
            c["baseDescription"] = c["baseDescription"].replace(old_t, new_t)
        json_updated = True

if json_updated:
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(dataset, f, separators=(",", ":"))
    print("Updated public/data/ag_census_data.json table PIDs (32-10-0359-01, 32-10-0361-01, 32-10-0363-01).")

values_db = dataset["values"]
char_by_id = {c["id"]: c for c in dataset["characteristics"]}
geo_by_id = {g["id"]: g for g in dataset["geographies"]}

# Key geographies:
# 1. Parry Sound District (CD 3549): 2021A00033549
# 2. Nipissing District (CD 3548): 2021A00033548
# 3. East Nipissing Townships Only (Bonfield, Chisholm, Nipissing Unorg North, Nipissing Unorg South)
# 4. West Nipissing Municipality (2021S05023548055)
PARRY_SOUND_CD = "2021A00033549"
NIPISSING_CD = "2021A00033548"
EAST_NIPISSING_CCS_IDS = [
    "2021S05023548027",  # Bonfield
    "2021S05023548031",  # Chisholm
    "2021S05023548094",  # Nipissing, Unorganized, North Part
    "2021S05023548091",  # Nipissing, Unorganized, South Part
]
WEST_NIPISSING_CCS = "2021S05023548055"

PARRY_SOUND_CCS_IDS = [
    "2021S05023549060",  # Powassan (63 farms)
    "2021S05023549019",  # Armour (31 farms)
    "2021S05023549043",  # Magnetawan (26 farms)
    "2021S05023549046",  # Strong (20 farms)
    "2021S05023549039",  # Whitestone (18 farms)
    "2021S05023549071",  # Nipissing Twp in Parry Sound (15 farms)
    "2021S05023549096",  # Parry Sound Unorganized Centre (13 farms)
    "2021S05023549054",  # Machar (10 farms)
    "2021S05023549066",  # Callander (9 farms)
    "2021S05023549003",  # Seguin (8 farms)
    "2021S05023549024",  # Ryerson (7 farms)
]


def get_val(gid: str, cid: str, idx: int = 0):
    arr = values_db.get(gid, {}).get(cid)
    if not arr or idx >= len(arr):
        return None
    v = arr[idx]
    return v if isinstance(v, (int, float)) else None


def get_status(gid: str, cid: str):
    if get_val(gid, cid, 0) is not None:
        return None
    arr = values_db.get(gid, {}).get(cid)
    if arr and len(arr) >= 3 and isinstance(arr[2], str):
        return arr[2]
    return "x"


def compute_group_val(gids: list[str], cid: str, idx: int = 0):
    if cid == "avg_farm_size_acres":
        ac = sum(get_val(g, "land_total_acres", idx) or 0 for g in gids)
        fm = sum(get_val(g, "total_farms", idx) or 0 for g in gids)
        return ac / fm if fm > 0 else None
    if cid == "avg_rev_per_farm":
        rv = sum(get_val(g, "rev_total_dollars", idx) or 0 for g in gids)
        fm = sum(get_val(g, "total_farms", idx) or 0 for g in gids)
        return rv / fm if fm > 0 else None
    if cid == "avg_exp_per_farm":
        ex = sum(get_val(g, "exp_total_dollars", idx) or 0 for g in gids)
        fm = sum(get_val(g, "total_farms", idx) or 0 for g in gids)
        return ex / fm if fm > 0 else None
    if cid == "avg_net_income_per_farm":
        rv = sum(get_val(g, "rev_total_dollars", idx) or 0 for g in gids)
        ex = sum(get_val(g, "exp_total_dollars", idx) or 0 for g in gids)
        fm = sum(get_val(g, "total_farms", idx) or 0 for g in gids)
        return (rv - ex) / fm if fm > 0 else None
    if cid == "net_operating_margin_pct":
        rv = sum(get_val(g, "rev_total_dollars", idx) or 0 for g in gids)
        ex = sum(get_val(g, "exp_total_dollars", idx) or 0 for g in gids)
        return ((rv - ex) / rv) * 100.0 if rv > 0 else None
    if cid == "avg_capital_per_farm":
        cp = sum(get_val(g, "cap_total_dollars", idx) or 0 for g in gids)
        fm = sum(get_val(g, "total_farms", idx) or 0 for g in gids)
        return cp / fm if fm > 0 else None
    if cid == "land_bldg_value_per_acre":
        w_sum = 0.0
        ac_sum = 0.0
        for g in gids:
            v = get_val(g, "land_bldg_value_per_acre", idx)
            ac = get_val(g, "land_total_acres", idx)
            if v is not None and ac is not None and ac > 0:
                w_sum += v * ac
                ac_sum += ac
        return w_sum / ac_sum if ac_sum > 0 else None
    if cid == "op_avg_age":
        w_age = 0.0
        op_sum = 0.0
        for g in gids:
            age = get_val(g, "op_avg_age", idx)
            ops = get_val(g, "op_total_operators", idx) or get_val(g, "total_farms", idx)
            if age is not None and ops is not None and ops > 0:
                w_age += age * ops
                op_sum += ops
        return w_age / op_sum if op_sum > 0 else None

    vals = [get_val(g, cid, idx) for g in gids]
    valid = [v for v in vals if v is not None]
    if not valid:
        return None
    return sum(valid)


def fmt_val(val, unit: str, status=None):
    if val is None:
        if status == "x":
            return "x (Suppressed)"
        return "—"
    if unit == "DOLLARS":
        return f"${int(round(val)):,}"
    if unit == "PERCENT":
        return f"{val:.1f}%"
    if unit == "AGE":
        return f"{val:.1f} yrs"
    if isinstance(val, float) and not val.is_integer():
        return f"{val:,.1f}"
    return f"{int(round(val)):,}"


def fmt_cell(gids: list[str], cid: str):
    meta = char_by_id[cid]
    unit = meta["unit"]
    v21 = compute_group_val(gids, cid, 0)
    v16 = compute_group_val(gids, cid, 1)

    sup_count = sum(1 for g in gids if get_val(g, cid, 0) is None and get_status(g, cid) == "x")
    valid_count = sum(1 for g in gids if get_val(g, cid, 0) is not None)
    is_derived_ratio = cid in {
        "avg_farm_size_acres",
        "avg_rev_per_farm",
        "avg_exp_per_farm",
        "avg_net_income_per_farm",
        "net_operating_margin_pct",
        "avg_capital_per_farm",
        "land_bldg_value_per_acre",
        "op_avg_age",
    }

    if len(gids) == 1:
        status = get_status(gids[0], cid)
        main_str = fmt_val(v21, unit, status)
        sub_parts = []
        if meta.get("baseId") and v21 is not None and unit == "FARMS":
            base21 = compute_group_val(gids, meta["baseId"], 0)
            if base21 and base21 > 0:
                sub_parts.append(f"{(v21 / base21) * 100:.1f}% of farms")
        if v21 is not None and v16 is not None and v16 > 0:
            if unit == "PERCENT" or cid == "net_operating_margin_pct":
                diff = v21 - v16
                sign = "+" if diff > 0 else ""
                sub_parts.append(f"{sign}{diff:.1f} pts vs 2016")
            else:
                pct = ((v21 - v16) / v16) * 100.0
                sign = "+" if pct > 0 else ""
                sub_parts.append(f"{sign}{pct:.1f}% vs 2016")
        return main_str, " • ".join(sub_parts), False

    # Multi-area rollup handling with explicit partial-suppression ('x') flagging
    if not is_derived_ratio and sup_count > 0 and valid_count == 0:
        return "x (Suppressed)", f"All {len(gids)} areas suppressed", True

    if not is_derived_ratio and sup_count > 0 and valid_count > 0:
        raw_str = fmt_val(v21, unit)
        return f"≥ {raw_str}†", f"† Min. total ({sup_count} of {len(gids)} 'x' suppressed)", True

    main_str = fmt_val(v21, unit)
    sub_parts = []
    if meta.get("baseId") and v21 is not None and unit == "FARMS":
        base21 = compute_group_val(gids, meta["baseId"], 0)
        if base21 and base21 > 0:
            sub_parts.append(f"{(v21 / base21) * 100:.1f}% of farms")
    if v21 is not None and v16 is not None and v16 > 0:
        if unit == "PERCENT" or cid == "net_operating_margin_pct":
            diff = v21 - v16
            sign = "+" if diff > 0 else ""
            sub_parts.append(f"{sign}{diff:.1f} pts vs 2016")
        else:
            pct = ((v21 - v16) / v16) * 100.0
            sign = "+" if pct > 0 else ""
            sub_parts.append(f"{sign}{pct:.1f}% vs 2016")
    return main_str, " • ".join(sub_parts), False


SECTIONS = [
    (
        "1. Executive Farm Structure, Land Use & Tenure",
        "Statistics Canada Tables 32-10-0231-01, 32-10-0153-01, 32-10-0233-01 & 32-10-0234-01",
        [
            "total_farms",
            "land_total_acres",
            "avg_farm_size_acres",
            "land_crops_acres",
            "land_tame_pasture_acres",
            "land_natural_pasture_acres",
            "land_woodland_wetland_acres",
            "tenure_owned_acres",
            "tenure_rented_acres",
        ],
    ),
    (
        "2. Farm Revenues, Operating Expenses & Capital Value",
        "Statistics Canada Tables 32-10-0237-01, 32-10-0240-01 & 32-10-0241-01",
        [
            "rev_total_dollars",
            "avg_rev_per_farm",
            "exp_total_dollars",
            "avg_exp_per_farm",
            "avg_net_income_per_farm",
            "net_operating_margin_pct",
            "cap_total_dollars",
            "avg_capital_per_farm",
            "land_bldg_value_per_acre",
            "cap_machinery",
            "cap_livestock",
        ],
    ),
    (
        "3. Farms by Industry Classification (NAICS)",
        "Statistics Canada Table 32-10-0231-01 (Number & % Share of Farms by Main Commodity)",
        [
            "naics_other_crop",
            "naics_hay",
            "naics_maple",
            "naics_cattle_total",
            "naics_beef",
            "naics_dairy",
            "naics_other_animal",
            "naics_horse",
            "naics_apiculture",
            "naics_oilseed_grain",
            "naics_vegetable",
            "naics_greenhouse",
            "naics_poultry_egg",
            "naics_sheep_goat",
            "naics_fruit_nut",
            "naics_hog",
        ],
    ),
    (
        "4. Field Crops, Hay, Forage & Horticulture",
        "Statistics Canada Tables 32-10-0359-01, 32-10-0360-01 to 32-10-0363-01",
        [
            "crop_total_acres",
            "crop_other_hay_acres",
            "crop_alfalfa_acres",
            "crop_oats_acres",
            "crop_barley_acres",
            "crop_soybeans_acres",
            "crop_corn_silage_acres",
            "crop_corn_grain_acres",
            "crop_wheat_total_acres",
            "crop_canola_acres",
            "crop_potatoes_acres",
            "veg_total_acres",
            "fruit_total_acres",
            "gh_total_sqft",
            "maple_total_taps",
        ],
    ),
    (
        "5. Livestock, Poultry & Apiculture Inventories",
        "Statistics Canada Tables 32-10-0370-01 to 32-10-0378-01",
        [
            "cattle_total_head",
            "cattle_beef_cows_head",
            "cattle_dairy_cows_head",
            "sheep_total_head",
            "pigs_total_head",
            "poultry_hens_chickens_birds",
            "bees_colonies",
        ],
    ),
    (
        "6. Operator Demographics, Succession & Stewardship",
        "Statistics Canada Tables 32-10-0381-01, 32-10-0244-01, 32-10-0367-01 & 32-10-0248-01",
        [
            "op_total_operators",
            "op_avg_age",
            "op_age_under_35",
            "op_age_55_plus",
            "op_sex_female",
            "succ_written",
            "till_notill_acres",
            "bmp_cover_crops_farms",
            "bmp_rotational_grazing_farms",
            "energy_solar_farms",
            "ds_total_farms",
            "org_total_farms",
            "labour_total_workers",
        ],
    ),
]

# Columns for Part 1 (Combined & District / Sub-Region Comparison)
COLUMNS_PART_1 = [
    ("COMBINED TOTAL\n(Nipissing + Parry Sound CDs)", [PARRY_SOUND_CD, NIPISSING_CD], True),
    ("EXACT OFA FEDERATION\n(Parry Sound + East Nipissing Twps)", [PARRY_SOUND_CD] + EAST_NIPISSING_CCS_IDS, True),
    ("Parry Sound District\n(CD 3549 Total)", [PARRY_SOUND_CD], False),
    ("Nipissing District\n(CD 3548 Total)", [NIPISSING_CD], False),
    ("East Nipissing Twps Only\n(Bonfield, Chisholm, Unorg)", EAST_NIPISSING_CCS_IDS, False),
    ("West Nipissing Only\n(CCS 3548055)", [WEST_NIPISSING_CCS], False),
]


def generate_html_and_pdf():
    sections_html = ""
    for sec_title, sec_sub, mids in SECTIONS:
        rows_html = ""
        for mid in mids:
            meta = char_by_id.get(mid)
            if not meta:
                continue
            cells_html = ""
            for col_label, gids, is_highlight in COLUMNS_PART_1:
                m_str, s_str, is_sup_note = fmt_cell(gids, mid)
                bg = "#EBF5F3" if is_highlight else "#FFFFFF"
                fw = "800" if is_highlight else "700"
                col = "#0F3D6E" if is_highlight else "#0F172A"
                sub_col = "#B45309" if is_sup_note else ("#1D6C5E" if is_highlight else "#475569")
                cells_html += f"""
                <td style="text-align:right;padding:5px 7px;border-bottom:1px solid #E2E8F0;background:{bg};vertical-align:top;">
                  <div style="font-weight:{fw};color:{col};font-size:10.5px;line-height:1.3;">{m_str}</div>
                  {f'<div style="font-size:8.5px;color:{sub_col};font-weight:600;line-height:1.25;margin-top:1px;">{s_str}</div>' if s_str else ''}
                </td>
                """
            rows_html += f"""
            <tr>
              <td style="padding:5px 7px;border-bottom:1px solid #E2E8F0;font-weight:600;color:#1E293B;font-size:10px;vertical-align:top;">
                <div style="line-height:1.3;">{meta['shortName']}</div>
                <span style="display:block;font-size:8.5px;color:#334155;font-weight:500;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;margin-top:1px;">StatCan Table {meta['statcanTable']}</span>
              </td>
              {cells_html}
            </tr>
            """

        headers_html = ""
        for col_label, _, is_highlight in COLUMNS_PART_1:
            bg = "#1D6C5E" if is_highlight else "#0F3D6E"
            parts = col_label.split("\n")
            headers_html += f"""
            <th style="text-align:right;padding:6px 7px;background:{bg};color:#FFFFFF;font-size:9.5px;width:12.5%;">
              <div>{parts[0]}</div>
              <div style="font-size:8px;font-weight:400;color:#CBD5E1;">{parts[1] if len(parts)>1 else ''}</div>
            </th>
            """

        sections_html += f"""
        <div class="report-section" style="margin-bottom:14px;">
          <div class="section-header-block" style="background:#F1F5F9;border-left:4px solid #0F3D6E;padding:5px 9px;margin-bottom:4px;">
            <div style="font-size:11.5px;font-weight:800;color:#0F3D6E;text-transform:uppercase;">{sec_title}</div>
            <div style="font-size:8.5px;color:#475569;">{sec_sub}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left;padding:6px 7px;background:#0F3D6E;color:#FFFFFF;font-size:9.5px;width:25%;">
                  Agricultural Characteristic
                </th>
                {headers_html}
              </tr>
            </thead>
            <tbody>
              {rows_html}
            </tbody>
          </table>
        </div>
        """

    # Part 2: Complete Township-by-Township Summary Table (All 16 Townships across Parry Sound & Nipissing)
    twp_rows_html = ""
    all_twp_groups = [
        ("Parry Sound District", PARRY_SOUND_CCS_IDS),
        ("Nipissing District (East Nipissing)", EAST_NIPISSING_CCS_IDS),
        ("Nipissing District (West Nipissing)", [WEST_NIPISSING_CCS]),
    ]
    for grp_label, tids in all_twp_groups:
        for tid in tids:
            g = geo_by_id[tid]
            f_m, f_s, _ = fmt_cell([tid], "total_farms")
            ac_m, _, _ = fmt_cell([tid], "land_total_acres")
            sz_m, _, _ = fmt_cell([tid], "avg_farm_size_acres")
            cr_m, _, _ = fmt_cell([tid], "land_crops_acres")
            rv_m, rv_s, _ = fmt_cell([tid], "rev_total_dollars")
            cp_m, _, _ = fmt_cell([tid], "cap_total_dollars")
            lv_m, _, _ = fmt_cell([tid], "land_bldg_value_per_acre")
            ag_m, _, _ = fmt_cell([tid], "op_avg_age")
            twp_rows_html += f"""
            <tr>
              <td style="padding:5px 7px;border-bottom:1px solid #E2E8F0;font-weight:700;color:#0F3D6E;font-size:10px;">
                {g['cleanName']}
                <span style="display:block;font-size:8px;color:#64748B;font-weight:400;">{grp_label}</span>
              </td>
              <td style="text-align:right;padding:5px 7px;border-bottom:1px solid #E2E8F0;font-weight:700;font-size:10px;">{f_m}<div style="font-size:8px;color:#475569;">{f_s}</div></td>
              <td style="text-align:right;padding:5px 7px;border-bottom:1px solid #E2E8F0;font-size:10px;">{ac_m}</td>
              <td style="text-align:right;padding:5px 7px;border-bottom:1px solid #E2E8F0;font-size:10px;">{sz_m}</td>
              <td style="text-align:right;padding:5px 7px;border-bottom:1px solid #E2E8F0;font-size:10px;">{cr_m}</td>
              <td style="text-align:right;padding:5px 7px;border-bottom:1px solid #E2E8F0;font-weight:700;font-size:10px;">{rv_m}<div style="font-size:8px;color:#475569;">{rv_s}</div></td>
              <td style="text-align:right;padding:5px 7px;border-bottom:1px solid #E2E8F0;font-size:10px;">{cp_m}</td>
              <td style="text-align:right;padding:5px 7px;border-bottom:1px solid #E2E8F0;font-size:10px;">{lv_m}</td>
              <td style="text-align:right;padding:5px 7px;border-bottom:1px solid #E2E8F0;font-size:10px;">{ag_m}</td>
            </tr>
            """

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>East Nipissing & Parry Sound — Agricultural Profile Report (OFA)</title>
  <style>
    @page {{ size: letter landscape; margin: 10mm; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}
    table {{ page-break-inside: auto; }}
    thead {{ display: table-header-group; }}
    tr, td, th {{
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }}
    .section-header-block {{
      page-break-after: avoid !important;
      break-after: avoid !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }}
  </style>
</head>
<body>
  <div style="border-bottom:3px solid #0F3D6E;padding-bottom:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div>
      <div style="font-size:9.5px;font-weight:800;color:#328475;letter-spacing:0.06em;text-transform:uppercase;">
        ONTARIO FEDERATION OF AGRICULTURE (OFA) • FIELD STAFF BRIEFING PROFILE
      </div>
      <h1 style="margin:2px 0 3px 0;font-size:17px;font-weight:900;color:#0F3D6E;">
        East Nipissing &amp; Parry Sound — Combined &amp; Individual Agricultural Profile
      </h1>
      <div style="font-size:9.5px;color:#475569;">
        Includes: (1) Combined Nipissing + Parry Sound Districts, (2) Exact OFA East Nipissing-Parry Sound Federation Rollup, (3) Individual District Breakdowns, and (4) All 16 Local Townships (CCS)
      </div>
    </div>
    <div style="text-align:right;font-size:8.5px;color:#64748B;">
      <div><strong>Source:</strong> Statistics Canada Census of Agriculture (2021 &amp; 2016)</div>
      <div>Tables 32-10-0153-01 to 32-10-0445-01</div>
    </div>
  </div>

  <div style="background:#EBF5F3;border:1px solid #328475;border-radius:5px;padding:8px 12px;margin-bottom:12px;font-size:10px;line-height:1.45;color:#0F172A;">
    <strong style="color:#0F3D6E;">Executive Note on Boundary Definitions for OFA Field Staff:</strong>
    Statistics Canada publishes data for <strong>Parry Sound District (CD 3549: 220 farms)</strong> and <strong>Nipissing District (CD 3548: 195 farms)</strong>, which together total <strong>415 farms</strong>, <strong>116,299 acres</strong>, and <strong>$28.98M</strong> in gross farm receipts. Within Nipissing District, the municipality of <strong>West Nipissing (118 farms)</strong> is affiliated with the <em>West Nipissing-Sudbury East Federation</em>, while the <strong>East Nipissing townships (Bonfield, Chisholm, and Nipissing Unorganized North/South: 77 farms)</strong> pair with <strong>Parry Sound District (220 farms)</strong> to form the <strong>East Nipissing-Parry Sound Federation (297 farms, 76,506 acres, $11.92M gross receipts)</strong>. Both combined totals and every individual breakdown are provided side-by-side below.
  </div>

  {sections_html}

  <div style="page-break-before:always;"></div>

  <div style="background:#F1F5F9;border-left:4px solid #0F3D6E;padding:6px 10px;margin-bottom:6px;">
    <div style="font-size:12px;font-weight:800;color:#0F3D6E;text-transform:uppercase;">
      7. Complete Township-by-Township Breakdown (All 16 Municipalities in Parry Sound &amp; Nipissing)
    </div>
    <div style="font-size:9px;color:#475569;">
      Census Consolidated Subdivisions (CCS) ordered by district and farm count (2021 Census of Agriculture)
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#0F3D6E;color:#FFFFFF;font-size:9.5px;">
        <th style="text-align:left;padding:6px 7px;">Township / Municipality (CCS)</th>
        <th style="text-align:right;padding:6px 7px;">Total Farms</th>
        <th style="text-align:right;padding:6px 7px;">Total Farm Acres</th>
        <th style="text-align:right;padding:6px 7px;">Avg Farm Size (ac)</th>
        <th style="text-align:right;padding:6px 7px;">Cropland Acres</th>
        <th style="text-align:right;padding:6px 7px;">Gross Farm Receipts</th>
        <th style="text-align:right;padding:6px 7px;">Total Farm Capital</th>
        <th style="text-align:right;padding:6px 7px;">Land &amp; Bldg $/Acre</th>
        <th style="text-align:right;padding:6px 7px;">Avg Operator Age</th>
      </tr>
    </thead>
    <tbody>
      {twp_rows_html}
    </tbody>
  </table>
</body>
</html>
"""
    OUT_HTML.write_text(html, encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 900})
        page.goto(f"file:///{OUT_HTML.as_posix()}", wait_until="networkidle")
        page.pdf(
            path=str(OUT_PDF),
            format="Letter",
            landscape=True,
            print_background=True,
            margin={"top": "10mm", "bottom": "10mm", "left": "10mm", "right": "10mm"},
        )
        # Also verify the live Multi-Area Report Modal on http://localhost:5173 and capture screenshot
        try:
            page.goto("http://localhost:5173", wait_until="networkidle")
            page.wait_for_timeout(600)
            page.locator("button", has_text="Multi-Area PDF Report").click()
            page.wait_for_timeout(800)
            page.screenshot(path=str(ARTIFACT_SCREENSHOT))
        except Exception as e:
            print("Note capturing modal screenshot:", e)
        browser.close()

    print(f"Generated PDF report: {OUT_PDF} ({OUT_PDF.stat().st_size / 1024:.1f} KB)")


def generate_docx():
    doc = Document()
    for s in doc.sections:
        s.top_margin = Inches(0.6)
        s.bottom_margin = Inches(0.6)
        s.left_margin = Inches(0.6)
        s.right_margin = Inches(0.6)

    p_hdr = doc.add_paragraph()
    r_sub = p_hdr.add_run("ONTARIO FEDERATION OF AGRICULTURE (OFA)  •  FIELD STAFF BRIEFING REPORT\n")
    r_sub.bold = True
    r_sub.font.size = Pt(9.5)
    r_sub.font.color.rgb = RGBColor(0x32, 0x84, 0x75)

    r_title = p_hdr.add_run("East Nipissing & Parry Sound — Combined & Individual Agricultural Profile")
    r_title.bold = True
    r_title.font.size = Pt(18)
    r_title.font.color.rgb = RGBColor(0x0F, 0x3D, 0x6E)

    p_note = doc.add_paragraph()
    r_note = p_note.add_run(
        "Boundary Note for OFA Field Staff: Statistics Canada reports Parry Sound District (CD 3549: 220 farms) and "
        "Nipissing District (CD 3548: 195 farms), which together total 415 farms, 116,299 acres, and $28.98M in gross "
        "farm receipts. Within Nipissing District, West Nipissing (118 farms) belongs to the West Nipissing-Sudbury East "
        "Federation, while the East Nipissing townships (Bonfield, Chisholm, and Nipissing Unorganized North/South: 77 farms) "
        "join Parry Sound District (220 farms) to form the East Nipissing-Parry Sound Federation (297 farms, 76,506 acres, "
        "$11.92M gross receipts). Both combined totals and individual breakdowns are included below."
    )
    r_note.font.size = Pt(9.5)

    for sec_title, sec_sub, mids in SECTIONS:
        h = doc.add_heading(sec_title, level=2)
        h.paragraph_format.space_before = Pt(10)
        h.paragraph_format.space_after = Pt(3)

        headers = ["Characteristic"] + [c[0].replace("\n", " ") for c in COLUMNS_PART_1]
        table = doc.add_table(rows=1 + len(mids), cols=len(headers))
        table.style = "Table Grid"
        for i, h_text in enumerate(headers):
            cell = table.rows[0].cells[i]
            p = cell.paragraphs[0]
            r = p.add_run(h_text)
            r.bold = True
            r.font.size = Pt(8.5)

        for r_idx, mid in enumerate(mids):
            meta = char_by_id.get(mid)
            if not meta:
                continue
            row_cells = table.rows[r_idx + 1].cells
            p0 = row_cells[0].paragraphs[0]
            r0 = p0.add_run(f"{meta['shortName']} ({meta['statcanTable']})")
            r0.bold = True
            r0.font.size = Pt(8.5)

            for c_idx, (_, gids, _) in enumerate(COLUMNS_PART_1):
                m_str, s_str, _ = fmt_cell(gids, mid)
                pc = row_cells[c_idx + 1].paragraphs[0]
                rc = pc.add_run(f"{m_str}" + (f"\n({s_str})" if s_str else ""))
                rc.font.size = Pt(8.5)

    doc.save(str(OUT_DOCX))
    print(f"Generated Word report: {OUT_DOCX} ({OUT_DOCX.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    generate_html_and_pdf()
    generate_docx()
