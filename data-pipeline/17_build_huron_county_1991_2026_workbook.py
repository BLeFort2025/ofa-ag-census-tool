"""17_build_huron_county_1991_2026_workbook.py — Build Ready-to-Send Huron County (CD 3540) Workbook.

Compiles verified empirical Statistics Canada & OMAFA Open Data (1991–2026) covering:
  1. Farm Incomes (Census Gross Receipts, Expenses & Net Operating Income 1991–2021 by size bracket;
     OMAFA Annual County Farm Cash Receipts across 36 commodities 2011–2025; StatCan Ontario Annual
     Accounting Net Farm Income 2000–2025)
  2. Livestock, Dairy, Swine, Poultry, Egg, Sheep, Goat, Equine & Honeybee Herd/Flock Sizes
     broken down by every individual commodity (Census 2006–2021 Farms, Animals/Volume, and Average
     Size per Farm; plus Annual County Cattle, Pig & Sheep Inventories 2004–2026E and Annual DFO
     Licensed Dairy Producers & Milk Shipments 2007–2024)
  3. Farm Sizes & Land Economics (Census Farms, Total Acres, Avg Farm Size, Rented Acres, Market
     Value $/ac & Cash Rent $/ac 1991–2021; MPAC Assessed Farmland; 14 Farm Area Size Brackets;
     12 Cropland Size Brackets; 9 Farm Capital Brackets; and all 8 Huron Townships)
  4. Log-Ready Flat Time-Series Table (with pre-computed Log10 and Natural Log Ln columns)
"""
from __future__ import annotations

import csv
import json
import math
import re
import shutil
from pathlib import Path
from typing import Any

import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

PROJECT_DIR = Path(__file__).resolve().parent.parent
RAW_HURON = PROJECT_DIR / "data-pipeline" / "raw" / "huron_request"
RAW_CUBES = PROJECT_DIR / "data-pipeline" / "raw" / "cubes"
PROFILES_JSON = PROJECT_DIR / "public" / "data" / "ofa_county_profiles_2_0.json"

OUT_DIR = PROJECT_DIR / "public" / "downloads" / "huron_special_request"
WORKBOOK_NAME = "OFA_Huron_County_Income_Herd_and_Farm_Sizes_1991_2026.xlsx"

# OFA Executive Styling
NAVY_FILL = PatternFill("solid", fgColor="0F3D6E")
TEAL_FILL = PatternFill("solid", fgColor="1E6B5E")
SECTION_FILL = PatternFill("solid", fgColor="DBEAFE")
TH_FILL = PatternFill("solid", fgColor="E2E8F0")
ZEBRA_FILL = PatternFill("solid", fgColor="F8FAFC")
HIGHLIGHT_FILL = PatternFill("solid", fgColor="ECFDF5")
NOTE_FILL = PatternFill("solid", fgColor="FEF3C7")

TITLE_FONT = Font(name="Calibri", size=13, bold=True, color="FFFFFF")
SUB_FONT = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
SEC_FONT = Font(name="Calibri", size=10, bold=True, color="0F3D6E")
TH_FONT = Font(name="Calibri", size=10, bold=True, color="0F172A")
BODY_FONT = Font(name="Calibri", size=10, bold=False, color="1E293B")
BOLD_FONT = Font(name="Calibri", size=10, bold=True, color="0F172A")
WARN_FONT = Font(name="Calibri", size=9.5, bold=False, color="78350F")

THIN_SIDE = Side(style="thin", color="CBD5E1")
BORDER = Border(left=THIN_SIDE, right=THIN_SIDE, top=THIN_SIDE, bottom=THIN_SIDE)


def to_float(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        if math.isnan(v) or math.isinf(v):
            return None
        return float(v)
    s = str(v).strip().replace(",", "").replace("$", "")
    if not s or s.lower() in ("x", "..", "...", "f", "-", "—", "n/a", "na"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def safe_div(num: float | None, den: float | None, dec: int = 1) -> float | None:
    if num is None or den is None or den == 0:
        return None
    return round(num / den, dec)


def safe_pct_chg(new_v: float | None, old_v: float | None, dec: int = 1) -> float | None:
    if new_v is None or old_v is None or old_v == 0:
        return None
    return round((new_v - old_v) / abs(old_v) * 100.0, dec)


def safe_log10(v: float | None) -> float | None:
    if v is None or v <= 0:
        return None
    return round(math.log10(v), 4)


def safe_ln(v: float | None) -> float | None:
    if v is None or v <= 0:
        return None
    return round(math.log(v), 4)


def style_banner(ws, title: str, subtitle: str, max_col: int) -> int:
    ws.views.sheetView[0].showGridLines = True
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max_col)
    c1 = ws.cell(row=1, column=1, value=title)
    c1.fill = NAVY_FILL
    c1.font = TITLE_FONT
    c1.alignment = Alignment(vertical="center", horizontal="left", indent=1)
    ws.row_dimensions[1].height = 26

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max_col)
    c2 = ws.cell(row=2, column=1, value=subtitle)
    c2.fill = TEAL_FILL
    c2.font = SUB_FONT
    c2.alignment = Alignment(vertical="center", horizontal="left", indent=1)
    ws.row_dimensions[2].height = 20
    return 4


def write_note_box(ws, row_idx: int, text: str, max_col: int, height: int = 28) -> int:
    ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=max_col)
    c = ws.cell(row=row_idx, column=1, value=text)
    c.fill = NOTE_FILL
    c.font = WARN_FONT
    c.border = BORDER
    c.alignment = Alignment(vertical="center", horizontal="left", wrap_text=True, indent=1)
    ws.row_dimensions[row_idx].height = height
    return row_idx + 2


def write_section_bar(ws, row_idx: int, title: str, max_col: int) -> int:
    ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=max_col)
    c = ws.cell(row=row_idx, column=1, value=title)
    c.fill = SECTION_FILL
    c.font = SEC_FONT
    c.border = BORDER
    c.alignment = Alignment(vertical="center", horizontal="left", indent=1)
    ws.row_dimensions[row_idx].height = 21
    return row_idx + 1


def write_headers(ws, row_idx: int, headers: list[str], left_cols: tuple[int, ...] = (1,)) -> int:
    for col_idx, h in enumerate(headers, start=1):
        c = ws.cell(row=row_idx, column=col_idx, value=h)
        c.fill = TH_FILL
        c.font = TH_FONT
        c.border = BORDER
        c.alignment = Alignment(
            horizontal="left" if col_idx in left_cols else "right",
            vertical="center",
            wrap_text=True,
        )
    ws.row_dimensions[row_idx].height = 25
    return row_idx + 1


def write_row(
    ws,
    row_idx: int,
    vals: list[Any],
    fmts: list[str | None] | None = None,
    left_cols: tuple[int, ...] = (1,),
    bold: bool = False,
    zebra: bool = False,
    highlight: bool = False,
    wrap: bool = False,
) -> int:
    fill = HIGHLIGHT_FILL if highlight else (SECTION_FILL if bold else (ZEBRA_FILL if zebra else None))
    font = BOLD_FONT if (bold or highlight) else BODY_FONT
    for col_idx, v in enumerate(vals, start=1):
        disp = "—" if v is None else v
        c = ws.cell(row=row_idx, column=col_idx, value=disp)
        if fill:
            c.fill = fill
        c.font = font
        c.border = BORDER
        c.alignment = Alignment(
            horizontal="left" if col_idx in left_cols else "right",
            vertical="center",
            wrap_text=wrap,
        )
        if isinstance(v, (int, float)) and fmts and col_idx - 1 < len(fmts) and fmts[col_idx - 1]:
            c.number_format = fmts[col_idx - 1]  # type: ignore[assignment]
    ws.row_dimensions[row_idx].height = 28 if wrap else 19
    return row_idx + 1


def autofit(ws, max_w: int = 44) -> None:
    for col in ws.columns:
        letter = get_column_letter(col[0].column)
        longest = 10
        for cell in col[:90]:
            if cell.row in (1, 2):
                continue
            val_s = str(cell.value or "")
            if len(val_s) > longest:
                longest = len(val_s)
        ws.column_dimensions[letter].width = min(max(longest + 3, 11), max_w)


# -----------------------------------------------------------------------------
# Empirical Data Parsers
# -----------------------------------------------------------------------------
def parse_cty30_series(filename: str) -> dict[int, float]:
    wb = openpyxl.load_workbook(RAW_HURON / filename, data_only=True, read_only=True)
    ws = wb["English"]
    rows = [r for r in ws.iter_rows(max_row=65, max_col=12, values_only=True) if r and any(r)]
    hdr = next(r for r in rows if any(x == 1991 for x in r))
    huron = next(r for r in rows if r[1] and str(r[1]).strip().lower() == "huron")
    out: dict[int, float] = {}
    for idx, col_v in enumerate(hdr):
        if isinstance(col_v, int) and 1990 <= col_v <= 2025:
            val = to_float(huron[idx])
            if val is not None:
                out[col_v] = val
    return out


def parse_farmvalue_series() -> tuple[dict[str, dict[int, float | None]], dict[str, dict[str, float | None]]]:
    wb = openpyxl.load_workbook(RAW_HURON / "farmvalue_en.xlsx", data_only=True, read_only=True)
    summary_map: dict[str, dict[int, float | None]] = {}
    for key, sh in [
        ("rented_acres", "Farm Area Rented 1991-2021"),
        ("land_val_per_ac", "Est. Value of Land 1991-2021"),
        ("rent_per_ac", "Est. Rental Rate 1991-2021"),
    ]:
        ws = wb[sh]
        rows = [r for r in ws.iter_rows(max_row=80, max_col=10, values_only=True) if r and any(r)]
        hdr = next(r for r in rows if any(x == 1991 for x in r))
        huron = next(r for r in rows if r[0] and str(r[0]).strip().lower() in ("huron county", "huron"))
        summary_map[key] = {}
        for idx, col_v in enumerate(hdr[:9]):
            if isinstance(col_v, int) and 1990 <= col_v <= 2025:
                summary_map[key][col_v] = to_float(huron[idx])

    # Also parse 2021 Huron townships land value & rented acres
    twp_2021: dict[str, dict[str, float | None]] = {}
    ws21 = wb["2021"]
    for r in ws21.iter_rows(values_only=True):
        if not r or not r[0]:
            continue
        raw_nm = str(r[0]).strip().replace("..", "-")
        twp_2021[raw_nm.lower()] = {
            "land_bldg_market_val": to_float(r[4]),
            "rented_acres": to_float(r[5]),
            "est_val_per_acre": to_float(r[7]),
            "rented_share_pct": round(to_float(r[9]) * 100.0, 1) if to_float(r[9]) is not None else None,
        }
    return summary_map, twp_2021


def parse_mpac_huron() -> dict[int, dict[str, float | None]]:
    wb = openpyxl.load_workbook(RAW_HURON / "ceag_and_mpac.xlsx", data_only=True, read_only=True)
    ws = wb["English"]
    rows = list(ws.iter_rows(max_row=70, max_col=45, values_only=True))
    hdr_yr = rows[3]
    hdr_sub = rows[4]
    huron = next(r for r in rows if len(r) > 1 and str(r[1]).strip().upper() == "HURON")

    # Map year blocks across columns 8..42
    out: dict[int, dict[str, float | None]] = {}
    cur_yr: int | None = None
    for c_idx in range(8, len(hdr_sub)):
        top_lbl = str(hdr_yr[c_idx] or "").strip() if c_idx < len(hdr_yr) else ""
        m = re.search(r"(2006|2011|2016|2021)", top_lbl)
        if m:
            cur_yr = int(m.group(1))
        sub_lbl = str(hdr_sub[c_idx] or "").strip()
        if cur_yr and sub_lbl:
            out.setdefault(cur_yr, {})[sub_lbl] = to_float(huron[c_idx]) if c_idx < len(huron) else None
    return out


def parse_noi_huron() -> tuple[dict[int, list[dict[str, Any]]], dict[str, dict[int, float | None]]]:
    wb = openpyxl.load_workbook(RAW_HURON / "noibyfarmsize_en.xlsx", data_only=True, read_only=True)
    years = [1991, 1996, 2001, 2006, 2011, 2016, 2021]
    huron_by_year: dict[int, list[dict[str, Any]]] = {}
    twp_noi: dict[str, dict[int, float | None]] = {}

    for yr in years:
        ws = wb[str(yr)]
        huron_by_year[yr] = []
        for r in ws.iter_rows(values_only=True):
            if not r or len(r) < 10:
                continue
            pr, car, cd, ccs = r[0], r[1], r[2], r[3]
            if str(pr) != "35" or str(cd) != "40":
                continue
            geo_nm = str(r[4] or "").strip().replace("..", "-")
            dist_lbl = str(r[5] or "").strip()
            if str(ccs) == "0":
                huron_by_year[yr].append({
                    "bracket": dist_lbl,
                    "farms": to_float(r[6]),
                    "gross_receipts": to_float(r[7]),
                    "operating_expenses": to_float(r[8]),
                    "avg_noi_per_farm": to_float(r[9]),
                    "noi_per_dollar_rev": to_float(r[10]) if len(r) > 10 else None,
                })
            elif dist_lbl.lower() == "all farms":
                twp_noi.setdefault(geo_nm.lower(), {})[yr] = to_float(r[9])
    return huron_by_year, twp_noi


def parse_ontario_net_farm_income() -> dict[int, dict[str, float | None]]:
    out: dict[int, dict[str, float | None]] = {}
    with (RAW_HURON / "32100052.csv").open("r", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["GEO"] != "Ontario":
                continue
            yr = int(r["REF_DATE"])
            if yr < 2000:
                continue
            val = to_float(r["VALUE"])
            # Scalar is thousands -> convert to exact dollars
            if val is not None and "thousand" in r.get("SCALAR_FACTOR", "").lower():
                val *= 1000.0
            out.setdefault(yr, {})[r["Income components"]] = val
    return out


def parse_annual_cattle() -> dict[int, dict[str, float | None]]:
    wb = openpyxl.load_workbook(RAW_HURON / "ctycattle.xlsx", data_only=True, read_only=True)
    out: dict[int, dict[str, float | None]] = {}
    for sh in wb.sheetnames:
        m = re.search(r"(20\d{2})", sh)
        if not m:
            continue
        yr = int(m.group(1))
        rows = [r for r in wb[sh].iter_rows(max_row=75, max_col=12, values_only=True) if r and any(r)]
        hdr = next(r for r in rows if any(isinstance(x, str) and "dairy cows" in x.lower() for x in r if x))
        huron = next(
            r for r in rows
            if any(isinstance(x, str) and str(x).strip().lower() in ("huron", "huron county") for x in r[:2])
        )
        ymap: dict[str, float | None] = {}
        for idx, h in enumerate(hdr):
            if not h:
                continue
            hl = str(h).strip().lower()
            v = to_float(huron[idx]) if idx < len(huron) else None
            if "bulls" in hl:
                ymap["bulls"] = v
            elif "dairy cows" in hl:
                ymap["dairy_cows"] = v
            elif "dairy heifers" in hl:
                ymap["dairy_heifers"] = v
            elif hl == "beef cows":
                ymap["beef_cows"] = v
            elif "beef cows and breeding" in hl:
                ymap["beef_cows_and_breeding_combined"] = v
            elif "for breeding" in hl:
                ymap["beef_heifers_breeding"] = v
            elif "for slaughter" in hl and "steers" not in hl:
                ymap["beef_heifers_slaughter"] = v
            elif "steers and slaughter" in hl:
                ymap["steers_and_slaughter_combined"] = v
            elif "steers" in hl:
                ymap["steers"] = v
            elif "calves" in hl:
                ymap["calves"] = v
            elif "total cattle" in hl:
                ymap["total_cattle"] = v
        out[yr] = ymap
    return out


def parse_annual_pigs() -> dict[int, dict[str, Any]]:
    wb = openpyxl.load_workbook(RAW_HURON / "ctypigs.xlsx", data_only=True, read_only=True)
    out: dict[int, dict[str, Any]] = {}
    for sh in wb.sheetnames:
        m = re.search(r"(20\d{2})", sh)
        if not m:
            continue
        yr = int(m.group(1))
        rows = [r for r in wb[sh].iter_rows(max_row=75, max_col=12, values_only=True) if r and any(r)]
        hdr = next(r for r in rows if any(isinstance(x, str) and "sows" in x.lower() for x in r if x))
        huron = next(
            r for r in rows
            if any(isinstance(x, str) and str(x).strip().lower() in ("huron", "huron county") for x in r[:3])
        )
        ymap: dict[str, Any] = {"weight_regime": ""}
        for idx, h in enumerate(hdr):
            if not h:
                continue
            hl = str(h).strip().lower()
            v = to_float(huron[idx]) if idx < len(huron) else None
            if "boars" in hl:
                ymap["boars"] = v
            elif "sows" in hl:
                ymap["sows"] = v
            elif "total pigs" in hl:
                ymap["total_pigs"] = v
            elif "nursing pigs" in hl:
                ymap["light_pigs"] = v
                ymap["weight_regime"] = "<7 kg / 7–22 kg / >23 kg"
            elif "weaner pigs" in hl:
                ymap["mid_pigs"] = v
            elif "grower and finishing pigs (above 23" in hl:
                ymap["heavy_pigs"] = v
            elif "nursing & weaner" in hl:
                ymap["light_pigs"] = v
                ymap["weight_regime"] = "Nursing+Weaner / Grower+Finisher"
            elif "grower & finishing" in hl:
                ymap["heavy_pigs"] = v
            elif "under 23 kg" in hl:
                ymap["light_pigs"] = v
                ymap["weight_regime"] = "<23 kg / 23–80 kg / >81 kg"
            elif "23-80 kg" in hl:
                ymap["mid_pigs"] = v
            elif "over 81 kg" in hl:
                ymap["heavy_pigs"] = v
            elif "<20 kg" in hl:
                ymap["light_pigs"] = v
                ymap["weight_regime"] = "<20 kg / 20–60 kg / >60 kg"
            elif "20-60 kg" in hl:
                ymap["mid_pigs"] = v
            elif ">60 kg" in hl:
                ymap["heavy_pigs"] = v
            elif "<45lbs" in hl:
                ymap["light_pigs"] = v
                ymap["weight_regime"] = "<45 lb / 45–130 lb / >130 lb"
            elif "45-130lbs" in hl:
                ymap["mid_pigs"] = v
            elif ">130lbs" in hl:
                ymap["heavy_pigs"] = v
        # Derive total market/feeder/nursing pigs = Total - Sows - Boars
        if ymap.get("total_pigs") is not None and ymap.get("sows") is not None and ymap.get("boars") is not None:
            ymap["all_non_breeding_pigs"] = ymap["total_pigs"] - ymap["sows"] - ymap["boars"]
        out[yr] = ymap
    return out


def parse_annual_sheep() -> dict[int, dict[str, float | None]]:
    wb = openpyxl.load_workbook(RAW_HURON / "ctysheep.xlsx", data_only=True, read_only=True)
    out: dict[int, dict[str, float | None]] = {}
    for sh in wb.sheetnames:
        m = re.search(r"(20\d{2})", sh)
        if not m:
            continue
        yr = int(m.group(1))
        rows = [r for r in wb[sh].iter_rows(max_row=75, max_col=12, values_only=True) if r and any(r)]
        hdr = next(r for r in rows if any(isinstance(x, str) and "rams" in x.lower() for x in r if x))
        huron = next(
            r for r in rows
            if any(isinstance(x, str) and str(x).strip().lower() in ("huron", "huron county") for x in r[:3])
        )
        ymap: dict[str, float | None] = {}
        for idx, h in enumerate(hdr):
            if not h:
                continue
            hl = str(h).strip().lower()
            v = to_float(huron[idx]) if idx < len(huron) else None
            if "rams" in hl:
                ymap["rams"] = v
            elif "ewes" in hl:
                ymap["ewes"] = v
            elif "replacement" in hl:
                ymap["replacement_lambs"] = v
            elif "market" in hl:
                ymap["market_lambs"] = v
            elif "total" in hl and "sheep" in hl:
                ymap["total_sheep_lambs"] = v
            elif "lamb" in hl and "replacement" not in hl and "market" not in hl:
                ymap["total_lambs"] = v
        out[yr] = ymap
    return out


def parse_dairy_producers_and_shipments() -> tuple[dict[int, float], dict[int, float]]:
    prods: dict[int, float] = {}
    wb_p = openpyxl.load_workbook(RAW_HURON / "producers.xlsx", data_only=True, read_only=True)
    rows_p = [r for r in wb_p["producerE"].iter_rows(max_row=65, max_col=25, values_only=True) if r and any(r)]
    hdr_p = next(r for r in rows_p if any(str(x) == "2007" for x in r if x is not None))
    hur_p = next(r for r in rows_p if r[0] and str(r[0]).strip().lower() == "huron")
    for idx, y in enumerate(hdr_p):
        if y is not None and str(y).strip().isdigit():
            v = to_float(hur_p[idx])
            if v is not None:
                prods[int(str(y).strip())] = v

    ships: dict[int, float] = {}
    wb_s = openpyxl.load_workbook(RAW_HURON / "shipment.xlsx", data_only=True, read_only=True)
    rows_s = [r for r in wb_s["shipmentE"].iter_rows(max_row=65, max_col=25, values_only=True) if r and any(r)]
    hdr_s = next(r for r in rows_s if any(str(x) == "2007" for x in r if x is not None))
    hur_s = next(r for r in rows_s if r[0] and str(r[0]).strip().lower() == "huron")
    for idx, y in enumerate(hdr_s):
        if y is not None and str(y).strip().isdigit():
            v = to_float(hur_s[idx])
            if v is not None:
                ships[int(str(y).strip())] = v
    return prods, ships


def load_statcan_huron_2021(cube_id: int, dim_col: str) -> dict[tuple[str, str], tuple[float | None, str]]:
    out: dict[tuple[str, str], tuple[float | None, str]] = {}
    with (RAW_CUBES / f"{cube_id}.csv").open("r", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["DGUID"] != "2021A00033540":
                continue
            # Only take 'All farms' if Farm type / Organic / etc. extra filter exists, or first match
            item = r[dim_col]
            uom = r.get("Unit of measure", r.get("UOM", ""))
            key = (item, uom)
            if key not in out:
                out[key] = (to_float(r["VALUE"]), r.get("STATUS", ""))
    return out


def load_statcan_huron_2011_2016(cube_id: int, dim_col: str) -> dict[tuple[int, str, str], tuple[float | None, str]]:
    out: dict[tuple[int, str, str], tuple[float | None, str]] = {}
    with (RAW_HURON / f"{cube_id}.csv").open("r", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if "Huron, Ontario [CD" not in r["GEO"]:
                continue
            yr = int(r["REF_DATE"])
            item = r[dim_col]
            uom = r.get("Unit of measure", r.get("UOM", ""))
            key = (yr, item, uom)
            if key not in out:
                out[key] = (to_float(r["VALUE"]), r.get("STATUS", ""))
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    master_prof = json.loads(PROFILES_JSON.read_text(encoding="utf-8"))
    aco_cat = master_prof.get("acoCatalog")
    huron_prof = master_prof["profiles"]["CD_3540"]
    aco_rows = [
        x
        if isinstance(x, dict)
        else {
            "id": aco_cat[x[0]][0],
            "label": aco_cat[x[0]][1],
            "uom": aco_cat[x[0]][2],
            "v2006": x[1],
            "f2006": x[2],
            "v2011": x[3],
            "f2011": x[4],
            "v2016": x[5],
            "f2016": x[6],
            "v2021": x[7],
            "f2021": x[8],
            "chg16To21Pct": x[9],
            "chg06To21Pct": x[10],
            "ontShare2021Pct": x[11],
        }
        for x in huron_prof["agCensusOverTime"]
    ]
    aco_by_id = {x["id"][:9]: x for x in aco_rows}

    farms_91_21 = parse_cty30_series("cty30.xlsx")
    acres_91_21 = parse_cty30_series("cty30a.xlsx")
    fv_summary, fv_twp21 = parse_farmvalue_series()
    mpac_huron = parse_mpac_huron()
    noi_huron, twp_noi = parse_noi_huron()
    ont_nfi = parse_ontario_net_farm_income()
    ann_cattle = parse_annual_cattle()
    ann_pigs = parse_annual_pigs()
    ann_sheep = parse_annual_sheep()
    dfo_prods, dfo_ships = parse_dairy_producers_and_shipments()

    # Load pure StatCan WDS livestock/poultry/egg/bee cubes for 2021 and 2011/2016
    sc21_cat = load_statcan_huron_2021(32100370, "Cattle")
    sc21_shp = load_statcan_huron_2021(32100371, "Sheep")
    sc21_pig = load_statcan_huron_2021(32100372, "Pigs")
    sc21_oth = load_statcan_huron_2021(32100373, "Other livestock")
    sc21_plt = load_statcan_huron_2021(32100374, "Poultry inventory")
    sc21_ppr = load_statcan_huron_2021(32100375, "Poultry production")
    sc21_egg = load_statcan_huron_2021(32100376, "Egg production")
    sc21_bee = load_statcan_huron_2021(32100378, "Bees")

    sc16_cat = load_statcan_huron_2011_2016(32100424, "Cattle and calves")
    sc16_shp = load_statcan_huron_2011_2016(32100425, "Sheep and lambs")
    sc16_pig = load_statcan_huron_2011_2016(32100426, "Pigs")
    sc16_oth = load_statcan_huron_2011_2016(32100427, "Other livestock")
    sc16_plt = load_statcan_huron_2011_2016(32100428, "Poultry inventory")
    sc16_ppr = load_statcan_huron_2011_2016(32100429, "Poultry production")
    sc16_egg = load_statcan_huron_2011_2016(32100430, "Egg production")
    sc16_bee = load_statcan_huron_2011_2016(32100432, "Bees")

    wb = Workbook()
    tidy_log_rows: list[list[Any]] = []

    def add_tidy(cat: str, comm: str, meas: str, unit: str, freq: str, yr: int, val: float | None, src: str) -> None:
        if val is None:
            return
        tidy_log_rows.append([cat, comm, meas, unit, freq, yr, val, safe_log10(val), safe_ln(val), src])

    # =========================================================================
    # TAB 1: 1_README_and_Sources
    # =========================================================================
    ws1 = wb.active
    ws1.title = "1_README_and_Sources"
    r = style_banner(
        ws1,
        "HURON COUNTY (CD 3540) — FARM INCOMES, LIVESTOCK/POULTRY HERD SIZES & FARM SIZES (1991–2026)",
        "Prepared by the Ontario Federation of Agriculture (OFA) • Clean Empirical Compilation & Data Source Documentation",
        max_col=7,
    )
    r = write_note_box(
        ws1,
        r,
        "IMPORTANT TIMING & METHODOLOGY NOTES: (1) Statistics Canada collected the 2026 Census of Agriculture in May 2026; official 2026 Census farm-level results release on May 12, 2027. To bridge 2021–2026, this workbook pairs 7-Census benchmarks (1991–2021) with annual OMAFA/StatCan Huron County series up to 2025 (Farm Cash Receipts) and July 2026E (County Cattle, Hog & Sheep Inventories). (2) For logarithmic analysis, pre-computed Log10(x) and Natural Log Ln(x) columns are included for strictly positive metrics. Because Net Operating Income is negative in low-revenue brackets (<$25,000), use Operating Expense-to-Revenue Ratios or Gross Receipts vs. Expenses on log scales.",
        max_col=7,
        height=48,
    )

    r = write_section_bar(ws1, r, "WORKBOOK CONTENTS (8 TABS)", 7)
    r = write_headers(ws1, r, ["Worksheet Tab", "Primary Focus", "Years Covered", "Frequency", "Geography", "Log Columns Included?", "Key Highlights"], left_cols=(1, 2, 3, 4, 5, 6, 7))
    tab_guide = [
        ("1_README_and_Sources", "Documentation of all 10 official data sources & log-analysis notes", "1991–2026", "Reference", "Huron County & ON", "N/A", "Clean, simple source citations, table IDs & URLs"),
        ("2_Current_State_Snapshot", "Executive assessment of Huron County farming today + 35-year trajectory", "1991–2026", "Summary", "Huron County (CD 3540)", "Yes (CAGR %)", "#2 in ON farms & receipts; #1–2 in hogs, beef feedlots & grains"),
        ("3_Farm_Incomes_1991_2025", "Census Net Operating Income (by bracket) + Annual 36-Commodity Cash Receipts", "1991–2025", "5-Yr Census + Annual", "Huron County & ON", "Log10 & Ln", "1991–2021 NOI by receipt size + 2011–2025 annual FCR + ON Net Income"),
        ("4_Herd_Flock_By_Commodity", "Herd, flock & colony sizes broken down across 32 specific livestock/poultry items", "2006–2021", "5-Yr Census", "Huron County (CD 3540)", "Log10", "Dairy, Beef, Swine, Broilers, Layers, Turkeys, Eggs, Sheep, Goats, Bees"),
        ("5_Annual_Herd_Dairy_2004_26", "Annual cattle, hog & sheep inventories by class + DFO dairy herds & milk shipped", "2004–2026E", "Annual", "Huron County (CD 3540)", "Log10", "23 consecutive years of livestock classes + annual milk kL/farm (2007–24)"),
        ("6_Farm_Sizes_Land_1991_2021", "Farm counts, total acres, avg farm size, land value $/ac, rent $/ac & size brackets", "1991–2021", "5-Yr Census", "Huron County (CD 3540)", "Log10 & Ln", "1991–2021 avg size & $/ac + 14 acreage brackets + 12 cropland brackets"),
        ("7_Huron_Townships_1991_2024", "All 8 Huron County townships side-by-side (size, income, land value & property tax)", "1991–2024", "5-Yr Census + 2024 FIR", "8 Huron Townships", "No", "South Huron, Bluewater, Central Huron, Huron East, Howick, Morris-Turnberry, North Huron, ACW"),
        ("8_Log_Analysis_Tidy_Series", "Long-format flat dataset ready for instant R / Python / Excel log-linear regression", "1991–2026", "Annual & 5-Yr", "Huron County (CD 3540)", "Log10 & Ln", "Pre-calculated Log10(x) & Ln(x) across every Huron time series"),
    ]
    for idx, tg in enumerate(tab_guide):
        r = write_row(ws1, r, list(tg), left_cols=(1, 2, 3, 4, 5, 6, 7), zebra=(idx % 2 == 1), wrap=True)

    r += 1
    r = write_section_bar(ws1, r, "MASTER EMPIRICAL DATA SOURCES (CLEAN & SIMPLE CITATION TABLE)", 7)
    r = write_headers(ws1, r, ["Source Code", "Publisher / Agency", "Official Dataset / Table Title", "Catalogue / Table ID", "Years Covered", "Geographic Level", "Official Public Access URL"], left_cols=(1, 2, 3, 4, 5, 6, 7))
    sources_list = [
        ("S1", "Statistics Canada", "2021 Census of Agriculture — County & Township Farm, Land, Capital, Revenue, Expense, Livestock, Poultry, Egg & Bee Tables", "Tables 32-10-0231-01 to 32-10-0382-01", "2021 (2020 financials)", "County (CD 3540) & 8 Townships", "https://www150.statcan.gc.ca/n1/en/type/data?subject_levels=32"),
        ("S2", "Statistics Canada", "2011 & 2016 Census of Agriculture — Sub-Provincial Livestock, Poultry, Egg, Bee, Land & Financial Tables", "Tables 32-10-0403-01 to 32-10-0445-01", "2011 & 2016", "County (CD 3540) & 8 Townships", "https://www150.statcan.gc.ca/n1/en/type/data?subject_levels=32"),
        ("S3", "OMAFA / Statistics Canada", "Average Net Operating Income by Region, County and Township (Classified by Gross Farm Receipts)", "Ontario Data Catalogue: noibyfarmsize_en.xlsx", "1991, 1996, 2001, 2006, 2011, 2016, 2021", "County (CD 3540) & 8 Townships", "https://data.ontario.ca/dataset/average-net-operating-income-by-farm-and-township"),
        ("S4", "OMAFA / Statistics Canada", "Ontario Farm Cash Receipts by County and Commodity (36 Crop & Livestock Commodities + Program Payments)", "Ontario Data Catalogue: fcrcty_en.xlsx", "2011–2025 (Annual)", "County (CD 3540) & Ontario", "https://data.ontario.ca/dataset/ontario-farm-cash-receipts-by-county-and-crop"),
        ("S5", "Statistics Canada", "Net Farm Income (Annual Accounting Cash Receipts, Rebates, Depreciation/CCA, Realized & Total Net Income)", "Table 32-10-0052-01", "2000–2025 (Annual)", "Province of Ontario Benchmark", "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210005201"),
        ("S6", "OMAFA / Statistics Canada", "Ontario Livestock by County — Annual July Inventories of Cattle (8 classes), Pigs (by class) & Sheep/Lambs", "Ontario Data Catalogue: ctycattle.xlsx, ctypigs.xlsx, ctysheep.xlsx", "2004–2026E (Annual, July 1)", "County (CD 3540) & Ontario", "https://data.ontario.ca/dataset/ontario-livestock-by-county"),
        ("S7", "Dairy Farmers of Ontario / OMAFA", "Ontario Licensed Milk Producers & Annual Milk Shipments (Kilolitres) by County", "Ontario Data Catalogue: producers.xlsx & shipment.xlsx", "2007–2024 (Annual)", "County (Huron) & Ontario", "https://data.ontario.ca/dataset/ontario-milk-shipments-by-county"),
        ("S8", "OMAFA / Statistics Canada", "Number and Area of Census Farms by County (cty30.xlsx & cty30a.xlsx) & Reconciled 2006–2021 County Profile", "Ontario Data Catalogue: census-farm-data-collection", "1991, 1996, 2001, 2006, 2011, 2016, 2021", "County (CD 3540)", "https://data.ontario.ca/dataset/census-farm-data-collection"),
        ("S9", "OMAFA / Statistics Canada & MPAC", "Estimated Value & Rental Rate of Farmland (farmvalue_en.xlsx) and Census vs. MPAC Total Farm Area (ceag_and_mpac.xlsx)", "Ontario Data Catalogue", "1991–2021 (5-Yr Census)", "County (CD 3540) & 8 Townships", "https://data.ontario.ca/dataset/estimated-value-and-rental-rate-of-farmland-by-county-and-township"),
        ("S10", "Ontario MMAH", "Municipal Financial Information Return (FIR) Schedule 26A — Farmland Property Class (FT) Assessment & Property Taxes", "MMAH FIR Open Data (2021, 2023, 2024)", "2021, 2023, 2024", "County (CD 3540) & 8 Townships", "https://efis.fma.csc.gov.on.ca/fir/index.php/en/open-data/"),
    ]
    for idx, sl in enumerate(sources_list):
        r = write_row(ws1, r, list(sl), left_cols=(1, 2, 3, 4, 5, 6, 7), zebra=(idx % 2 == 1), wrap=True)
    autofit(ws1, max_w=52)

    # =========================================================================
    # TAB 2: 2_Current_State_Snapshot
    # =========================================================================
    ws2 = wb.create_sheet("2_Current_State_Snapshot")
    r = style_banner(
        ws2,
        "EXECUTIVE SNAPSHOT — CURRENT STATE OF FARMING IN HURON COUNTY & 35-YEAR TRAJECTORY",
        "Huron County (Census Division 3540 • OFA Zone 7) — Provincial Powerhouse in Pork, Beef Feedlots, Dairy, Poultry & Field Crops",
        max_col=8,
    )
    es = huron_prof["executiveSummary"]
    noi_91 = next(x for x in noi_huron[1991] if x["bracket"].lower() == "all farms")
    noi_01 = next(x for x in noi_huron[2001] if x["bracket"].lower() == "all farms")
    noi_11 = next(x for x in noi_huron[2011] if x["bracket"].lower() == "all farms")
    noi_21 = next(x for x in noi_huron[2021] if x["bracket"].lower() == "all farms")

    r = write_section_bar(ws2, r, "HURON COUNTY STRUCTURAL EVOLUTION (1991 → 2001 → 2011 → 2021 → LATEST 2024/2026)", 8)
    r = write_headers(ws2, r, ["Dimension / Indicator", "1991", "2001", "2011", "2021 Census", "Latest Annual (2024–2026E)", "Long-Run % Change", "Source"], left_cols=(1, 6, 8))
    snap_rows = [
        ("Total Census Farms (farms)", farms_91_21[1991], farms_91_21[2001], farms_91_21[2011], farms_91_21[2021], "Next Census: May 2027", safe_pct_chg(farms_91_21[2021], farms_91_21[1991]), "S8 (StatCan Census)", "#,##0"),
        ("Total Census Farmland Area (acres)", acres_91_21[1991], acres_91_21[2001], acres_91_21[2011], acres_91_21[2021], "MPAC Assessed: 747,301 ac", safe_pct_chg(acres_91_21[2021], acres_91_21[1991]), "S8 & S9", "#,##0"),
        ("Average Farm Size (acres / farm)", safe_div(acres_91_21[1991], farms_91_21[1991]), safe_div(acres_91_21[2001], farms_91_21[2001]), safe_div(acres_91_21[2011], farms_91_21[2011]), safe_div(acres_91_21[2021], farms_91_21[2021]), "Cropland: 83.9% of farmland", safe_pct_chg(safe_div(acres_91_21[2021], farms_91_21[2021]), safe_div(acres_91_21[1991], farms_91_21[1991])), "S8 (Derived)", "#,##0.0"),
        ("Market Value of Farmland & Buildings ($ / acre)", fv_summary["land_val_per_ac"][1991], fv_summary["land_val_per_ac"][2001], fv_summary["land_val_per_ac"][2011], fv_summary["land_val_per_ac"][2021], "2024 FIR CVA: $8.15B", safe_pct_chg(fv_summary["land_val_per_ac"][2021], fv_summary["land_val_per_ac"][1991]), "S9 & S10", "$#,##0"),
        ("Estimated Cash Rental Rate ($ / acre)", fv_summary["rent_per_ac"][1991], fv_summary["rent_per_ac"][2001], fv_summary["rent_per_ac"][2011], fv_summary["rent_per_ac"][2021], "25.1% of farmland rented", safe_pct_chg(fv_summary["rent_per_ac"][2021], fv_summary["rent_per_ac"][1991]), "S9", "$#,##0.00"),
        ("Total Gross Farm Receipts ($)", noi_91["gross_receipts"], noi_01["gross_receipts"], noi_11["gross_receipts"], noi_21["gross_receipts"], f"2024 FCR: ${es['omafaFcr2024']:,} | 2025P: ${es['omafaFcr2025']:,}", safe_pct_chg(noi_21["gross_receipts"], noi_91["gross_receipts"]), "S1, S3 & S4", "$#,##0"),
        ("Average Gross Farm Receipts per Farm ($ / farm)", safe_div(noi_91["gross_receipts"], noi_91["farms"], 0), safe_div(noi_01["gross_receipts"], noi_01["farms"], 0), safe_div(noi_11["gross_receipts"], noi_11["farms"], 0), safe_div(noi_21["gross_receipts"], noi_21["farms"], 0), "Rank #2 of 49 Ontario CDs", safe_pct_chg(safe_div(noi_21["gross_receipts"], noi_21["farms"], 0), safe_div(noi_91["gross_receipts"], noi_91["farms"], 0)), "S3", "$#,##0"),
        ("Average Net Operating Income per Farm ($ / farm)", noi_91["avg_noi_per_farm"], noi_01["avg_noi_per_farm"], noi_11["avg_noi_per_farm"], noi_21["avg_noi_per_farm"], "2020 Net Cash Margin: 15.8%", safe_pct_chg(noi_21["avg_noi_per_farm"], noi_91["avg_noi_per_farm"]), "S3", "$#,##0"),
        ("Total Pigs Inventory (head) & Avg Pigs/Farm", None, "2004E: 641,600", 557877, 821281, f"July 2026E: {round(ann_pigs[2026]['total_pigs']):,} head (3,312/farm in '21)", safe_pct_chg(821281, 711745), "S1 & S6 (06–21 % chg)", "#,##0"),
        ("Total Cattle & Calves (head) & Avg Cattle/Farm", None, "2004E: 161,250", 129529, 110046, f"July 2026E: {round(ann_cattle[2026]['total_cattle']):,} head (128.9/farm in '21)", safe_pct_chg(110046, 142816), "S1 & S6 (06–21 % chg)", "#,##0"),
        ("Dairy Cows (head) & Milk Shipped per Producer", None, "2004E: 18,500", 15622, 16288, f"2024: 134 DFO herds • 1,356 kL milk/herd", safe_pct_chg(181671 / 134, 119962 / 181), "S1, S6 & S7 (07–24 kL/herd %)", "#,##0"),
        ("Total Hens & Chickens (birds) & Avg Flock/Farm", None, "2006: 5,249,290", 5247785, 5925262, "2021 Avg Flock: 14,074 birds/farm (421 farms)", safe_pct_chg(5925262, 5249290), "S1 & S2 (06–21 % chg)", "#,##0"),
    ]
    for idx, (lbl, v91, v01, v11, v21, vlat, chg, src, nfmt) in enumerate(snap_rows):
        r = write_row(
            ws2,
            r,
            [lbl, v91, v01, v11, v21, vlat, chg, src],
            fmts=[None, nfmt, nfmt, nfmt, nfmt, None, '+0.0"%";-0.0"%";0.0"%"', None],
            left_cols=(1, 6, 8),
            bold=idx in (0, 2, 5, 7),
            zebra=(idx % 2 == 1),
        )
    autofit(ws2, max_w=48)

    # =========================================================================
    # TAB 3: 3_Farm_Incomes_1991_2025
    # =========================================================================
    ws3 = wb.create_sheet("3_Farm_Incomes_1991_2025")
    r = style_banner(
        ws3,
        "HURON COUNTY FARM INCOMES — CENSUS NET OPERATING INCOME (1991–2021) & ANNUAL CASH RECEIPTS (2011–2025)",
        "Sources: StatCan Census / OMAFA noibyfarmsize_en.xlsx (S3), OMAFA County FCR fcrcty_en.xlsx (S4), and StatCan Ontario Net Farm Income 32-10-0052-01 (S5)",
        max_col=12,
    )

    # Table 3A: 7-Census Financial & Net Operating Income Trajectory (1991–2021)
    r = write_section_bar(ws3, r, "TABLE 3A — HURON COUNTY 7-CENSUS GROSS RECEIPTS, OPERATING EXPENSES & NET OPERATING INCOME (1991–2021, SOURCE S3)", 12)
    r = write_headers(
        ws3,
        r,
        [
            "Census Year",
            "Census Farms",
            "Total Gross Farm Receipts ($)",
            "Total Operating Expenses ($)",
            "Total Net Operating Cash Income ($)",
            "Avg Gross Receipts / Farm ($)",
            "Avg Operating Expenses / Farm ($)",
            "Avg Net Operating Income / Farm ($)",
            "Expense-to-Revenue Ratio (%)",
            "Net Income per $1 Receipt ($)",
            "Log10(Total Gross Receipts)",
            "Ln(Avg Gross Receipts / Farm)",
        ],
        left_cols=(),
    )
    for idx, yr in enumerate([1991, 1996, 2001, 2006, 2011, 2016, 2021]):
        all_f = next(x for x in noi_huron[yr] if x["bracket"].lower() == "all farms")
        f_cnt = all_f["farms"]
        gr = all_f["gross_receipts"]
        ex = all_f["operating_expenses"]
        tot_noi = (gr - ex) if (gr is not None and ex is not None) else None
        avg_gr = safe_div(gr, f_cnt, 0)
        avg_ex = safe_div(ex, f_cnt, 0)
        avg_noi = all_f["avg_noi_per_farm"]
        exp_rat = round(ex / gr * 100.0, 2) if (gr and ex) else None
        noi_dlr = round(all_f["noi_per_dollar_rev"], 4) if all_f["noi_per_dollar_rev"] is not None else None

        add_tidy("Farm Income", "All Farms (Census)", "Total Gross Farm Receipts", "dollars", "5-Yr Census", yr, gr, "S3")
        add_tidy("Farm Income", "All Farms (Census)", "Total Operating Expenses", "dollars", "5-Yr Census", yr, ex, "S3")
        add_tidy("Farm Income", "All Farms (Census)", "Average Gross Receipts per Farm", "dollars/farm", "5-Yr Census", yr, avg_gr, "S3")
        add_tidy("Farm Income", "All Farms (Census)", "Average Net Operating Income per Farm", "dollars/farm", "5-Yr Census", yr, avg_noi, "S3")

        r = write_row(
            ws3,
            r,
            [yr, f_cnt, gr, ex, tot_noi, avg_gr, avg_ex, avg_noi, exp_rat, noi_dlr, safe_log10(gr), safe_ln(avg_gr)],
            fmts=["0", "#,##0", "$#,##0", "$#,##0", "$#,##0", "$#,##0", "$#,##0", "$#,##0", '0.00"%"', "$0.000", "0.0000", "0.0000"],
            left_cols=(),
            highlight=(yr == 2021),
            zebra=(idx % 2 == 1),
        )

    # Table 3B: Average Net Operating Income per Farm by Gross Receipt Bracket (1991–2021)
    r += 1
    r = write_section_bar(ws3, r, "TABLE 3B — HURON COUNTY AVERAGE NET OPERATING INCOME PER FARM BY GROSS RECEIPT BRACKET (1991–2021, SOURCE S3)", 11)
    r = write_headers(
        ws3,
        r,
        ["Gross Farm Receipt Size Bracket", "1991 ($/farm)", "1996 ($/farm)", "2001 ($/farm)", "2006 ($/farm)", "2011 ($/farm)", "2016 ($/farm)", "2021 ($/farm)", "2021 Farms in Bracket", "2021 Gross Receipts ($)", "2021 Expense Ratio (%)"],
        left_cols=(1,),
    )
    brackets_order = [x["bracket"] for x in noi_huron[2021]]
    for idx, brk in enumerate(brackets_order):
        vals_yr = []
        for yr in [1991, 1996, 2001, 2006, 2011, 2016, 2021]:
            match = next((x for x in noi_huron[yr] if x["bracket"].replace(" ", "") == brk.replace(" ", "")), None)
            vals_yr.append(round(match["avg_noi_per_farm"]) if (match and match["avg_noi_per_farm"] is not None) else None)
        m21 = next((x for x in noi_huron[2021] if x["bracket"] == brk), None)
        f21_b = m21["farms"] if m21 else None
        gr21_b = m21["gross_receipts"] if m21 else None
        ex21_b = m21["operating_expenses"] if m21 else None
        er21_b = round(ex21_b / gr21_b * 100.0, 1) if (gr21_b and ex21_b) else None
        r = write_row(
            ws3,
            r,
            [brk, *vals_yr, f21_b, gr21_b, er21_b],
            fmts=[None, "$#,##0;($#,##0);$0", "$#,##0;($#,##0);$0", "$#,##0;($#,##0);$0", "$#,##0;($#,##0);$0", "$#,##0;($#,##0);$0", "$#,##0;($#,##0);$0", "$#,##0;($#,##0);$0", "#,##0", "$#,##0", '0.0"%"'],
            left_cols=(1,),
            bold=(brk.lower() == "all farms"),
            zebra=(idx % 2 == 1),
        )

    # Table 3C: Annual OMAFA Farm Cash Receipts by Commodity in Huron County (2011–2025)
    r += 1
    fcr_wb = openpyxl.load_workbook(PROJECT_DIR / "data-pipeline" / "raw" / "profiles" / "omafa_fcr_county" / "fcrcty_en.xlsx", data_only=True, read_only=True)
    # Use tidy CSV from p01 for exact Huron County 2011..2025 series across all 37 indicators
    fcr_huron: dict[str, dict[int, float]] = {}
    fcr_labels: dict[str, str] = {}
    fcr_cats: dict[str, str] = {}
    with (PROJECT_DIR / "data-pipeline" / "processed" / "profiles" / "omafa_fcr_county.csv").open("r", encoding="utf-8") as f:
        for row_d in csv.DictReader(f):
            if row_d["geo_level"] == "CD" and row_d["geo_code"] == "3540":
                iid = row_d["indicator_id"]
                fcr_labels[iid] = row_d["indicator_label"].replace("Farm cash receipts: ", "")
                fcr_cats[iid] = row_d["category"]
                v = to_float(row_d["value"])
                if v is not None:
                    fcr_huron.setdefault(iid, {})[int(row_d["ref_year"])] = round(v * 1_000_000.0)

    fcr_yrs = list(range(2011, 2026))
    r = write_section_bar(ws3, r, "TABLE 3C — HURON COUNTY ANNUAL FARM CASH RECEIPTS BY SPECIFIC COMMODITY (2011–2025, $, SOURCE S4)", 18)
    r = write_headers(ws3, r, ["Commodity", "Group", *[str(y) for y in fcr_yrs], "Log10(2024 $)"], left_cols=(1, 2))
    sorted_fcr_ids = sorted(
        fcr_huron.keys(),
        key=lambda k: (0 if "total" in k else 1, -(fcr_huron[k].get(2024, 0.0))),
    )
    for idx, iid in enumerate(sorted_fcr_ids):
        ymap = fcr_huron[iid]
        lbl = fcr_labels[iid]
        for y in fcr_yrs:
            if y in ymap:
                add_tidy("Annual Farm Cash Receipts", lbl, "Farm Cash Receipts", "dollars", "Annual", y, ymap[y], "S4")
        r = write_row(
            ws3,
            r,
            [lbl, fcr_cats[iid], *[ymap.get(y) for y in fcr_yrs], safe_log10(ymap.get(2024))],
            fmts=[None, None, *(["$#,##0"] * len(fcr_yrs)), "0.0000"],
            left_cols=(1, 2),
            bold=("total" in iid),
            zebra=(idx % 2 == 1),
        )

    # Table 3D: Ontario Provincial Annual Net Farm Income (2000–2025)
    r += 1
    r = write_section_bar(ws3, r, "TABLE 3D — ONTARIO PROVINCIAL ANNUAL ACCOUNTING NET FARM INCOME BENCHMARK (2000–2025, $, SOURCE S5: STATCAN 32-10-0052-01)", 9)
    r = write_headers(
        ws3,
        r,
        ["Year", "Total Cash Receipts ($)", "Operating Expenses After Rebates ($)", "Net Cash Income ($)", "Depreciation Charges ($)", "Realized Net Income ($)", "Value of Inventory Change ($)", "Total Net Income ($)", "Expense-to-Receipt Ratio (%)"],
        left_cols=(),
    )
    for idx, yr in enumerate(sorted(ont_nfi.keys())):
        m = ont_nfi[yr]
        cr_v = m.get("Cash receipts, total")
        oe_v = m.get("Operating expenses after rebates")
        nci_v = m.get("Net cash income")
        dep_v = m.get("Depreciation charges")
        rni_v = m.get("Realized net income")
        inv_v = m.get("Value of inventory change")
        tni_v = m.get("Net income, total")
        rat_v = round(oe_v / cr_v * 100.0, 2) if (cr_v and oe_v) else None
        r = write_row(
            ws3,
            r,
            [yr, cr_v, oe_v, nci_v, dep_v, rni_v, inv_v, tni_v, rat_v],
            fmts=["0", "$#,##0", "$#,##0", "$#,##0", "$#,##0", "$#,##0;($#,##0);$0", "$#,##0;($#,##0);$0", "$#,##0;($#,##0);$0", '0.00"%"'],
            left_cols=(),
            zebra=(idx % 2 == 1),
        )
    autofit(ws3, max_w=38)

    # =========================================================================
    # TAB 4: 4_Herd_Flock_By_Commodity (Census 2006–2021 Specific Commodities)
    # =========================================================================
    ws4 = wb.create_sheet("4_Herd_Flock_By_Commodity")
    r = style_banner(
        ws4,
        "HURON COUNTY HERD, FLOCK & COLONY SIZES — BROKEN OUT BY SPECIFIC LIVESTOCK & POULTRY COMMODITY (2006–2021)",
        "Sources: StatCan WDS Cubes 32-10-0370 to 0378 (2021, S1), Cubes 32-10-0424 to 0432 (2011 & 2016, S2), and Reconciled 2006 Census (S8)",
        max_col=17,
    )
    r = write_note_box(
        ws4,
        r,
        "DATA INTEGRITY NOTE: Every livestock, poultry, egg, and apiculture commodity is reported individually—never lumped across species. Direct verification against Statistics Canada Cubes 32-10-0372-01 and 32-10-0375-01 also corrected two errors present in OMAFA's legacy huron.xlsx spreadsheet (where 2021 Sows [65,872] and Boars [535] were swapped, and 2021 Broiler/Turkey pounds were pasted into kilograms). Cells marked 'x' or 'F' are suppressed by Statistics Canada for confidentiality.",
        max_col=17,
        height=38,
    )

    def aco_val(prefix: str, yr: int) -> float | None:
        row_o = aco_by_id.get(prefix)
        if not row_o:
            return None
        return row_o.get(f"v{yr}")

    # Build unified commodity rows: (Section, Commodity Label, Volume Unit, f06,f11,f16,f21, n06,n11,n16,n21, SourceTag)
    HERD_SPECS: list[tuple[str, str, str, tuple[float | None, ...], tuple[float | None, ...], str]] = [
        # SECTION A: DAIRY CATTLE
        (
            "A. DAIRY CATTLE SECTOR",
            "Dairy cows (milking & dry)",
            "head",
            (aco_val("aco_r379_", 2006), sc16_cat[(2011, "Dairy cows", "Number of farms reporting")][0], sc16_cat[(2016, "Dairy cows", "Number of farms reporting")][0], sc21_cat[("Cows, dairy", "Number of farms reporting")][0]),
            (aco_val("aco_r380_", 2006), sc16_cat[(2011, "Dairy cows", "Number of animals")][0], sc16_cat[(2016, "Dairy cows", "Number of animals")][0], sc21_cat[("Cows, dairy", "Number of animals")][0]),
            "S1 & S2 (32-10-0370 / 0424)",
        ),
        (
            "A. DAIRY CATTLE SECTOR",
            "Heifers for dairy herd replacement (1 year & over)",
            "head",
            (aco_val("aco_r373_", 2006), sc16_cat[(2011, "Heifers for dairy herd replacement", "Number of farms reporting")][0], sc16_cat[(2016, "Heifers for dairy herd replacement", "Number of farms reporting")][0], sc21_cat[("Heifers, for dairy herd replacement", "Number of farms reporting")][0]),
            (aco_val("aco_r374_", 2006), sc16_cat[(2011, "Heifers for dairy herd replacement", "Number of animals")][0], sc16_cat[(2016, "Heifers for dairy herd replacement", "Number of animals")][0], sc21_cat[("Heifers, for dairy herd replacement", "Number of animals")][0]),
            "S1 & S2 (32-10-0370 / 0424)",
        ),
        # SECTION B: BEEF CATTLE & FEEDLOTS
        (
            "B. BEEF CATTLE & FEEDLOT SECTOR",
            "Beef cows (cow-calf breeding herd)",
            "head",
            (aco_val("aco_r377_", 2006), sc16_cat[(2011, "Beef cows", "Number of farms reporting")][0], sc16_cat[(2016, "Beef cows", "Number of farms reporting")][0], sc21_cat[("Cows, beef", "Number of farms reporting")][0]),
            (aco_val("aco_r378_", 2006), sc16_cat[(2011, "Beef cows", "Number of animals")][0], sc16_cat[(2016, "Beef cows", "Number of animals")][0], sc21_cat[("Cows, beef", "Number of animals")][0]),
            "S1 & S2 (32-10-0370 / 0424)",
        ),
        (
            "B. BEEF CATTLE & FEEDLOT SECTOR",
            "Heifers for beef herd replacement (1 year & over)",
            "head",
            (aco_val("aco_r371_", 2006), sc16_cat[(2011, "Heifers for beef herd replacement", "Number of farms reporting")][0], sc16_cat[(2016, "Heifers for beef herd replacement", "Number of farms reporting")][0], sc21_cat[("Heifers, for beef herd replacement", "Number of farms reporting")][0]),
            (aco_val("aco_r372_", 2006), sc16_cat[(2011, "Heifers for beef herd replacement", "Number of animals")][0], sc16_cat[(2016, "Heifers for beef herd replacement", "Number of animals")][0], sc21_cat[("Heifers, for beef herd replacement", "Number of animals")][0]),
            "S1 & S2 (32-10-0370 / 0424)",
        ),
        (
            "B. BEEF CATTLE & FEEDLOT SECTOR",
            "Heifers for slaughter or feeding (feedlot heifers, 1 yr+)",
            "head",
            (aco_val("aco_r369_", 2006), sc16_cat[(2011, "Heifers for slaughter or feeding", "Number of farms reporting")][0], sc16_cat[(2016, "Heifers for slaughter or feeding", "Number of farms reporting")][0], sc21_cat[("Heifers, for slaughter or feeding", "Number of farms reporting")][0]),
            (aco_val("aco_r370_", 2006), sc16_cat[(2011, "Heifers for slaughter or feeding", "Number of animals")][0], sc16_cat[(2016, "Heifers for slaughter or feeding", "Number of animals")][0], sc21_cat[("Heifers, for slaughter or feeding", "Number of animals")][0]),
            "S1 & S2 (32-10-0370 / 0424)",
        ),
        (
            "B. BEEF CATTLE & FEEDLOT SECTOR",
            "Steers (1 year & over)",
            "head",
            (aco_val("aco_r365_", 2006), sc16_cat[(2011, "Steers, 1 year and over", "Number of farms reporting")][0], sc16_cat[(2016, "Steers, 1 year and over", "Number of farms reporting")][0], sc21_cat[("Steers", "Number of farms reporting")][0]),
            (aco_val("aco_r366_", 2006), sc16_cat[(2011, "Steers, 1 year and over", "Number of animals")][0], sc16_cat[(2016, "Steers, 1 year and over", "Number of animals")][0], sc21_cat[("Steers", "Number of animals")][0]),
            "S1 & S2 (32-10-0370 / 0424)",
        ),
        (
            "B. BEEF CATTLE & FEEDLOT SECTOR",
            "Calves (under 1 year)",
            "head",
            (aco_val("aco_r363_", 2006), sc16_cat[(2011, "Calves, under 1 year", "Number of farms reporting")][0], sc16_cat[(2016, "Calves, under 1 year", "Number of farms reporting")][0], sc21_cat[("Calves (under 1 year)", "Number of farms reporting")][0]),
            (aco_val("aco_r364_", 2006), sc16_cat[(2011, "Calves, under 1 year", "Number of animals")][0], sc16_cat[(2016, "Calves, under 1 year", "Number of animals")][0], sc21_cat[("Calves (under 1 year)", "Number of animals")][0]),
            "S1 & S2 (32-10-0370 / 0424)",
        ),
        (
            "B. BEEF CATTLE & FEEDLOT SECTOR",
            "Bulls (1 year & over)",
            "head",
            (aco_val("aco_r381_", 2006), sc16_cat[(2011, "Bulls, 1 year and over", "Number of farms reporting")][0], sc16_cat[(2016, "Bulls, 1 year and over", "Number of farms reporting")][0], sc21_cat[("Bulls", "Number of farms reporting")][0]),
            (aco_val("aco_r382_", 2006), sc16_cat[(2011, "Bulls, 1 year and over", "Number of animals")][0], sc16_cat[(2016, "Bulls, 1 year and over", "Number of animals")][0], sc21_cat[("Bulls", "Number of animals")][0]),
            "S1 & S2 (32-10-0370 / 0424)",
        ),
        (
            "B. BEEF CATTLE & FEEDLOT SECTOR",
            "Total cattle and calves (all dairy & beef classes)",
            "head",
            (aco_val("aco_r361_", 2006), sc16_cat[(2011, "Total cattle and calves", "Number of farms reporting")][0], sc16_cat[(2016, "Total cattle and calves", "Number of farms reporting")][0], sc21_cat[("Total cattle", "Number of farms reporting")][0]),
            (aco_val("aco_r362_", 2006), sc16_cat[(2011, "Total cattle and calves", "Number of animals")][0], sc16_cat[(2016, "Total cattle and calves", "Number of animals")][0], sc21_cat[("Total cattle", "Number of animals")][0]),
            "S1 & S2 (32-10-0370 / 0424)",
        ),
        # SECTION C: HOGS & PIGS (SWINE)
        (
            "C. HOGS & PIGS (SWINE SECTOR)",
            "Sows and gilts for breeding",
            "head",
            (aco_val("aco_r399_", 2006), sc16_pig[(2011, "Sows and gilts for breeding", "Number of farms reporting")][0], sc16_pig[(2016, "Sows and gilts for breeding", "Number of farms reporting")][0], sc21_pig[("Sows and gilts for breeding", "Number of farms reporting")][0]),
            (aco_val("aco_r400_", 2006), sc16_pig[(2011, "Sows and gilts for breeding", "Number of animals")][0], sc16_pig[(2016, "Sows and gilts for breeding", "Number of animals")][0], sc21_pig[("Sows and gilts for breeding", "Number of animals")][0]),
            "S1 & S2 (32-10-0372 / 0426)",
        ),
        (
            "C. HOGS & PIGS (SWINE SECTOR)",
            "Boars for breeding",
            "head",
            (aco_val("aco_r397_", 2006), sc16_pig[(2011, "Boars", "Number of farms reporting")][0], sc16_pig[(2016, "Boars", "Number of farms reporting")][0], sc21_pig[("Boars for breeding", "Number of farms reporting")][0]),
            (aco_val("aco_r398_", 2006), sc16_pig[(2011, "Boars", "Number of animals")][0], sc16_pig[(2016, "Boars", "Number of animals")][0], sc21_pig[("Boars for breeding", "Number of animals")][0]),
            "S1 & S2 (32-10-0372 / 0426)",
        ),
        (
            "C. HOGS & PIGS (SWINE SECTOR)",
            "Nursing / suckling pigs (<7 kg in 2021)",
            "head",
            (aco_val("aco_r401_", 2006), sc16_pig[(2011, "Nursing pigs", "Number of farms reporting")][0], sc16_pig[(2016, "Nursing pigs", "Number of farms reporting")][0], sc21_pig[("Suckling pigs, less than 15 lb (7 kg)", "Number of farms reporting")][0]),
            (aco_val("aco_r402_", 2006), sc16_pig[(2011, "Nursing pigs", "Number of animals")][0], sc16_pig[(2016, "Nursing pigs", "Number of animals")][0], sc21_pig[("Suckling pigs, less than 15 lb (7 kg)", "Number of animals")][0]),
            "S1 & S2 (32-10-0372 / 0426)",
        ),
        (
            "C. HOGS & PIGS (SWINE SECTOR)",
            "Weaner / nursery / starter pigs (7–22 kg in 2021)",
            "head",
            (None, sc16_pig[(2011, "Weaner pigs", "Number of farms reporting")][0], sc16_pig[(2016, "Weaner pigs", "Number of farms reporting")][0], sc21_pig[("Weanling, nursery or starter pigs, 15 to 49 lb (7 to 22 kg)", "Number of farms reporting")][0]),
            (None, sc16_pig[(2011, "Weaner pigs", "Number of animals")][0], sc16_pig[(2016, "Weaner pigs", "Number of animals")][0], sc21_pig[("Weanling, nursery or starter pigs, 15 to 49 lb (7 to 22 kg)", "Number of animals")][0]),
            "S1 & S2 (32-10-0372 / 0426)",
        ),
        (
            "C. HOGS & PIGS (SWINE SECTOR)",
            "Grower & finishing market pigs (23 kg+ in 2021)",
            "head",
            (aco_val("aco_r405_", 2006), sc16_pig[(2011, "Grower and finishing pigs", "Number of farms reporting")][0], sc16_pig[(2016, "Grower and finishing pigs", "Number of farms reporting")][0], sc21_pig[("Market pigs, 50 lb (23 kg) and over", "Number of farms reporting")][0]),
            (aco_val("aco_r406_", 2006), sc16_pig[(2011, "Grower and finishing pigs", "Number of animals")][0], sc16_pig[(2016, "Grower and finishing pigs", "Number of animals")][0], sc21_pig[("Market pigs, 50 lb (23 kg) and over", "Number of animals")][0]),
            "S1 & S2 (32-10-0372 / 0426)",
        ),
        (
            "C. HOGS & PIGS (SWINE SECTOR)",
            "Total pigs (all swine classes)",
            "head",
            (aco_val("aco_r395_", 2006), sc16_pig[(2011, "Total pigs", "Number of farms reporting")][0], sc16_pig[(2016, "Total pigs", "Number of farms reporting")][0], sc21_pig[("Total pigs", "Number of farms reporting")][0]),
            (aco_val("aco_r396_", 2006), sc16_pig[(2011, "Total pigs", "Number of animals")][0], sc16_pig[(2016, "Total pigs", "Number of animals")][0], sc21_pig[("Total pigs", "Number of animals")][0]),
            "S1 & S2 (32-10-0372 / 0426)",
        ),
        # SECTION D: POULTRY FLOCKS & MEAT PRODUCTION
        (
            "D. POULTRY FLOCKS & MEAT PRODUCTION",
            "Broilers, roasters & Cornish — Flock Inventory",
            "birds",
            (aco_val("aco_r433_", 2006), sc16_plt[(2011, "Broilers, roasters and Cornish", "Number of farms reporting")][0], sc16_plt[(2016, "Broilers, roasters and Cornish", "Number of farms reporting")][0], sc21_plt[("Broilers, roasters and Cornish", "Number of farms reporting")][0]),
            (aco_val("aco_r434_", 2006), sc16_plt[(2011, "Broilers, roasters and Cornish", "Number of birds")][0], sc16_plt[(2016, "Broilers, roasters and Cornish", "Number of birds")][0], sc21_plt[("Broilers, roasters and Cornish", "Number of birds")][0]),
            "S1 & S2 (32-10-0374 / 0428)",
        ),
        (
            "D. POULTRY FLOCKS & MEAT PRODUCTION",
            "Broilers, roasters & Cornish — Annual Meat Produced (kg)",
            "kg live/dressed",
            (aco_val("aco_r443_", 2006), sc16_ppr[(2011, "Broilers, roasters and Cornish production", "Number of farms reporting")][0], sc16_ppr[(2016, "Broilers, roasters and Cornish production", "Number of farms reporting")][0], sc21_ppr[("Broilers, roasters and Cornish production", "Number of farms reporting")][0]),
            (aco_val("aco_r444_", 2006), sc16_ppr[(2011, "Broilers, roasters and Cornish production", "Kilograms")][0], sc16_ppr[(2016, "Broilers, roasters and Cornish production", "Kilograms")][0], sc21_ppr[("Broilers, roasters and Cornish production", "Kilograms")][0]),
            "S1 & S2 (32-10-0375 / 0429)",
        ),
        (
            "D. POULTRY FLOCKS & MEAT PRODUCTION",
            "Laying hens (19 weeks & over, producing table eggs)",
            "birds",
            (aco_val("aco_r429_", 2006), sc16_plt[(2011, "Laying hens, 19 weeks and over, that produce table eggs", "Number of farms reporting")][0], sc16_plt[(2016, "Laying hens, 19 weeks and over, that produce table eggs", "Number of farms reporting")][0], sc21_plt[("Laying hens that produce table eggs, 19 weeks and over", "Number of farms reporting")][0]),
            (aco_val("aco_r430_", 2006), sc16_plt[(2011, "Laying hens, 19 weeks and over, that produce table eggs", "Number of birds")][0], sc16_plt[(2016, "Laying hens, 19 weeks and over, that produce table eggs", "Number of birds")][0], sc21_plt[("Laying hens that produce table eggs, 19 weeks and over", "Number of birds")][0]),
            "S1 & S2 (32-10-0374 / 0428)",
        ),
        (
            "D. POULTRY FLOCKS & MEAT PRODUCTION",
            "Pullets under 19 weeks (intended for laying)",
            "birds",
            (aco_val("aco_r427_", 2006), sc16_plt[(2011, "Pullets under 19 weeks, intended for laying table eggs", "Number of farms reporting")][0], sc16_plt[(2016, "Pullets under 19 weeks, intended for laying table eggs", "Number of farms reporting")][0], sc21_plt[("Pullets intended for laying table eggs, under 19 weeks", "Number of farms reporting")][0]),
            (aco_val("aco_r428_", 2006), sc16_plt[(2011, "Pullets under 19 weeks, intended for laying table eggs", "Number of birds")][0], sc16_plt[(2016, "Pullets under 19 weeks, intended for laying table eggs", "Number of birds")][0], aco_val("aco_r428_", 2021)),
            "S1, S2 & S8 (32-10-0374 / 0428)",
        ),
        (
            "D. POULTRY FLOCKS & MEAT PRODUCTION",
            "Layer and broiler breeders (pullets & hens)",
            "birds",
            (None, sc16_plt[(2011, "Layer and broiler breeders (pullets and hens)", "Number of farms reporting")][0], sc16_plt[(2016, "Layer and broiler breeders (pullets and hens)", "Number of farms reporting")][0], sc21_plt[("Layer and broiler breeders (pullets and hens), total", "Number of farms reporting")][0]),
            (None, sc16_plt[(2011, "Layer and broiler breeders (pullets and hens)", "Number of birds")][0], sc16_plt[(2016, "Layer and broiler breeders (pullets and hens)", "Number of birds")][0], aco_val("aco_r432_", 2021)),
            "S1, S2 & S8 (32-10-0374 / 0428)",
        ),
        (
            "D. POULTRY FLOCKS & MEAT PRODUCTION",
            "Total hens and chickens (all chicken classes)",
            "birds",
            (aco_val("aco_r425_", 2006), sc16_plt[(2011, "Total hens and chickens", "Number of farms reporting")][0], sc16_plt[(2016, "Total hens and chickens", "Number of farms reporting")][0], sc21_plt[("Total hens and chickens", "Number of farms reporting")][0]),
            (aco_val("aco_r426_", 2006), sc16_plt[(2011, "Total hens and chickens", "Number of birds")][0], sc16_plt[(2016, "Total hens and chickens", "Number of birds")][0], sc21_plt[("Total hens and chickens", "Number of birds")][0]),
            "S1 & S2 (32-10-0374 / 0428)",
        ),
        (
            "D. POULTRY FLOCKS & MEAT PRODUCTION",
            "Turkeys — Flock Inventory",
            "birds",
            (aco_val("aco_r435_", 2006), sc16_plt[(2011, "Turkeys", "Number of farms reporting")][0], sc16_plt[(2016, "Turkeys", "Number of farms reporting")][0], sc21_plt[("Turkeys", "Number of farms reporting")][0]),
            (aco_val("aco_r436_", 2006), sc16_plt[(2011, "Turkeys", "Number of birds")][0], sc16_plt[(2016, "Turkeys", "Number of birds")][0], sc21_plt[("Turkeys", "Number of birds")][0]),
            "S1 & S2 (32-10-0374 / 0428)",
        ),
        (
            "D. POULTRY FLOCKS & MEAT PRODUCTION",
            "Turkeys — Annual Meat Produced (kg)",
            "kg",
            (aco_val("aco_r445_", 2006), sc16_ppr[(2011, "Turkey production", "Number of farms reporting")][0], sc16_ppr[(2016, "Turkey production", "Number of farms reporting")][0], sc21_ppr[("Turkey production", "Number of farms reporting")][0]),
            (aco_val("aco_r446_", 2006), sc16_ppr[(2011, "Turkey production", "Kilograms")][0], sc16_ppr[(2016, "Turkey production", "Kilograms")][0], sc21_ppr[("Turkey production", "Kilograms")][0]),
            "S1 & S2 (32-10-0375 / 0429)",
        ),
        (
            "D. POULTRY FLOCKS & MEAT PRODUCTION",
            "Ducks",
            "birds",
            (None, None, None, sc21_plt[("Ducks", "Number of farms reporting")][0]),
            (None, None, None, aco_val("aco_r438_", 2021)),
            "S1 & S8 (32-10-0374)",
        ),
        (
            "D. POULTRY FLOCKS & MEAT PRODUCTION",
            "Geese",
            "birds",
            (None, None, None, sc21_plt[("Geese", "Number of farms reporting")][0]),
            (None, None, None, aco_val("aco_r440_", 2021)),
            "S1 & S8 (32-10-0374)",
        ),
        (
            "D. POULTRY FLOCKS & MEAT PRODUCTION",
            "Other poultry (pheasants, quail, guinea fowl, etc.)",
            "birds",
            (aco_val("aco_r441_", 2006), sc16_plt[(2011, "Other poultry", "Number of farms reporting")][0], sc16_plt[(2016, "Other poultry", "Number of farms reporting")][0], sc21_plt[("Other poultry", "Number of farms reporting")][0]),
            (aco_val("aco_r442_", 2006), sc16_plt[(2011, "Other poultry", "Number of birds")][0], sc16_plt[(2016, "Other poultry", "Number of birds")][0], aco_val("aco_r442_", 2021)),
            "S1, S2 & S8 (32-10-0374 / 0428)",
        ),
        # SECTION E: EGG PRODUCTION
        (
            "E. EGG PRODUCTION (TABLE & HATCHING)",
            "Table eggs produced (dozens)",
            "dozens",
            (None, sc16_egg[(2011, "Table eggs", "Number of farms reporting")][0], sc16_egg[(2016, "Table eggs", "Number of farms reporting")][0], sc21_egg[("Table eggs", "Number of farms reporting")][0]),
            (None, sc16_egg[(2011, "Table eggs", "Number of eggs (dozens)")][0], sc16_egg[(2016, "Table eggs", "Number of eggs (dozens)")][0], sc21_egg[("Table eggs", "Number of eggs (dozens)")][0]),
            "S1 & S2 (32-10-0376 / 0430)",
        ),
        (
            "E. EGG PRODUCTION (TABLE & HATCHING)",
            "Hatching eggs produced (dozens)",
            "dozens",
            (None, sc16_egg[(2011, "Hatching eggs", "Number of farms reporting")][0], sc16_egg[(2016, "Hatching eggs", "Number of farms reporting")][0], sc21_egg[("Hatching eggs", "Number of farms reporting")][0]),
            (None, sc16_egg[(2011, "Hatching eggs", "Number of eggs (dozens)")][0], sc16_egg[(2016, "Hatching eggs", "Number of eggs (dozens)")][0], sc21_egg[("Hatching eggs", "Number of eggs (dozens)")][0]),
            "S1 & S2 (32-10-0376 / 0430)",
        ),
        # SECTION F: SHEEP, LAMBS & GOATS
        (
            "F. SHEEP, LAMBS & GOATS",
            "Total sheep and lambs",
            "head",
            (aco_val("aco_r383_", 2006), sc16_shp[(2011, "Total sheep and lambs", "Number of farms reporting")][0], sc16_shp[(2016, "Total sheep and lambs", "Number of farms reporting")][0], sc21_shp[("Total sheep", "Number of farms reporting")][0]),
            (aco_val("aco_r384_", 2006), sc16_shp[(2011, "Total sheep and lambs", "Number of animals")][0], sc16_shp[(2016, "Total sheep and lambs", "Number of animals")][0], sc21_shp[("Total sheep", "Number of animals")][0]),
            "S1 & S2 (32-10-0371 / 0425)",
        ),
        (
            "F. SHEEP, LAMBS & GOATS",
            "Ewes (breeding females)",
            "head",
            (aco_val("aco_r387_", 2006), sc16_shp[(2011, "Ewes", "Number of farms reporting")][0], sc16_shp[(2016, "Ewes", "Number of farms reporting")][0], sc21_shp[("Ewes", "Number of farms reporting")][0]),
            (aco_val("aco_r388_", 2006), sc16_shp[(2011, "Ewes", "Number of animals")][0], sc16_shp[(2016, "Ewes", "Number of animals")][0], sc21_shp[("Ewes", "Number of animals")][0]),
            "S1 & S2 (32-10-0371 / 0425)",
        ),
        (
            "F. SHEEP, LAMBS & GOATS",
            "Rams",
            "head",
            (aco_val("aco_r385_", 2006), sc16_shp[(2011, "Rams", "Number of farms reporting")][0], sc16_shp[(2016, "Rams", "Number of farms reporting")][0], sc21_shp[("Rams", "Number of farms reporting")][0]),
            (aco_val("aco_r386_", 2006), sc16_shp[(2011, "Rams", "Number of animals")][0], sc16_shp[(2016, "Rams", "Number of animals")][0], sc21_shp[("Rams", "Number of animals")][0]),
            "S1 & S2 (32-10-0371 / 0425)",
        ),
        (
            "F. SHEEP, LAMBS & GOATS",
            "Lambs (replacement & market)",
            "head",
            (aco_val("aco_r389_", 2006), sc16_shp[(2011, "Lambs", "Number of farms reporting")][0], sc16_shp[(2016, "Lambs", "Number of farms reporting")][0], sc21_shp[("Lambs, total", "Number of farms reporting")][0]),
            (aco_val("aco_r390_", 2006), sc16_shp[(2011, "Lambs", "Number of animals")][0], sc16_shp[(2016, "Lambs", "Number of animals")][0], sc21_shp[("Lambs, total", "Number of animals")][0]),
            "S1 & S2 (32-10-0371 / 0425)",
        ),
        (
            "F. SHEEP, LAMBS & GOATS",
            "Goats (dairy & meat goats)",
            "head",
            (aco_val("aco_r411_", 2006), sc16_oth[(2011, "Goats", "Number of farms reporting")][0], sc16_oth[(2016, "Goats", "Number of farms reporting")][0], sc21_oth[("Goats", "Number of farms reporting")][0]),
            (aco_val("aco_r412_", 2006), sc16_oth[(2011, "Goats", "Number of animals")][0], sc16_oth[(2016, "Goats", "Number of animals")][0], sc21_oth[("Goats", "Number of animals")][0]),
            "S1 & S2 (32-10-0373 / 0427)",
        ),
        # SECTION G: EQUINE, SPECIALTY LIVESTOCK & HONEYBEES
        (
            "G. EQUINE, SPECIALTY LIVESTOCK & HONEYBEES",
            "Horses and ponies",
            "head",
            (aco_val("aco_r407_", 2006), sc16_oth[(2011, "Horses and ponies", "Number of farms reporting")][0], sc16_oth[(2016, "Horses and ponies", "Number of farms reporting")][0], sc21_oth[("Horses and ponies", "Number of farms reporting")][0]),
            (aco_val("aco_r408_", 2006), sc16_oth[(2011, "Horses and ponies", "Number of animals")][0], sc16_oth[(2016, "Horses and ponies", "Number of animals")][0], sc21_oth[("Horses and ponies", "Number of animals")][0]),
            "S1 & S2 (32-10-0373 / 0427)",
        ),
        (
            "G. EQUINE, SPECIALTY LIVESTOCK & HONEYBEES",
            "Donkeys and mules",
            "head",
            (None, None, None, sc21_oth[("Donkeys and mules", "Number of farms reporting")][0]),
            (None, None, None, sc21_oth[("Donkeys and mules", "Number of animals")][0]),
            "S1 (32-10-0373)",
        ),
        (
            "G. EQUINE, SPECIALTY LIVESTOCK & HONEYBEES",
            "Farmed deer (excluding wild deer)",
            "head",
            (aco_val("aco_r421_", 2006), sc16_oth[(2011, "Deer (excluding wild deer)", "Number of farms reporting")][0], sc16_oth[(2016, "Deer (excluding wild deer)", "Number of farms reporting")][0], sc21_oth[("Deer (excluding wild deer)", "Number of farms reporting")][0]),
            (aco_val("aco_r422_", 2006), sc16_oth[(2011, "Deer (excluding wild deer)", "Number of animals")][0], sc16_oth[(2016, "Deer (excluding wild deer)", "Number of animals")][0], aco_val("aco_r422_", 2021)),
            "S1, S2 & S8 (32-10-0373 / 0427)",
        ),
        (
            "G. EQUINE, SPECIALTY LIVESTOCK & HONEYBEES",
            "Llamas and alpacas",
            "head",
            (aco_val("aco_r413_", 2006), sc16_oth[(2011, "Llamas and alpacas", "Number of farms reporting")][0], sc16_oth[(2016, "Llamas and alpacas", "Number of farms reporting")][0], sc21_oth[("Llamas and alpacas", "Number of farms reporting")][0]),
            (aco_val("aco_r414_", 2006), sc16_oth[(2011, "Llamas and alpacas", "Number of animals")][0], sc16_oth[(2016, "Llamas and alpacas", "Number of animals")][0], aco_val("aco_r414_", 2021)),
            "S1, S2 & S8 (32-10-0373 / 0427)",
        ),
        (
            "G. EQUINE, SPECIALTY LIVESTOCK & HONEYBEES",
            "Honeybees (live colonies)",
            "colonies",
            (aco_val("aco_r453_", 2006), sc16_bee[(2011, "Colonies of honeybees", "Number of farms reporting")][0], sc16_bee[(2016, "Colonies of honeybees", "Number of farms reporting")][0], sc21_bee[("Honeybees, live colonies", "Number of farms reporting")][0]),
            (aco_val("aco_r454_", 2006), sc16_bee[(2011, "Colonies of honeybees", "Number")][0], sc16_bee[(2016, "Colonies of honeybees", "Number")][0], aco_val("aco_r454_", 2021)),
            "S1, S2 & S8 (32-10-0378 / 0432)",
        ),
    ]

    r = write_headers(
        ws4,
        r,
        [
            "Specific Livestock / Poultry Commodity",
            "Unit",
            "Farms 2006",
            "Farms 2011",
            "Farms 2016",
            "Farms 2021",
            "Total Volume 2006",
            "Total Volume 2011",
            "Total Volume 2016",
            "Total Volume 2021",
            "Avg Size / Farm 2006",
            "Avg Size / Farm 2011",
            "Avg Size / Farm 2016",
            "Avg Size / Farm 2021",
            "Avg Size % Chg (06–21)",
            "Log10(2021 Avg Size)",
            "Empirical Source",
        ],
        left_cols=(1, 2, 17),
    )

    cur_sec = ""
    for idx, (sec, lbl, unit, f_tup, n_tup, src_tag) in enumerate(HERD_SPECS):
        if sec != cur_sec:
            cur_sec = sec
            r = write_section_bar(ws4, r, cur_sec, 17)
        f06, f11, f16, f21 = f_tup
        n06, n11, n16, n21 = n_tup
        a06 = safe_div(n06, f06, 1)
        a11 = safe_div(n11, f11, 1)
        a16 = safe_div(n16, f16, 1)
        a21 = safe_div(n21, f21, 1)
        chg_a = safe_pct_chg(a21, a06 if a06 is not None else a11)

        for y_i, fv_i, nv_i, av_i in [(2006, f06, n06, a06), (2011, f11, n11, a11), (2016, f16, n16, a16), (2021, f21, n21, a21)]:
            add_tidy("Census Herd & Flock Size", lbl, "Farms Reporting", "farms", "5-Yr Census", y_i, fv_i, src_tag)
            add_tidy("Census Herd & Flock Size", lbl, f"Total ({unit})", unit, "5-Yr Census", y_i, nv_i, src_tag)
            add_tidy("Census Herd & Flock Size", lbl, f"Average per Farm ({unit}/farm)", f"{unit}/farm", "5-Yr Census", y_i, av_i, src_tag)

        is_tot = lbl.startswith("Total ")
        r = write_row(
            ws4,
            r,
            [lbl, unit, f06, f11, f16, f21, n06, n11, n16, n21, a06, a11, a16, a21, chg_a, safe_log10(a21), src_tag],
            fmts=[None, None, "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0.0", "#,##0.0", "#,##0.0", "#,##0.0", '+0.0"%";-0.0"%";0.0"%"', "0.0000", None],
            left_cols=(1, 2, 17),
            bold=is_tot,
            zebra=(idx % 2 == 1),
        )
    autofit(ws4, max_w=46)

    # =========================================================================
    # TAB 5: 5_Annual_Herd_Dairy_2004_26 (Annual County Inventories & DFO Dairy)
    # =========================================================================
    ws5 = wb.create_sheet("5_Annual_Herd_Dairy_2004_26")
    r = style_banner(
        ws5,
        "HURON COUNTY ANNUAL LIVESTOCK INVENTORIES BY SPECIFIC CLASS (2004–2026E) & ANNUAL DAIRY SERIES (2007–2024)",
        "Sources: OMAFA Livestock by County ctycattle/ctypigs/ctysheep (S6) & Dairy Farmers of Ontario producers/shipment (S7)",
        max_col=12,
    )

    # Table 5A: Annual Dairy Herd & Milk Shipments (2007–2024)
    r = write_section_bar(ws5, r, "TABLE 5A — HURON COUNTY ANNUAL LICENSED DAIRY PRODUCERS, MILK SHIPMENTS & COWS PER PRODUCER (2007–2024, SOURCES S6 & S7)", 9)
    r = write_headers(
        ws5,
        r,
        ["Year", "Licensed Milk Producers (DFO)", "Annual Milk Shipments (kL)", "Avg Milk Shipped / Producer (kL/farm)", "July Dairy Cows (head)", "July Dairy Heifers >1 yr (head)", "Implied Dairy Cows / Producer", "Log10(Milk Shipped kL/farm)", "Log10(Dairy Cows/Producer)"],
        left_cols=(),
    )
    for idx, yr in enumerate(sorted(dfo_prods.keys())):
        pr_cnt = dfo_prods[yr]
        sh_kl = dfo_ships.get(yr)
        kl_per_p = safe_div(sh_kl, pr_cnt, 1)
        dcows = ann_cattle.get(yr, {}).get("dairy_cows")
        dheif = ann_cattle.get(yr, {}).get("dairy_heifers")
        cows_per_p = safe_div(dcows, pr_cnt, 1)

        add_tidy("Annual Dairy Sector", "Dairy (DFO + OMAFA)", "Licensed Milk Producers", "herds", "Annual", yr, pr_cnt, "S7")
        add_tidy("Annual Dairy Sector", "Dairy (DFO + OMAFA)", "Annual Milk Shipments", "kilolitres", "Annual", yr, sh_kl, "S7")
        add_tidy("Annual Dairy Sector", "Dairy (DFO + OMAFA)", "Milk Shipped per Producer", "kL/herd", "Annual", yr, kl_per_p, "S7")
        add_tidy("Annual Dairy Sector", "Dairy (DFO + OMAFA)", "Implied Dairy Cows per Producer", "cows/herd", "Annual", yr, cows_per_p, "S6+S7")

        r = write_row(
            ws5,
            r,
            [yr, pr_cnt, sh_kl, kl_per_p, round(dcows) if dcows else None, round(dheif) if dheif else None, cows_per_p, safe_log10(kl_per_p), safe_log10(cows_per_p)],
            fmts=["0", "#,##0", "#,##0", "#,##0.0", "#,##0", "#,##0", "#,##0.0", "0.0000", "0.0000"],
            left_cols=(),
            zebra=(idx % 2 == 1),
        )

    # Table 5B: Annual Cattle Inventory by All 8 Specific Classes (2004–2026E)
    r += 1
    r = write_section_bar(ws5, r, "TABLE 5B — HURON COUNTY ANNUAL JULY CATTLE INVENTORY BROKEN OUT ACROSS ALL 8 SPECIFIC CLASSES (2004–2026E, HEAD, SOURCE S6)", 12)
    r = write_headers(
        ws5,
        r,
        ["Year (July 1)", "Dairy Cows", "Dairy Heifers (>1 yr)", "Beef Cows", "Beef Breeding Heifers (>1 yr)", "Beef Slaughter Heifers (>1 yr)", "Steers (>1 yr)", "Calves (<1 yr)", "Bulls (>1 yr)", "Total Cattle & Calves", "Log10(Total Cattle)", "Notes"],
        left_cols=(12,),
    )
    for idx, yr in enumerate(sorted(ann_cattle.keys())):
        cm = ann_cattle[yr]
        dc = round(cm["dairy_cows"]) if cm.get("dairy_cows") is not None else None
        dh = round(cm["dairy_heifers"]) if cm.get("dairy_heifers") is not None else None
        bc = round(cm["beef_cows"]) if cm.get("beef_cows") is not None else None
        bbh = round(cm["beef_heifers_breeding"]) if cm.get("beef_heifers_breeding") is not None else None
        bsh = round(cm["beef_heifers_slaughter"]) if cm.get("beef_heifers_slaughter") is not None else None
        st = round(cm["steers"]) if cm.get("steers") is not None else None
        cal = round(cm["calves"]) if cm.get("calves") is not None else None
        bul = round(cm["bulls"]) if cm.get("bulls") is not None else None
        tot = round(cm["total_cattle"]) if cm.get("total_cattle") is not None else None
        note_c = ""
        if yr in (2008, 2009):
            bc = round(cm["beef_cows_and_breeding_combined"]) if cm.get("beef_cows_and_breeding_combined") else None
            st = round(cm["steers_and_slaughter_combined"]) if cm.get("steers_and_slaughter_combined") else None
            note_c = "2008–09 combined Beef Cows+Breeding Heifers & Steers+Slaughter Heifers"

        for cname, cval in [("Dairy Cows", dc), ("Dairy Heifers", dh), ("Beef Cows", bc if yr not in (2008, 2009) else None), ("Beef Slaughter Heifers", bsh), ("Steers", st if yr not in (2008, 2009) else None), ("Calves", cal), ("Total Cattle & Calves", tot)]:
            add_tidy("Annual Cattle Inventory", cname, "July 1 Inventory", "head", "Annual", yr, cval, "S6")

        r = write_row(
            ws5,
            r,
            [yr, dc, dh, bc, bbh, bsh, st, cal, bul, tot, safe_log10(tot), note_c],
            fmts=["0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "0.0000", None],
            left_cols=(12,),
            zebra=(idx % 2 == 1),
        )

    # Table 5C: Annual Pig / Hog Inventory by Class (2004–2026E)
    r += 1
    r = write_section_bar(ws5, r, "TABLE 5C — HURON COUNTY ANNUAL JULY PIG / HOG INVENTORY BY SPECIFIC CLASS (2004–2026E, HEAD, SOURCE S6)", 10)
    r = write_headers(
        ws5,
        r,
        ["Year (July 1)", "Sows & Bred Gilts", "Boars", "All Market, Feeder & Nursing Pigs", "Light / Nursing Class", "Mid / Weaner Class", "Heavy / Grower-Finisher Class", "Total Pigs", "Log10(Total Pigs)", "Sub-Class Weight Regime"],
        left_cols=(10,),
    )
    for idx, yr in enumerate(sorted(ann_pigs.keys())):
        pm = ann_pigs[yr]
        sows_v = round(pm["sows"]) if pm.get("sows") is not None else None
        boars_v = round(pm["boars"]) if pm.get("boars") is not None else None
        non_b = round(pm["all_non_breeding_pigs"]) if pm.get("all_non_breeding_pigs") is not None else None
        lp = round(pm["light_pigs"]) if pm.get("light_pigs") is not None else None
        mp = round(pm["mid_pigs"]) if pm.get("mid_pigs") is not None else None
        hp = round(pm["heavy_pigs"]) if pm.get("heavy_pigs") is not None else None
        tp = round(pm["total_pigs"]) if pm.get("total_pigs") is not None else None

        for pname, pval in [("Sows & Bred Gilts", sows_v), ("All Market/Feeder/Nursing Pigs", non_b), ("Total Pigs", tp)]:
            add_tidy("Annual Hog Inventory", pname, "July 1 Inventory", "head", "Annual", yr, pval, "S6")

        r = write_row(
            ws5,
            r,
            [yr, sows_v, boars_v, non_b, lp, mp, hp, tp, safe_log10(tp), pm.get("weight_regime", "")],
            fmts=["0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "0.0000", None],
            left_cols=(10,),
            zebra=(idx % 2 == 1),
        )

    # Table 5D: Annual Sheep & Lamb Inventory by Class (2004–2026E)
    r += 1
    r = write_section_bar(ws5, r, "TABLE 5D — HURON COUNTY ANNUAL JULY SHEEP & LAMB INVENTORY BY SPECIFIC CLASS (2004–2026E, HEAD, SOURCE S6)", 8)
    r = write_headers(ws5, r, ["Year (July 1)", "Rams", "Ewes", "Replacement Lambs", "Market Lambs", "Total Lambs", "Total Sheep & Lambs", "Log10(Total Sheep & Lambs)"], left_cols=())
    for idx, yr in enumerate(sorted(ann_sheep.keys())):
        sm = ann_sheep[yr]
        rm_v = round(sm["rams"]) if sm.get("rams") is not None else None
        ew_v = round(sm["ewes"]) if sm.get("ewes") is not None else None
        rl_v = round(sm["replacement_lambs"]) if sm.get("replacement_lambs") is not None else None
        ml_v = round(sm["market_lambs"]) if sm.get("market_lambs") is not None else None
        tl_v = round(sm["total_lambs"]) if sm.get("total_lambs") is not None else None
        ts_v = round(sm["total_sheep_lambs"]) if sm.get("total_sheep_lambs") is not None else None

        add_tidy("Annual Sheep Inventory", "Total Sheep & Lambs", "July 1 Inventory", "head", "Annual", yr, ts_v, "S6")
        add_tidy("Annual Sheep Inventory", "Ewes", "July 1 Inventory", "head", "Annual", yr, ew_v, "S6")

        r = write_row(
            ws5,
            r,
            [yr, rm_v, ew_v, rl_v, ml_v, tl_v, ts_v, safe_log10(ts_v)],
            fmts=["0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "0.0000"],
            left_cols=(),
            zebra=(idx % 2 == 1),
        )
    autofit(ws5, max_w=42)

    # =========================================================================
    # TAB 6: 6_Farm_Sizes_Land_1991_2021
    # =========================================================================
    ws6 = wb.create_sheet("6_Farm_Sizes_Land_1991_2021")
    r = style_banner(
        ws6,
        "HURON COUNTY FARM SIZES, LAND TENURE, FARMLAND VALUES & SIZE-CLASS DISTRIBUTIONS (1991–2021)",
        "Sources: StatCan / OMAFA cty30 & cty30a (S8), farmvalue_en.xlsx & ceag_and_mpac.xlsx (S9), and Census Size Brackets (S1 & S2)",
        max_col=12,
    )

    # Table 6A: 7-Census Farm Size, Land Value & Rental Rate Series (1991–2021)
    r = write_section_bar(ws6, r, "TABLE 6A — HURON COUNTY 7-CENSUS FARM SIZE, TENURE, FARMLAND MARKET VALUE & CASH RENTAL RATE (1991–2021, SOURCES S8 & S9)", 12)
    r = write_headers(
        ws6,
        r,
        [
            "Census Year",
            "Total Census Farms",
            "Total Census Farmland (ac)",
            "Average Farm Size (ac/farm)",
            "Land in Crops (ac)",
            "MPAC Assessed Farmland (ac)",
            "Rented / Leased Area (ac)",
            "% Farmland Rented",
            "Market Value Land & Bldgs ($/ac)",
            "Cash Rental Rate ($/ac)",
            "Log10(Avg Farm Size ac)",
            "Log10(Land Value $/ac)",
        ],
        left_cols=(),
    )
    for idx, yr in enumerate([1991, 1996, 2001, 2006, 2011, 2016, 2021]):
        fc = farms_91_21[yr]
        fa = acres_91_21[yr]
        avg_sz = safe_div(fa, fc, 1)
        crop_ac = aco_val("aco_r077_", yr) if yr >= 2006 else None
        mpac_ac = mpac_huron.get(yr, {}).get("Total MPAC Farmland")
        rent_ac = fv_summary["rented_acres"].get(yr)
        rent_pct = safe_div(rent_ac * 100.0 if rent_ac else None, fa, 1)
        lval = fv_summary["land_val_per_ac"].get(yr)
        rval = fv_summary["rent_per_ac"].get(yr)

        add_tidy("Farm Size & Land", "Huron County Farms", "Total Census Farms", "farms", "5-Yr Census", yr, fc, "S8")
        add_tidy("Farm Size & Land", "Huron County Farms", "Total Farmland Area", "acres", "5-Yr Census", yr, fa, "S8")
        add_tidy("Farm Size & Land", "Huron County Farms", "Average Farm Size", "acres/farm", "5-Yr Census", yr, avg_sz, "S8")
        add_tidy("Farm Size & Land", "Huron County Farmland", "Market Value of Land & Buildings per Acre", "dollars/acre", "5-Yr Census", yr, lval, "S9")
        add_tidy("Farm Size & Land", "Huron County Farmland", "Estimated Cash Rental Rate per Acre", "dollars/acre", "5-Yr Census", yr, rval, "S9")

        r = write_row(
            ws6,
            r,
            [yr, fc, fa, avg_sz, crop_ac, round(mpac_ac) if mpac_ac else None, rent_ac, rent_pct, lval, rval, safe_log10(avg_sz), safe_log10(lval)],
            fmts=["0", "#,##0", "#,##0", "#,##0.0", "#,##0", "#,##0", "#,##0", '0.0"%"', "$#,##0", "$#,##0.00", "0.0000", "0.0000"],
            left_cols=(),
            highlight=(yr == 2021),
            zebra=(idx % 2 == 1),
        )

    # Table 6B: Total Farm Area Size-Class Distribution (14 Brackets, 2006–2021)
    r += 1
    r = write_section_bar(ws6, r, "TABLE 6B — HURON COUNTY FARMS CLASSIFIED BY TOTAL FARM AREA SIZE BRACKET (2006–2021, SOURCES S1, S2 & S8)", 10)
    r = write_headers(ws6, r, ["Total Farm Area Size Bracket", "2006 Farms", "2011 Farms", "2016 Farms", "2021 Farms", "2006 Share (%)", "2021 Share (%)", "% Change (2006–2021)", "Bracket Midpoint (ac)", "Log10(Midpoint ac)"], left_cols=(1,))
    size_brackets = [
        ("aco_r049_", "Under 10 acres", 5.0),
        ("aco_r050_", "10 to 69 acres", 40.0),
        ("aco_r051_", "70 to 129 acres", 100.0),
        ("aco_r052_", "130 to 179 acres", 155.0),
        ("aco_r053_", "180 to 239 acres", 210.0),
        ("aco_r054_", "240 to 399 acres", 320.0),
        ("aco_r055_", "400 to 559 acres", 480.0),
        ("aco_r056_", "560 to 759 acres", 660.0),
        ("aco_r057_", "760 to 1,119 acres", 940.0),
        ("aco_r058_", "1,120 to 1,599 acres", 1360.0),
        ("aco_r059_", "1,600 to 2,239 acres", 1920.0),
        ("aco_r060_", "2,240 to 2,879 acres", 2560.0),
        ("aco_r061_", "2,880 to 3,519 acres", 3200.0),
        ("aco_r062_", "3,520 acres and over", 4200.0),
    ]
    for idx, (pfx, blbl, mid_ac) in enumerate(size_brackets):
        b06, b11, b16, b21 = aco_val(pfx, 2006), aco_val(pfx, 2011), aco_val(pfx, 2016), aco_val(pfx, 2021)
        s06 = safe_div(b06 * 100.0 if b06 is not None else None, farms_91_21[2006], 2)
        s21 = safe_div(b21 * 100.0 if b21 is not None else None, farms_91_21[2021], 2)
        r = write_row(
            ws6,
            r,
            [blbl, b06, b11, b16, b21, s06, s21, safe_pct_chg(b21, b06), mid_ac, safe_log10(mid_ac)],
            fmts=[None, "#,##0", "#,##0", "#,##0", "#,##0", '0.00"%"', '0.00"%"', '+0.0"%";-0.0"%";0.0"%"', "#,##0", "0.0000"],
            left_cols=(1,),
            zebra=(idx % 2 == 1),
        )

    # Table 6C: Cropland Area Size-Class Distribution (12 Brackets, 2006–2021)
    r += 1
    r = write_section_bar(ws6, r, "TABLE 6C — HURON COUNTY FARMS CLASSIFIED BY AREA IN CROPS & SUMMERFALLOW (2006–2021, SOURCES S1, S2 & S8)", 8)
    r = write_headers(ws6, r, ["Cropland Size Bracket", "2006 Farms", "2011 Farms", "2016 Farms", "2021 Farms", "% Change (2006–2021)", "Bracket Midpoint (ac)", "Log10(Midpoint ac)"], left_cols=(1,))
    crop_brackets = [
        ("aco_r064_", "Under 10 acres", 5.0),
        ("aco_r065_", "10 to 69 acres", 40.0),
        ("aco_r066_", "70 to 129 acres", 100.0),
        ("aco_r067_", "130 to 179 acres", 155.0),
        ("aco_r068_", "180 to 239 acres", 210.0),
        ("aco_r069_", "240 to 399 acres", 320.0),
        ("aco_r070_", "400 to 559 acres", 480.0),
        ("aco_r071_", "560 to 759 acres", 660.0),
        ("aco_r072_", "760 to 1,119 acres", 940.0),
        ("aco_r073_", "1,120 to 1,999 acres", 1560.0),
        ("aco_r074_", "2,000 to 3,499 acres", 2750.0),
        ("aco_r075_", "3,500 acres and over", 4200.0),
    ]
    for idx, (pfx, blbl, mid_ac) in enumerate(crop_brackets):
        b06, b11, b16, b21 = aco_val(pfx, 2006), aco_val(pfx, 2011), aco_val(pfx, 2016), aco_val(pfx, 2021)
        r = write_row(
            ws6,
            r,
            [blbl, b06, b11, b16, b21, safe_pct_chg(b21, b06), mid_ac, safe_log10(mid_ac)],
            fmts=[None, "#,##0", "#,##0", "#,##0", "#,##0", '+0.0"%";-0.0"%";0.0"%"', "#,##0", "0.0000"],
            left_cols=(1,),
            zebra=(idx % 2 == 1),
        )

    # Table 6D: Farm Capital Size-Class Distribution (9 Brackets, 2006–2021)
    r += 1
    r = write_section_bar(ws6, r, "TABLE 6D — HURON COUNTY FARMS CLASSIFIED BY TOTAL FARM CAPITAL VALUE (2006–2021, SOURCES S1, S2 & S8)", 8)
    r = write_headers(ws6, r, ["Total Farm Capital Bracket", "2006 Farms", "2011 Farms", "2016 Farms", "2021 Farms", "2006 Share (%)", "2021 Share (%)", "% Change (2006–2021)"], left_cols=(1,))
    cap_brackets = [
        ("aco_r462_", "Under $100,000"),
        ("aco_r463_", "$100,000 to $199,999"),
        ("aco_r464_", "$200,000 to $349,999"),
        ("aco_r465_", "$350,000 to $499,999"),
        ("aco_r466_", "$500,000 to $999,999"),
        ("aco_r467_", "$1,000,000 to $1,499,999"),
        ("aco_r468_", "$1,500,000 to $1,999,999"),
        ("aco_r469_", "$2,000,000 to $3,499,999"),
        ("aco_r470_", "$3,500,000 and over"),
    ]
    for idx, (pfx, blbl) in enumerate(cap_brackets):
        b06, b11, b16, b21 = aco_val(pfx, 2006), aco_val(pfx, 2011), aco_val(pfx, 2016), aco_val(pfx, 2021)
        s06 = safe_div(b06 * 100.0 if b06 is not None else None, farms_91_21[2006], 2)
        s21 = safe_div(b21 * 100.0 if b21 is not None else None, farms_91_21[2021], 2)
        r = write_row(
            ws6,
            r,
            [blbl, b06, b11, b16, b21, s06, s21, safe_pct_chg(b21, b06)],
            fmts=[None, "#,##0", "#,##0", "#,##0", "#,##0", '0.00"%"', '0.00"%"', '+0.0"%";-0.0"%";0.0"%"'],
            left_cols=(1,),
            zebra=(idx % 2 == 1),
        )
    autofit(ws6, max_w=42)

    # =========================================================================
    # TAB 7: 7_Huron_Townships_1991_2024
    # =========================================================================
    ws7 = wb.create_sheet("7_Huron_Townships_1991_2024")
    r = style_banner(
        ws7,
        "HURON COUNTY TOWNSHIPS SIDE-BY-SIDE — FARM SIZES, FARM INCOMES, LAND VALUES & FARMLAND PROPERTY TAXES",
        "Covers All 8 Lower-Tier Municipalities in Huron County (Sources S1, S3, S9 & S10)",
        max_col=14,
    )
    r = write_headers(
        ws7,
        r,
        [
            "Township / Municipality",
            "CCS Code",
            "Farms (2021)",
            "Farmland Acres (2021)",
            "Avg Farm Size (ac, 2021)",
            "Cropland Acres (2021)",
            "Gross Receipts ($, 2020)",
            "Operating Expenses ($, 2020)",
            "Avg Net Operating Income / Farm 2001 ($)",
            "Avg Net Operating Income / Farm 2011 ($)",
            "Avg Net Operating Income / Farm 2021 ($)",
            "Est. Land & Bldg Value ($/ac, 2021)",
            "% Farmland Rented (2021)",
            "2024 FIR Farmland Property Tax ($)",
        ],
        left_cols=(1, 2),
    )
    for idx, t in enumerate(huron_prof["townships"]):
        tnm = t["name"]
        tl = tnm.lower()
        avg_sz_t = safe_div(t["farmlandAcres2021"], t["farms2021"], 1)
        noi_map_t = twp_noi.get(tl, {})
        fv_t = fv_twp21.get(tl, {})
        r = write_row(
            ws7,
            r,
            [
                tnm,
                t["code"],
                t["farms2021"],
                t["farmlandAcres2021"],
                avg_sz_t,
                t["croplandAcres2021"],
                t["grossReceipts2020"],
                t["operatingExpenses2020"],
                round(noi_map_t[2001]) if noi_map_t.get(2001) is not None else None,
                round(noi_map_t[2011]) if noi_map_t.get(2011) is not None else None,
                round(noi_map_t[2021]) if noi_map_t.get(2021) is not None else None,
                round(fv_t["est_val_per_acre"]) if fv_t.get("est_val_per_acre") is not None else None,
                fv_t.get("rented_share_pct"),
                t["farmlandTax2024"],
            ],
            fmts=[None, None, "#,##0", "#,##0", "#,##0.0", "#,##0", "$#,##0", "$#,##0", "$#,##0", "$#,##0", "$#,##0", "$#,##0", '0.0"%"', "$#,##0"],
            left_cols=(1, 2),
            zebra=(idx % 2 == 1),
        )
    autofit(ws7, max_w=36)

    # =========================================================================
    # TAB 8: 8_Log_Analysis_Tidy_Series
    # =========================================================================
    ws8 = wb.create_sheet("8_Log_Analysis_Tidy_Series")
    r = style_banner(
        ws8,
        "LOG-READY FLAT TIME-SERIES DATASET — HURON COUNTY (1991–2026)",
        "Machine-Readable Long Table with Pre-Computed Log10(x) and Natural Log Ln(x) for Direct Plotting & Regression",
        max_col=10,
    )
    r = write_headers(
        ws8,
        r,
        ["Domain / Category", "Commodity or Series", "Metric", "Unit", "Frequency", "Year", "Raw Empirical Value", "Log10(Value)", "Natural Log Ln(Value)", "Source Code"],
        left_cols=(1, 2, 3, 4, 5, 10),
    )
    for idx, tr in enumerate(tidy_log_rows):
        r = write_row(
            ws8,
            r,
            tr,
            fmts=[None, None, None, None, None, "0", "#,##0.##", "0.0000", "0.0000", None],
            left_cols=(1, 2, 3, 4, 5, 10),
            zebra=(idx % 2 == 1),
        )
    autofit(ws8, max_w=42)

    out_pub = OUT_DIR / WORKBOOK_NAME
    out_root = PROJECT_DIR / WORKBOOK_NAME
    wb.save(out_pub)
    shutil.copy2(out_pub, out_root)
    print(f"Saved ready-to-send Huron workbook:\n  1) {out_root} ({out_root.stat().st_size / 1024:.1f} KB)\n  2) {out_pub} (tidy log rows={len(tidy_log_rows):,})")


if __name__ == "__main__":
    main()
