"""15_generate_ofa_county_profiles_2_0.py — Generate all 65 OFA County & Zone Profile 2.0 Workbooks (.xlsx).

Reads `public/data/ofa_county_profiles_2_0.json` and builds:
  - 49 Ontario County / District (CD) workbooks
  - 15 OFA Zone workbooks
  - 1 Province of Ontario workbook
  - 1 Master ZIP bundle (`OFA_County_and_Zone_Profiles_2_0_All_65_Workbooks.zip`)
in `public/downloads/county_profiles_2_0/`.
"""
from __future__ import annotations

import json
import zipfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

PROJECT_DIR = Path(__file__).resolve().parent.parent
MASTER_JSON = PROJECT_DIR / "public" / "data" / "ofa_county_profiles_2_0.json"
OUT_DIR = PROJECT_DIR / "public" / "downloads" / "county_profiles_2_0"

# OFA Brand Palette
NAVY_HEADER_FILL = PatternFill("solid", fgColor="0F3D6E")
TEAL_SUBHEADER_FILL = PatternFill("solid", fgColor="1E6B5E")
SLATE_TH_FILL = PatternFill("solid", fgColor="E2E8F0")
ZEBRA_FILL = PatternFill("solid", fgColor="F8FAFC")
ROLLUP_FILL = PatternFill("solid", fgColor="EFF6FF")
WARN_FILL = PatternFill("solid", fgColor="FEF3C7")

WHITE_BOLD = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
TITLE_FONT = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
TH_FONT = Font(name="Calibri", size=10, bold=True, color="0F172A")
BODY_FONT = Font(name="Calibri", size=10, bold=False, color="1E293B")
BOLD_FONT = Font(name="Calibri", size=10, bold=True, color="0F172A")
NOTE_FONT = Font(name="Calibri", size=9, italic=True, color="475569")
WARN_FONT = Font(name="Calibri", size=10, bold=True, color="92400E")

THIN_SIDE = Side(style="thin", color="CBD5E1")
CELL_BORDER = Border(left=THIN_SIDE, right=THIN_SIDE, top=THIN_SIDE, bottom=THIN_SIDE)


def style_banner(ws, title: str, subtitle: str, max_col: int = 8) -> int:
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max_col)
    c1 = ws.cell(row=1, column=1, value=title)
    c1.fill = NAVY_HEADER_FILL
    c1.font = TITLE_FONT
    c1.alignment = Alignment(vertical="center", horizontal="left", indent=1)
    ws.row_dimensions[1].height = 28

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max_col)
    c2 = ws.cell(row=2, column=1, value=subtitle)
    c2.fill = TEAL_SUBHEADER_FILL
    c2.font = WHITE_BOLD
    c2.alignment = Alignment(vertical="center", horizontal="left", indent=1)
    ws.row_dimensions[2].height = 20
    return 4


def write_table_header(ws, row_idx: int, headers: list[str]) -> int:
    for col_idx, h in enumerate(headers, start=1):
        c = ws.cell(row=row_idx, column=col_idx, value=h)
        c.fill = SLATE_TH_FILL
        c.font = TH_FONT
        c.border = CELL_BORDER
        c.alignment = Alignment(
            horizontal="left" if col_idx == 1 else "right",
            vertical="center",
            wrap_text=True,
        )
    ws.row_dimensions[row_idx].height = 24
    return row_idx + 1


def write_data_row(
    ws,
    row_idx: int,
    values: list[Any],
    num_formats: list[str | None] | None = None,
    is_bold: bool = False,
    is_zebra: bool = False,
) -> int:
    fill = ROLLUP_FILL if is_bold else (ZEBRA_FILL if is_zebra else None)
    font = BOLD_FONT if is_bold else BODY_FONT
    for col_idx, val in enumerate(values, start=1):
        c = ws.cell(row=row_idx, column=col_idx, value=val if val is not None else "—")
        if fill:
            c.fill = fill
        c.font = font
        c.border = CELL_BORDER
        if col_idx == 1:
            c.alignment = Alignment(horizontal="left", vertical="center")
        else:
            c.alignment = Alignment(horizontal="right", vertical="center")
            if isinstance(val, (int, float)) and num_formats and col_idx - 1 < len(num_formats):
                fmt = num_formats[col_idx - 1]
                if fmt:
                    c.number_format = fmt
    ws.row_dimensions[row_idx].height = 19
    return row_idx + 1


def auto_fit_columns(ws, max_width: int = 46) -> None:
    for col in ws.columns:
        col_letter = get_column_letter(col[0].column)
        longest = 10
        for cell in col[:80]:
            if cell.row in (1, 2):
                continue
            v = str(cell.value or "")
            if len(v) > longest:
                longest = len(v)
        ws.column_dimensions[col_letter].width = min(max(longest + 3, 12), max_width)


def build_single_workbook(args: tuple[dict[str, Any], str]) -> tuple[str, int]:
    p, out_dir_str = args
    out_dir = Path(out_dir_str)
    wb = Workbook()
    es = p["executiveSummary"]
    title_prefix = f"OFA PROFILE 2.0 — {p['name'].upper()}"
    sub_prefix = f"Federation(s): {', '.join(p.get('federations', []))} | OFA Zone: {p.get('zoneName', '')}"

    # =========================================================================
    # TAB 1: 1_Executive_Summary
    # =========================================================================
    ws1 = wb.active
    ws1.title = "1_Executive_Summary"
    ws1.views.sheetView[0].showGridLines = True
    r = style_banner(ws1, f"{title_prefix} — EXECUTIVE SUMMARY", sub_prefix, max_col=6)

    if p.get("footnote"):
        ws1.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
        fn_cell = ws1.cell(row=r, column=1, value=f"OFA Zone & Boundary Note: {p['footnote']}")
        fn_cell.fill = WARN_FILL
        fn_cell.font = WARN_FONT
        ws1.row_dimensions[r].height = 22
        r += 2

    r = write_table_header(
        ws1,
        r,
        ["Key Performance Indicator", "Latest Value", "Prior / Comparison", "% Change / Share", "Provincial / Zone Rank", "Primary Empirical Source"],
    )
    rank_label = f"of {es['farmsRankOutOf']}" if es.get("farmsRankOutOf") else "—"
    kpi_rows = [
        ("Total Census Farms (2021)", es.get("farms2021"), es.get("farms2016"), es.get("farmsChangePct"), f"#{es['farmsRank']} {rank_label}" if es.get("farmsRank") else "—", "StatCan 2021 Census of Agriculture (32-10-0231-01)", "#,##0", "#,##0", "0.0\"%\""),
        ("Share of Ontario Census Farms (%)", es.get("farmsOntSharePct"), None, None, None, "StatCan 2021 Census of Agriculture", "0.00\"%\"", None, None),
        ("Total Farmland Area (Acres, 2021)", es.get("farmlandAcres2021"), es.get("farmlandAcres2016"), es.get("farmlandChangePct"), None, "StatCan 2021 Census of Agriculture", "#,##0", "#,##0", "0.0\"%\""),
        ("Total Area in Crops (Acres, 2021)", es.get("croplandAcres2021"), None, es.get("croplandShareOfFarmlandPct"), None, "StatCan 2021 Census of Agriculture (% of Farmland)", "#,##0", None, "0.0\"%\""),
        ("Average Farm Size (Acres, 2021)", es.get("avgFarmSizeAcres2021"), None, es.get("ownedSharePct2021"), None, "StatCan 2021 Census (% Owned Land in Col 4)", "#,##0.0", None, "0.0\"%\""),
        ("Census Gross Farm Receipts ($, 2020)", es.get("censusGrossReceipts2020"), es.get("censusGrossReceipts2015"), es.get("censusReceiptsChangePct"), f"#{es['censusReceiptsRank']} {rank_label}" if es.get("censusReceiptsRank") else "—", "StatCan 2021 Census of Agriculture (32-10-0240-01)", "$#,##0", "$#,##0", "0.0\"%\""),
        ("Census Total Operating Expenses ($, 2020)", es.get("censusOperatingExpenses2020"), es.get("censusOperatingExpenses2015"), es.get("censusExpenseToRevenueRatioPct"), None, "StatCan 2021 Census (Expense-to-Revenue % in Col 4)", "$#,##0", "$#,##0", "0.0\"%\""),
        ("Census Net Cash Farm Income ($, 2020)", es.get("censusNetCashIncome2020"), None, es.get("censusNetMarginPct2020"), None, "StatCan 2021 Census (Net Margin % in Col 4)", "$#,##0", None, "0.0\"%\""),
        ("OMAFA Annual Farm Cash Receipts ($, 2024 Est.)", es.get("omafaFcr2024"), es.get("omafaFcr2021"), es.get("omafaFcrOntSharePct2024"), f"#{es['omafaFcrRank2024']} {rank_label}" if es.get("omafaFcrRank2024") else "—", "OMAFA County Farm Cash Receipts (2024 Ont Share % in Col 4)", "$#,##0", "$#,##0", "0.00\"%\""),
        ("OMAFA Annual Farm Cash Receipts ($, 2025 Prelim.)", es.get("omafaFcr2025"), es.get("omafaFcr2024"), None, None, "OMAFA County Farm Cash Receipts (fcrcty_en.xlsx)", "$#,##0", "$#,##0", None),
        ("Total Farm Capital Value ($, 2021)", es.get("totalFarmCapital2021"), es.get("totalFarmCapital2016"), es.get("capitalPerAcre2021"), None, "StatCan 2021 Census ($/Acre in Col 4)", "$#,##0", "$#,##0", "$#,##0"),
        ("Total Farm Operators & Avg Age (2021)", es.get("totalOperators2021"), es.get("avgOperatorAge2021"), es.get("operatorsUnder35Pct2021"), None, "StatCan 2021 Census (Avg Age in Col 3, % <35 in Col 4)", "#,##0", "0.0", "0.0\"%\""),
        ("Farms with Written Succession Plan (2021)", es.get("writtenSuccessionPlanFarms2021"), None, es.get("writtenSuccessionPlanPct2021"), None, "StatCan 2021 Census of Agriculture", "#,##0", None, "0.0\"%\""),
        ("Farms Selling Directly to Consumers (2021)", es.get("directSalesFarms2021"), None, es.get("directSalesPct2021"), None, "StatCan 2021 Census of Agriculture", "#,##0", None, "0.0\"%\""),
        ("Farms with Renewable Energy Systems (2021)", es.get("renewableEnergyFarms2021"), None, es.get("renewableEnergyPct2021"), None, "StatCan Table 32-10-0380-01 (Unscrambled)", "#,##0", None, "0.0\"%\""),
        ("Agri-Food Business Locations (Dec 2023)", es.get("agrifoodBizLocations2023"), es.get("primaryAgBizLocations2023"), es.get("foodBevMfgBizLocations2023"), None, "StatCan Canadian Business Counts (Col 3=Primary Ag, Col 4=Food Mfg)", "#,##0", "#,##0", "#,##0"),
        ("Agri-Food Workforce — Place of Work / Day (2021)", es.get("agrifoodJobsDay2021"), es.get("agrifoodJobsNight2021"), es.get("agrifoodShareOfDayJobsPct2021"), None, "StatCan Census of Population (Col 3=Night Resident Workers, Col 4=% Day Jobs)", "#,##0", "#,##0", "0.0\"%\""),
        (f"Farmland Property Tax Levy ($, FIR {es.get('firYear', 2024)})", es.get("farmlandTotalTaxDollars"), es.get("farmlandCvaDollars"), es.get("farmlandShareOfTotalTaxPct"), None, "MMAH FIR Schedule 26A (Col 3=Farmland CVA $, Col 4=% of Total Levy)", "$#,##0", "$#,##0", "0.00\"%\""),
        ("CLI Class 1–3 Prime Agricultural Soil (Acres)", es.get("primeSoilClass1To3Acres"), es.get("greenbeltAcres"), es.get("primeSoilSharePct"), None, "LIO Soil Survey Complex & Greenbelt (Col 3=Greenbelt Acres, Col 4=% Prime)", "#,##0", "#,##0", "0.0\"%\""),
        ("Rural Broadband 50/10 Mbps Coverage (% Households)", es.get("broadband50_10Pct"), es.get("broadbandWired50_10Pct"), es.get("broadbandUnderservedHouseholds"), None, "ISED National Broadband Data (Col 3=Wired 50/10 %, Col 4=Underserved HHs)", "0.0\"%\"", "0.0\"%\"", "#,##0"),
    ]
    for idx, (lbl, v1, v2, v3, rnk, src, f1, f2, f3) in enumerate(kpi_rows):
        r = write_data_row(
            ws1,
            r,
            [lbl, v1, v2, v3, rnk, src],
            num_formats=[None, f1, f2, f3, None, None],
            is_bold=idx in (0, 5, 8, 15, 17),
            is_zebra=(idx % 2 == 1),
        )

    r += 1
    r = write_table_header(
        ws1,
        r,
        ["Top Commodities by 2024 OMAFA Farm Cash Receipts", "2021 ($)", "2023 ($)", "2024 ($)", "% of Local FCR (2024)", "% of Ontario Commodity Total"],
    )
    for idx, c in enumerate(es.get("topCommoditiesFcr2024", [])):
        r = write_data_row(
            ws1,
            r,
            [c["label"], c["val2021"], c["val2023"], c["val2024"], c["shareOfGeo2024Pct"], c["ontShare2024Pct"]],
            num_formats=[None, "$#,##0", "$#,##0", "$#,##0", "0.0\"%\"", "0.00\"%\""],
            is_zebra=(idx % 2 == 1),
        )
    auto_fit_columns(ws1)

    # =========================================================================
    # TAB 2: 2_Townships_Side_by_Side
    # =========================================================================
    ws2 = wb.create_sheet("2_Townships_Side_by_Side")
    r = style_banner(ws2, f"{title_prefix} — TOWNSHIPS / MUNICIPALITIES SIDE-BY-SIDE", "2021 Census of Agriculture, 2024 MMAH FIR Farmland Tax, ISED 50/10 Broadband & 2023 Agri-Food Businesses", max_col=15)
    r = write_table_header(
        ws2,
        r,
        [
            "Township / Municipality (CCS/CSD)",
            "Code",
            "OFA Zone",
            "Farms (2021)",
            "Farms % Chg (16–21)",
            "Farmland Acres (2021)",
            "Cropland Acres (2021)",
            "Gross Farm Receipts ($, 2020)",
            "Operating Expenses ($, 2020)",
            "Net Margin (%)",
            "Avg Operator Age",
            "Written Succession (%)",
            "Farmland Property Tax ($, 2024)",
            "50/10 Broadband (%)",
            "Agri-Food Businesses (2023)",
        ],
    )
    for idx, t in enumerate(p.get("townships", [])):
        r = write_data_row(
            ws2,
            r,
            [
                t["name"],
                t["code"],
                t["zoneId"],
                t["farms2021"],
                t["farmsChangePct"],
                t["farmlandAcres2021"],
                t["croplandAcres2021"],
                t["grossReceipts2020"],
                t["operatingExpenses2020"],
                t["netMarginPct2020"],
                t["avgOperatorAge2021"],
                t["successionPct2021"],
                t["farmlandTax2024"],
                t["broadband50_10Pct"],
                t["agrifoodBiz2023"],
            ],
            num_formats=[
                None, None, None, "#,##0", "0.0\"%\"", "#,##0", "#,##0",
                "$#,##0", "$#,##0", "0.0\"%\"", "0.0", "0.0\"%\"", "$#,##0", "0.0\"%\"", "#,##0",
            ],
            is_zebra=(idx % 2 == 1),
        )
    auto_fit_columns(ws2)

    # =========================================================================
    # TAB 3: 3_Ag_Census_2006_2021
    # =========================================================================
    ws3 = wb.create_sheet("3_Ag_Census_2006_2021")
    r = style_banner(ws3, f"{title_prefix} — HISTORICAL CENSUS OF AGRICULTURE (2006–2021)", "Zero Formula Errors • Verified Multi-Census Series • Includes Unscrambled StatCan 32-10-0380-01 Renewable Energy", max_col=9)
    r = write_table_header(
        ws3,
        r,
        ["Indicator", "Unit", "2006", "2011", "2016", "2021", "% Change (2016–2021)", "% Change (2006–2021)", "% of Ontario (2021)"],
    )
    for idx, row_item in enumerate(p.get("agCensusOverTime", [])):
        v06 = row_item["v2006"] if row_item["v2006"] is not None else (row_item["f2006"] or "—")
        v11 = row_item["v2011"] if row_item["v2011"] is not None else (row_item["f2011"] or "—")
        v16 = row_item["v2016"] if row_item["v2016"] is not None else (row_item["f2016"] or "—")
        v21 = row_item["v2021"] if row_item["v2021"] is not None else (row_item["f2021"] or "—")
        num_fmt = "$#,##0" if row_item["uom"] == "dollars" else ("0.0" if row_item["uom"] == "years" else "#,##0")
        r = write_data_row(
            ws3,
            r,
            [
                row_item["label"],
                row_item["uom"],
                v06,
                v11,
                v16,
                v21,
                row_item["chg16To21Pct"],
                row_item["chg06To21Pct"],
                row_item["ontShare2021Pct"],
            ],
            num_formats=[None, None, num_fmt, num_fmt, num_fmt, num_fmt, "0.0\"%\"", "0.0\"%\"", "0.00\"%\""],
            is_zebra=(idx % 2 == 1),
        )
    auto_fit_columns(ws3)

    # =========================================================================
    # TAB 4: 4_Farm_Cash_Receipts
    # =========================================================================
    ws4 = wb.create_sheet("4_Farm_Cash_Receipts")
    r = style_banner(
        ws4,
        f"{title_prefix} — FARM CASH RECEIPTS BY COMMODITY (2018–2025)",
        "Source: OMAFA County Farm Cash Receipts (fcrcty_en.xlsx, allocated from StatCan Provincial FCR) + StatCan Census Gross Farm Receipts",
        max_col=11,
    )
    r = write_table_header(
        ws4,
        r,
        ["Commodity / Revenue Metric", "2018 ($)", "2019 ($)", "2020 ($)", "2021 ($)", "2022 ($)", "2023 ($)", "2024 ($)", "2025 Prelim ($)", "% of Local FCR (2024)", "% of Ontario (2024)"],
    )
    # First row: Census Gross Farm Receipts benchmark
    r = write_data_row(
        ws4,
        r,
        [
            "StatCan Census Gross Farm Receipts (2015 in '18 col / 2020 in '20 col)",
            es.get("censusGrossReceipts2015"),
            None,
            es.get("censusGrossReceipts2020"),
            None,
            None,
            None,
            None,
            None,
            None,
            es.get("censusReceiptsOntSharePct"),
        ],
        num_formats=[None, "$#,##0", None, "$#,##0", None, None, None, None, None, None, "0.00\"%\""],
        is_bold=True,
    )
    for idx, c in enumerate(p.get("fcrCommodities", [])):
        s = c.get("series", {})
        r = write_data_row(
            ws4,
            r,
            [
                c["label"],
                s.get("2018"),
                s.get("2019"),
                s.get("2020"),
                s.get("2021"),
                s.get("2022"),
                s.get("2023"),
                s.get("2024"),
                s.get("2025"),
                c.get("shareOfGeo2024Pct"),
                c.get("ontShare2024Pct"),
            ],
            num_formats=[None, "$#,##0", "$#,##0", "$#,##0", "$#,##0", "$#,##0", "$#,##0", "$#,##0", "$#,##0", "0.0\"%\"", "0.00\"%\""],
            is_bold=c.get("isTotal", False),
            is_zebra=(idx % 2 == 1),
        )
    auto_fit_columns(ws4)

    # =========================================================================
    # TAB 5: 5_Crop_Yields_Production
    # =========================================================================
    ws5 = wb.create_sheet("5_Crop_Yields_Production")
    r = style_banner(
        ws5,
        f"{title_prefix} — FIELD CROP AREA, YIELD & PRODUCTION",
        "Source: OMAFA County Field Crop Series (2011–2025, 12 Major Field Crops)",
        max_col=9,
    )
    r = write_table_header(
        ws5,
        r,
        ["Field Crop", "Latest Year", "Seeded Area (Acres)", "Harvested Area (Acres)", "Latest Yield", "5-Yr Avg Yield", "Yield Unit", "Production (Metric Tonnes)", "% of Ontario Production"],
    )
    for idx, cr in enumerate(p.get("fieldCrops", [])):
        r = write_data_row(
            ws5,
            r,
            [
                cr["cropName"],
                cr["latestYear"],
                cr["seededAcres"],
                cr["harvestedAcres"],
                cr["yield"],
                cr["yield5YrAvg"],
                cr["yieldUom"],
                cr["productionTonnes"],
                cr["ontProductionSharePct"],
            ],
            num_formats=[None, "0", "#,##0", "#,##0", "0.0", "0.0", None, "#,##0", "0.00\"%\""],
            is_zebra=(idx % 2 == 1),
        )
    auto_fit_columns(ws5)

    # =========================================================================
    # TAB 6: 6_AgriFood_Biz_Workforce
    # =========================================================================
    ws6 = wb.create_sheet("6_AgriFood_Biz_Workforce")
    r = style_banner(
        ws6,
        f"{title_prefix} — AGRI-FOOD BUSINESS COUNTS (2016–2023) & DAY/NIGHT WORKFORCE",
        "Repaired StatCan Canadian Business Counts (Huron/Peel/Hamilton/Halton/Peterborough row-shifts fixed) + Census Place-of-Work vs. Residence",
        max_col=8,
    )
    r = write_table_header(
        ws6,
        r,
        ["Agri-Food Industry (NAICS)", "Dec 2016 Total", "Dec 2021 Total", "Dec 2022 Total", "Dec 2023 Total", "Dec 2023 Without Employees", "Dec 2023 With Employees", "% Change (2016–2023)"],
    )
    for idx, b in enumerate(p.get("businessCounts", [])):
        r = write_data_row(
            ws6,
            r,
            [
                b["label"],
                b["net2016"],
                b["net2021"],
                b["net2022"],
                b["net2023"],
                b["withoutEmp2023"],
                b["withEmp2023"],
                b["change2016To2023Pct"],
            ],
            num_formats=[None, "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "0.0\"%\""],
            is_bold=b.get("isRollup", False),
            is_zebra=(idx % 2 == 1),
        )

    r += 2
    r = write_table_header(
        ws6,
        r,
        ["Agri-Food Workforce Sector (Census of Population)", "2016 Day (Place of Work)", "2016 Night (Resident Workers)", "2021 Day (Place of Work)", "2021 Night (Resident Workers)", "2021 Net Commuter Inflow (Day − Night)", "% Change in Day Jobs (16–21)", ""],
    )
    for idx, w in enumerate(p.get("workforceDayNight", [])):
        r = write_data_row(
            ws6,
            r,
            [
                w["label"],
                w["day2016"],
                w["night2016"],
                w["day2021"],
                w["night2021"],
                w["netInflow2021"],
                w["changeDayPct"],
                "",
            ],
            num_formats=[None, "#,##0", "#,##0", "#,##0", "#,##0", "+#,##0;-#,##0;0", "0.0\"%\"", None],
            is_bold=idx in (0, 1),
            is_zebra=(idx % 2 == 1),
        )
    auto_fit_columns(ws6)

    # =========================================================================
    # TAB 7: 7_Community_Tax_Land_Broadband
    # =========================================================================
    ws7 = wb.create_sheet("7_Community_Tax_Land_Broadband")
    r = style_banner(
        ws7,
        f"{title_prefix} — FARMLAND TAX, PRIME SOIL, GREENBELT & RURAL BROADBAND",
        "MMAH Municipal FIR Schedule 26A (2021–2024) • LIO Soil Survey Complex CLI Class 1–3 • Greenbelt • ISED 50/10 Mbps Broadband",
        max_col=5,
    )
    fir_h = p.get("firHistory", {})
    f21, f23, f24 = fir_h.get("2021", {}), fir_h.get("2023", {}), fir_h.get("2024", {})
    r = write_table_header(ws7, r, ["MMAH FIR Schedule 26A Farmland Tax & Assessment Metric", "2021", "2023", "2024", "Unit / Notes"])
    fir_table_rows = [
        ("Farmland Current Value Assessment (CVA)", f21.get("fir_farmland_cva"), f23.get("fir_farmland_cva"), f24.get("fir_farmland_cva"), "Dollars ($)", "$#,##0"),
        ("Total Municipal & Education CVA (All Classes)", f21.get("fir_total_cva"), f23.get("fir_total_cva"), f24.get("fir_total_cva"), "Dollars ($)", "$#,##0"),
        ("Farmland Share of Total Municipal CVA (%)", f21.get("fir_farmland_share_cva_pct"), f23.get("fir_farmland_share_cva_pct"), f24.get("fir_farmland_share_cva_pct"), "% of Total CVA", "0.00\"%\""),
        ("Farmland Total Property Tax Levy (Municipal + Education)", f21.get("fir_farmland_tax_total"), f23.get("fir_farmland_tax_total"), f24.get("fir_farmland_tax_total"), "Dollars ($)", "$#,##0"),
        ("  Lower / Single-Tier Municipal Farmland Tax", f21.get("fir_farmland_tax_lt"), f23.get("fir_farmland_tax_lt"), f24.get("fir_farmland_tax_lt"), "Dollars ($)", "$#,##0"),
        ("  Upper-Tier County / Region Farmland Tax", f21.get("fir_farmland_tax_ut"), f23.get("fir_farmland_tax_ut"), f24.get("fir_farmland_tax_ut"), "Dollars ($)", "$#,##0"),
        ("  Education Farmland Tax", f21.get("fir_farmland_tax_edu"), f23.get("fir_farmland_tax_edu"), f24.get("fir_farmland_tax_edu"), "Dollars ($)", "$#,##0"),
        ("Farmland Share of Total Property Tax Levy (%)", f21.get("fir_farmland_share_tax_pct"), f23.get("fir_farmland_share_tax_pct"), f24.get("fir_farmland_share_tax_pct"), "% of Total Tax Levy", "0.00\"%\""),
    ]
    for idx, (lbl, v21, v23, v24, note, fmt) in enumerate(fir_table_rows):
        r = write_data_row(ws7, r, [lbl, v21, v23, v24, note], num_formats=[None, fmt, fmt, fmt, None], is_bold=idx in (0, 3), is_zebra=(idx % 2 == 1))

    r += 2
    r = write_table_header(ws7, r, ["Soil Capability (CLI), Greenbelt, Broadband & Community Metric", "Value", "Unit", "Reference Vintage", "Source"])
    land_bb_rows = [
        ("Prime Agricultural Land — CLI Classes 1, 2 & 3 Combined", es.get("primeSoilClass1To3Acres"), "Acres", "LIO Soil Survey Complex", "OMAFRA / LIO", "#,##0"),
        ("  CLI Class 1 (No Significant Limitations)", es.get("cliClass1Acres"), "Acres", "LIO Soil Survey Complex", "OMAFRA / LIO", "#,##0"),
        ("  CLI Class 2 (Moderate Limitations)", es.get("cliClass2Acres"), "Acres", "LIO Soil Survey Complex", "OMAFRA / LIO", "#,##0"),
        ("  CLI Class 3 (Moderately Severe Limitations)", es.get("cliClass3Acres"), "Acres", "LIO Soil Survey Complex", "OMAFRA / LIO", "#,##0"),
        ("  CLI Classes 4–7 (Marginal / Non-Prime Mineral Soils)", es.get("cliClass4To7Acres"), "Acres", "LIO Soil Survey Complex", "OMAFRA / LIO", "#,##0"),
        ("  Organic Soils (Class O / Muck & Peat)", es.get("cliOrganicAcres"), "Acres", "LIO Soil Survey Complex", "OMAFRA / LIO", "#,##0"),
        ("Prime Class 1–3 Share of Surveyed Soil Area (%)", es.get("primeSoilSharePct"), "Percent (%)", "LIO Soil Survey Complex", "OMAFRA / LIO", "0.0\"%\""),
        ("Greenbelt Plan Area (Total Outer Boundary Intersection)", es.get("greenbeltAcres"), "Acres", "Current Consolidation", "MMAH / Land Information Ontario", "#,##0"),
        ("Greenbelt Specialty Crop Area (Niagara Peninsula & Holland Marsh)", es.get("greenbeltSpecialtyCropAcres"), "Acres", "Current Consolidation", "MMAH / Land Information Ontario", "#,##0"),
        ("Greenbelt Share of Total Land Area (%)", es.get("greenbeltShareLandPct"), "Percent (%)", "Current Consolidation", "MMAH / Land Information Ontario", "0.0\"%\""),
        ("ISED Evaluated Pseudo-Households (PHH)", es.get("broadbandEvaluatedHouseholds"), "Households", "2021 PHH / Latest NBD", "ISED National Broadband Data", "#,##0"),
        ("Broadband 50/10 Mbps Combined Availability (Wired + Fixed Wireless)", es.get("broadband50_10Pct"), "Percent (%)", "Latest Release", "ISED National Broadband Data", "0.0\"%\""),
        ("Broadband 50/10 Mbps Wired Availability", es.get("broadbandWired50_10Pct"), "Percent (%)", "Latest Release", "ISED National Broadband Data", "0.0\"%\""),
        ("Broadband 50/10 Mbps Including Funded Government Projects", es.get("broadbandWithGovProjects50_10Pct"), "Percent (%)", "Projected", "ISED National Broadband Data", "0.0\"%\""),
        ("Households Currently Below 50/10 Mbps Target", es.get("broadbandUnderservedHouseholds"), "Households", "Latest Release", "ISED National Broadband Data", "#,##0"),
        ("Mobile LTE Wireless Coverage (% of Households)", es.get("broadbandLteMobilePct"), "Percent (%)", "Latest Release", "ISED National Broadband Data", "0.0\"%\""),
        ("Census Population (2021)", es.get("population2021"), "Persons", "2021 Census", "Statistics Canada Census of Population", "#,##0"),
        ("Census Population (2016)", es.get("population2016"), "Persons", "2016 Census", "Statistics Canada Census of Population", "#,##0"),
        ("Average Total Household Income (2021 Census)", es.get("avgHouseholdIncome2021"), "Dollars ($)", "2021 Census (2020 Income)", "Statistics Canada Census of Population", "$#,##0"),
    ]
    for idx, (lbl, val, uom, vint, src, fmt) in enumerate(land_bb_rows):
        r = write_data_row(ws7, r, [lbl, val, uom, vint, src], num_formats=[None, fmt, None, None, None], is_bold=idx in (0, 7, 11, 16), is_zebra=(idx % 2 == 1))
    auto_fit_columns(ws7)

    # =========================================================================
    # TAB 8: 8_Local_Food_Spending_Est
    # =========================================================================
    ws8 = wb.create_sheet("8_Local_Food_Spending_Est")
    r = style_banner(
        ws8,
        f"{title_prefix} — LOCAL FOOD SELF-SUFFICIENCY & HOUSEHOLD SPENDING (ILLUSTRATIVE ESTIMATES)",
        "METHODOLOGY NOTE: Derived from Provincial Per-Capita Food Availability & Survey of Household Spending (SHS). Crop Acres and Livestock Head are kept strictly separate.",
        max_col=6,
    )
    lf = p.get("localFoodAndSpendingEst", {})
    r = write_table_header(
        ws8,
        r,
        ["Food Commodity", "Production Base Unit", "Est. Local Consumption (kg, 2021)", "Est. Required Production Base", "Actual 2021 Census Local Base", "Illustrative Self-Sufficiency (%)"],
    )
    for idx, item in enumerate(lf.get("localFoodSelfSufficiency2021", [])):
        actual_disp = item["actualLocalBase2021"] if item["actualLocalBase2021"] is not None else (item["localFlag"] or "x")
        r = write_data_row(
            ws8,
            r,
            [
                item["item"],
                item["unit"],
                item["estConsumptionKg2021"],
                item["requiredBase2021"],
                actual_disp,
                item["selfSufficiencyPct2021"],
            ],
            num_formats=[None, None, "#,##0", "#,##0.0", "#,##0.0", "0.0\"%\""],
            is_zebra=(idx % 2 == 1),
        )

    r += 2
    r = write_table_header(ws8, r, ["Estimated Per-Household Expenditure Category (Illustrative SHS Model)", "Estimated 2021 Dollars per Household ($/HH)", "", "", "", ""])
    for idx, h in enumerate(lf.get("householdFoodExp2021", [])):
        r = write_data_row(
            ws8,
            r,
            [h["label"], h["dollarsPerHousehold2021"], "", "", "", ""],
            num_formats=[None, "$#,##0.00", None, None, None, None],
            is_bold="Total" in h["label"] or "Income" in h["label"],
            is_zebra=(idx % 2 == 1),
        )
    auto_fit_columns(ws8)

    # =========================================================================
    # TAB 9: 9_Sources_and_Methodology
    # =========================================================================
    ws9 = wb.create_sheet("9_Sources_and_Methodology")
    r = style_banner(ws9, f"{title_prefix} — SOURCES, METHODOLOGY & DATA GOVERNANCE", "Ontario Federation of Agriculture (OFA) • AgCensus IQ Automated Pipeline (Zero-Error Build)", max_col=4)
    r = write_table_header(ws9, r, ["Dataset / Module", "Primary Publisher & Table", "Reference Vintage", "Methodology & Audit Notes"])
    notes_rows = [
        ("1. Census of Agriculture Core & Historical Series", "Statistics Canada Tables 32-10-0231-01 to 32-10-0380-01 & OMAFA Reconciled Series", "2006, 2011, 2016, 2021", "All 280,239 legacy spreadsheet formula errors removed and replaced with clean numeric calculations or explicit confidentiality flags ('x'). Renewable Energy rows (R597–R607) replaced directly from StatCan Table 32-10-0380-01."),
        ("2. County Farm Cash Receipts by Commodity", "OMAFA Open Data (fcrcty_en.xlsx) & StatCan Table 32-10-0045-01", "2011–2025", "OMAFA allocates provincial Farm Cash Receipts across counties using Census shares and marketing board data. Presented alongside empirical Census Gross Farm Receipts."),
        ("3. Field Crop Area, Yield & Production", "OMAFA Open Data (12 County Field Crop Workbooks)", "2011–2025", "Annual seeded area, harvested area, yield, 5-year rolling yield average, and production in both imperial units and metric tonnes."),
        ("4. Agri-Food Business Location Counts", "Statistics Canada Canadian Business Counts (Reconciled from Community Profile)", "Dec 2016, 2021, 2022, 2023", "Repairs 1-row column paste shifts identified in OMAFA's Huron, Peel, Hamilton, Halton, and Peterborough workbooks using the algebraic identity Net = Without Employees + With Employees."),
        ("5. Day vs. Night Agri-Food Workforce", "Statistics Canada Census of Population (Place of Work vs. Usual Residence)", "2011, 2016, 2021", "Compares jobs located in the municipality/county (Day) against employed residents living in the municipality/county (Night) to quantify net commuter inflows."),
        ("6. Municipal Farmland Assessment (CVA) & Property Tax", "Ontario Ministry of Municipal Affairs and Housing (MMAH) FIR Schedule 26A", "2021, 2023, 2024", "Aggregates lower-tier and single-tier municipal Financial Information Returns (Property Class FT = Farmland), capturing Lower-Tier, Upper-Tier, and Education taxes."),
        ("7. Prime Agricultural Soil (CLI) & Greenbelt", "Land Information Ontario (LIO) Soil Survey Complex & Greenbelt Outer Boundary", "Current Consolidation", "Polygon intersection in Ontario MNR Lambert (EPSG:3161) against 2021 StatCan Census Division and Consolidated Subdivision boundaries."),
        ("8. Rural Broadband Coverage (50/10 Mbps & LTE)", "Innovation, Science and Economic Development Canada (ISED) National Broadband Data", "2021 PHH / Latest Release", "Household-weighted aggregation of 298,425 Ontario pseudo-household (PHH) points to 2021 CDs, CCSs, and OFA Zones."),
        ("9. OFA Zone Boundaries & Special Footnotes", "OFA Regional Directory (December 2025)", "2025–2026", "Greater Sudbury (CD 3553) is included in Zone 15 totals with an explicit footnote. Stormont, Dundas and Glengarry (CD 3501) is split at the township level between Zone 11 (North/South Dundas) and Zone 14 (North/South Stormont & North/South Glengarry)."),
    ]
    for idx, (m_lbl, pub, vint, meth) in enumerate(notes_rows):
        r = write_data_row(ws9, r, [m_lbl, pub, vint, meth], is_zebra=(idx % 2 == 1))
    auto_fit_columns(ws9, max_width=65)

    out_path = out_dir / p["excelFilename"]
    wb.save(out_path)
    return p["excelFilename"], out_path.stat().st_size


def expand_aco_rows(profile: dict[str, Any], aco_catalog: list[list[str]] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in profile.get("agCensusOverTime", []):
        if isinstance(item, dict):
            out.append(item)
        elif aco_catalog is not None and isinstance(item, list) and len(item) >= 12:
            cat = aco_catalog[item[0]]
            out.append({
                "id": cat[0],
                "label": cat[1],
                "uom": cat[2],
                "v2006": item[1],
                "f2006": item[2],
                "v2011": item[3],
                "f2011": item[4],
                "v2016": item[5],
                "f2016": item[6],
                "v2021": item[7],
                "f2021": item[8],
                "chg16To21Pct": item[9],
                "chg06To21Pct": item[10],
                "ontShare2021Pct": item[11],
            })
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    master = json.loads(MASTER_JSON.read_text(encoding="utf-8"))
    aco_catalog = master.get("acoCatalog")
    profiles = list(master["profiles"].values())
    for p in profiles:
        p["agCensusOverTime"] = expand_aco_rows(p, aco_catalog)
    print(f"Generating {len(profiles)} OFA Profile 2.0 Excel workbooks in {OUT_DIR}...")

    tasks = [(p, str(OUT_DIR)) for p in profiles]
    with ProcessPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(build_single_workbook, tasks))

    max_size = max(sz for _, sz in results)
    avg_size = sum(sz for _, sz in results) / len(results)
    print(f"Generated {len(results)} workbooks. Avg size: {avg_size/1024:.1f} KB, Max size: {max_size/1024:.1f} KB")

    zip_path = OUT_DIR / "OFA_County_and_Zone_Profiles_2_0_All_65_Workbooks.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for fname, _ in sorted(results):
            zf.write(OUT_DIR / fname, arcname=fname)
    print(f"Created master ZIP bundle: {zip_path} ({zip_path.stat().st_size/1024/1024:.2f} MB)")


if __name__ == "__main__":
    main()
