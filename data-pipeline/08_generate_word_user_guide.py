"""
08_generate_word_user_guide.py
Generates a comprehensive, plain-language, richly illustrated Microsoft Word (.docx)
User Guide for AgCensus IQ (OFA Edition) in AgCensus_IQ_OFA_User_Guide.docx.
Aligned with the 2025-26 OFA Brand Guide and publication-grade data visualization standards.
"""

import os
from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

PROJECT_DIR = Path(__file__).resolve().parent.parent
DOCS_IMG_DIR = PROJECT_DIR / "docs" / "screenshots"
ARTIFACT_DIR = Path(
    os.environ.get(
        "AGCENSUS_ARTIFACT_DIR",
        r"C:\Users\ben.lefort\.gemini\antigravity\brain\23b428a3-5d13-4e1a-9b57-721583ddcbae",
    )
)
OUTPUT_DOCX = PROJECT_DIR / "AgCensus_IQ_OFA_User_Guide.docx"

# 2025-26 OFA Brand colors & uniform Arial font
FONT_FAMILY = "Arial"
NAVY_HEX = "334B58"       # OFA Pickled Bluewood
CRIMSON_HEX = "D7182A"    # OFA Crimson
SLATE_HEX = "334155"
LIGHT_BG_HEX = "F8FAFC"
CALLOUT_BG_HEX = "EDE6DE" # OFA Champagne
TIP_BG_HEX = "FEF2F2"
BORDER_HEX = "CBD5E1"

BLUEWOOD_RGB = RGBColor(0x33, 0x4B, 0x58)
CRIMSON_RGB = RGBColor(0xD7, 0x18, 0x2A)
SLATE_RGB = RGBColor(0x1E, 0x29, 0x3B)
MUTED_RGB = RGBColor(0x47, 0x55, 0x69)


def set_cell_background(cell, hex_color: str):
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shading)


def set_cell_margins(cell, top=120, bottom=120, left=160, right=160):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement("w:tcMar")
    for m, val in [("top", top), ("bottom", bottom), ("left", left), ("right", right)]:
        node = OxmlElement(f"w:{m}")
        node.set(qn("w:w"), str(val))
        node.set(qn("w:type"), "dxa")
        tcMar.append(node)
    tcPr.append(tcMar)


def add_callout_box(doc: Document, title: str, body_paragraphs: list[str], box_type: str = "info"):
    """Adds a shaded OFA callout box (Plain-Language Summary or OFA Advocacy Tip)."""
    bg = CALLOUT_BG_HEX if box_type == "info" else TIP_BG_HEX
    accent_rgb = BLUEWOOD_RGB if box_type == "info" else CRIMSON_RGB
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_background(cell, bg)
    set_cell_margins(cell, top=140, bottom=140, left=200, right=200)

    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(4)
    run_title = p.add_run(title)
    run_title.font.name = FONT_FAMILY
    run_title.bold = True
    run_title.font.size = Pt(10.5)
    run_title.font.color.rgb = accent_rgb

    for idx, text in enumerate(body_paragraphs):
        bp = cell.add_paragraph()
        bp.paragraph_format.space_before = Pt(2)
        bp.paragraph_format.space_after = Pt(2 if idx < len(body_paragraphs) - 1 else 0)
        r = bp.add_run(text)
        r.font.name = FONT_FAMILY
        r.font.size = Pt(10)
        r.font.color.rgb = SLATE_RGB

    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(0)
    spacer.paragraph_format.space_after = Pt(6)


def add_styled_table(doc: Document, headers: list[str], rows: list[list[str]], col_widths: list[float] = None):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"

    # Header row
    hdr_cells = table.rows[0].cells
    for i, h_text in enumerate(headers):
        hdr_cells[i].text = ""
        set_cell_background(hdr_cells[i], NAVY_HEX)
        set_cell_margins(hdr_cells[i], top=100, bottom=100, left=120, right=120)
        p = hdr_cells[i].paragraphs[0]
        r = p.add_run(h_text)
        r.font.name = FONT_FAMILY
        r.bold = True
        r.font.size = Pt(9.5)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    # Data rows
    for r_idx, row_data in enumerate(rows):
        row_cells = table.rows[r_idx + 1].cells
        bg = "FFFFFF" if r_idx % 2 == 0 else LIGHT_BG_HEX
        for c_idx, val in enumerate(row_data):
            row_cells[c_idx].text = ""
            set_cell_background(row_cells[c_idx], bg)
            set_cell_margins(row_cells[c_idx], top=80, bottom=80, left=120, right=120)
            p = row_cells[c_idx].paragraphs[0]
            r = p.add_run(val)
            r.font.name = FONT_FAMILY
            r.font.size = Pt(9.5)
            r.font.color.rgb = SLATE_RGB
            if c_idx == 0:
                r.bold = True

    if col_widths:
        for row in table.rows:
            for idx, w in enumerate(col_widths):
                row.cells[idx].width = Inches(w)

    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(6)


def add_screenshot(doc: Document, filename: str, caption: str):
    img_path = DOCS_IMG_DIR / filename
    if not img_path.exists() and ARTIFACT_DIR.exists():
        img_path = ARTIFACT_DIR / filename
    if not img_path.exists():
        raise FileNotFoundError(f"Missing screenshot required for User Guide: {filename}")
    p_img = doc.add_paragraph()
    p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_img.paragraph_format.space_before = Pt(6)
    p_img.paragraph_format.space_after = Pt(2)
    run = p_img.add_run()
    run.add_picture(str(img_path), width=Inches(6.4))

    p_cap = doc.add_paragraph()
    p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_cap.paragraph_format.space_after = Pt(10)
    r_cap = p_cap.add_run(caption)
    r_cap.font.name = FONT_FAMILY
    r_cap.italic = True
    r_cap.font.size = Pt(9)
    r_cap.font.color.rgb = MUTED_RGB


def add_heading_1(doc: Document, text: str):
    h = doc.add_heading(level=1)
    h.paragraph_format.space_before = Pt(16)
    h.paragraph_format.space_after = Pt(6)
    r = h.add_run(text)
    r.font.name = FONT_FAMILY
    r.font.size = Pt(16.5)
    r.font.bold = True
    r.font.color.rgb = BLUEWOOD_RGB
    return h


def add_heading_2(doc: Document, text: str):
    h = doc.add_heading(level=2)
    h.paragraph_format.space_before = Pt(12)
    h.paragraph_format.space_after = Pt(4)
    r = h.add_run(text)
    r.font.name = FONT_FAMILY
    r.font.size = Pt(13)
    r.font.bold = True
    r.font.color.rgb = CRIMSON_RGB
    return h


def add_heading_3(doc: Document, text: str):
    h = doc.add_heading(level=3)
    h.paragraph_format.space_before = Pt(8)
    h.paragraph_format.space_after = Pt(2)
    r = h.add_run(text)
    r.font.name = FONT_FAMILY
    r.font.size = Pt(11)
    r.font.bold = True
    r.font.color.rgb = BLUEWOOD_RGB
    return h


def add_body(doc: Document, text: str, bold_prefix: str = None):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.line_spacing = 1.15
    if bold_prefix:
        rb = p.add_run(bold_prefix)
        rb.font.name = FONT_FAMILY
        rb.bold = True
        rb.font.size = Pt(10.5)
        rb.font.color.rgb = SLATE_RGB
    r = p.add_run(text)
    r.font.name = FONT_FAMILY
    r.font.size = Pt(10.5)
    r.font.color.rgb = SLATE_RGB
    return p


def add_bullet(doc: Document, bold_prefix: str, text: str):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.12
    if bold_prefix:
        rb = p.add_run(bold_prefix)
        rb.font.name = FONT_FAMILY
        rb.bold = True
        rb.font.size = Pt(10)
        rb.font.color.rgb = SLATE_RGB
    r = p.add_run(text)
    r.font.name = FONT_FAMILY
    r.font.size = Pt(10)
    r.font.color.rgb = SLATE_RGB
    return p


def build_user_guide():
    doc = Document()

    # Page margins (0.8 inches all around for a clean executive manual layout)
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # Set uniform Arial base font across Normal and List Bullet styles
    for style_name in ["Normal", "List Bullet"]:
        if style_name in doc.styles:
            doc.styles[style_name].font.name = FONT_FAMILY
            doc.styles[style_name].font.size = Pt(10.5)

    # =========================================================================
    # COVER / TITLE PAGE
    # =========================================================================
    p_badge = doc.add_paragraph()
    p_badge.paragraph_format.space_before = Pt(20)
    p_badge.paragraph_format.space_after = Pt(4)
    r_badge = p_badge.add_run("ONTARIO FEDERATION OF AGRICULTURE (OFA)  •  OFFICIAL USER MANUAL")
    r_badge.font.name = FONT_FAMILY
    r_badge.bold = True
    r_badge.font.size = Pt(10)
    r_badge.font.color.rgb = CRIMSON_RGB

    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(6)
    r_title = p_title.add_run("AgCensus IQ (OFA Edition)\nComplete Plain-Language User Guide")
    r_title.font.name = FONT_FAMILY
    r_title.bold = True
    r_title.font.size = Pt(23)
    r_title.font.color.rgb = BLUEWOOD_RGB

    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(12)
    r_sub = p_sub.add_run(
        "A Step-by-Step Guide to Exploring, Comparing, Ranking, Mapping, and Exporting Canadian & Ontario "
        "Agri-Food Intelligence — Aligned with the 2025–26 OFA Brand Identity & Executive Chart Standards"
    )
    r_sub.font.name = FONT_FAMILY
    r_sub.font.size = Pt(11.5)
    r_sub.font.color.rgb = MUTED_RGB

    add_callout_box(
        doc,
        "At a Glance: What Is AgCensus IQ (OFA Edition)?",
        [
            "AgCensus IQ is a purpose-built agricultural intelligence and policy platform created for the Ontario Federation of Agriculture (OFA). It transforms 49 Statistics Canada Census of Agriculture tables—plus OMAFA Farm Cash Receipts, Field Crop Yields, Municipal Farmland Property Tax (FIR), CLI Prime Soil, Greenbelt, and ISED Rural Broadband datasets—into an instant, visual, point-and-click workspace.",
            "Every chart and slide export follows OFA's publication-grade visual standards: declarative takeaway headlines, plain-English commodity labels (zero NAICS or statistical lookup codes on visuals), 100%-reconciled Net-Score Bridges, and single-purpose OFA Crimson spotlighting against calm neutral context bars."
        ],
        box_type="info",
    )

    add_styled_table(
        doc,
        ["Platform Feature", "What Is Included in AgCensus IQ (OFA Edition)"],
        [
            ["Official Data Sources", "100% Empirical Statistics Canada Census of Agriculture (Tables 32-10-0153-01 to 32-10-0445-01, plus Cross-Tabulations 32-10-0399-01 & 32-10-0401-01) and OMAFA / MMAH FIR / CLI / ISED Datasets"],
            ["Historical Span", "2021 Census + 2016 Benchmark Deltas + 45-Year Historical Trend Series (1976–2021) + 2018–2025 OMAFA Farm Cash Receipts & Yields"],
            ["Geographic Coverage", "2,113 Geographies across Canada: 1 Country, 10 Provinces, 72 Agricultural Regions (CAR), 282 Counties & Districts (CD), and 1,748 Townships & Municipalities (CCS)"],
            ["Ontario & OFA Coverage", "All 5 Ontario Agricultural Regions, all 15 OFA Regional Zones (Zone 1–Zone 15), all 49 Ontario Counties & Districts mapped to OFA Federations, and all 414 Ontario Townships"],
            ["Agricultural Metrics", "244 Official Census Characteristics organized into 10 plain-language categories, plus 609-row County & Zone Ag Census Profiles"],
            ["Core Analytical Modules", "9 Plain-English Modules (Overview, OFA Profiles, Area Finder, Topic Charts, Compare 2, Rankings, Crop Maps, Multi-Filter, Scorecard) + Quick-Start Launcher + Multi-Area PDF Report Builder + AI Policy Briefs"],
            ["Slide & Workbook Exports", "1800×1125 High-DPI PNG Slide Graphics (with Bottom Line takeaway strips), 65 Multi-Sheet Excel Workbooks (.xlsx), and 65 Two-Page PDF Fact Sheets"],
        ],
        col_widths=[2.1, 4.7],
    )

    add_screenshot(
        doc,
        "01_snapshot_ontario.png",
        "Figure 1: AgCensus IQ (OFA Edition) opens directly to an executive one-screen dashboard styled in OFA Pickled Bluewood, Champagne, and OFA Crimson."
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 1: GETTING STARTED & SCREEN LAYOUT
    # =========================================================================
    add_heading_1(doc, "1. Getting Started & Understanding the Screen Layout")

    add_body(
        doc,
        "AgCensus IQ is designed around a single-screen executive layout. Rather than forcing analysts and board directors to scroll through raw government spreadsheets or decode statistical classification numbers, every view leads with a declarative takeaway headline and places your slicers, visual bars, bridges, and maps onto one screen."
    )

    add_heading_2(doc, "1.1 How to Open the Tool (Hosted Cloud App or Local Desktop)")
    add_bullet(
        doc,
        "On the Hosted Web App (Streamlit Cloud): ",
        "Open the shared OFA Streamlit Cloud link in any modern browser (Edge, Chrome, Firefox, or Safari). An expandable bar right at the top of the hosted page ('OFA County & Zone Profiles 2.0 — Direct Excel (.xlsx), PDF Fact Sheet & Master ZIP Downloads') lets you download individual County/Zone Excel workbooks, printable PDFs, or the complete 65-file ZIP archive in one click."
    )
    add_bullet(
        doc,
        "When Running Locally on Your Computer: ",
        "Open a terminal or PowerShell window in the project folder, run npm run dev, and open http://localhost:5173 in your browser."
    )

    add_heading_2(doc, "1.2 The Four Parts of the Screen")
    add_body(
        doc,
        "No matter which module you are using, the workspace is organized into four consistent zones:"
    )

    add_bullet(
        doc,
        "1. The Champagne Navigation Rail (All 9 Plain-English Modules — Sticky Bottom Bar on Mobile): ",
        "Running down the left edge beneath the OFA Crimson squircle emblem are the 9 plain-English modules: (1) Overview, (2) OFA Profiles, (3) Area Finder, (4) Topic Charts, (5) Compare 2, (6) Rankings, (7) Crop Maps, (8) Multi-Filter, and (9) Scorecard. On phones (<768px), this converts into a sticky bottom bar so cards use 100% of screen width. At the bottom are three helper buttons: (?) Guided Walkthrough, (A) AI Policy Brief Drawer, and Empirical Data Provenance."
    )
    add_bullet(
        doc,
        "2. The Pickled Bluewood Top Header Bar & Smart Omnibox: ",
        "Accented by an OFA Crimson bottom rule, the top bar provides one-click shortcut pills for key benchmarks (Canada, Ontario, Huron, Wellington, Perth, Chatham-Kent, Oxford), a Smart Search Omnibox for any Town, Township, County, OFA Zone ('OFA Zone 7', 'Zone 15'), or farm question ('Beef', 'Cash Rent', 'Tile Drainage', 'Broadband', 'Property Tax', 'Crop Yields'), and quick buttons for 'Multi-Area PDF Report', 'AI Policy Brief', and '? Guide'."
    )
    add_bullet(
        doc,
        "3. The Left Control Column (Geography & Topic Slicers): ",
        "Just inside the workspace on the left side is where you select which geography (or geographies) and which plain-English agricultural topic to inspect. Changes update all charts, bridges, tables, and maps instantaneously."
    )
    add_bullet(
        doc,
        "4. The Main Analytical Canvas (Center & Right): ",
        "Displays your visual evidence—spotlight bar charts, Net-Score Bridges, 1976–2021 SVG line trajectories, Fréchet–Hoeffding joint bounds, two-color butterfly comparisons, ranked leaderboards, Canada-only choropleth maps, or the 8-tab OFA Profiles 2.0 suite."
    )

    add_callout_box(
        doc,
        "OFA Pro Tip: Your Selected Geography Follows You Across Modules!",
        [
            "If you select 'Huron County' in Ag Snapshot and then click 'Explorer', 'Compare', or 'Profiles 2.0' on the left-hand menu, the tool carries Huron County forward automatically. Typing 'OFA Zone 7' or 'Zone 15' into the top search bar jumps straight to that OFA Regional Zone inside Profiles 2.0."
        ],
        box_type="tip",
    )

    # =========================================================================
    # SECTION 2: UNDERSTANDING GEOGRAPHIES & OFFICIAL STATUS CODES
    # =========================================================================
    add_heading_1(doc, "2. Understanding Geographies, OFA Zones & Official Data Codes")

    add_body(
        doc,
        "AgCensus IQ strips statistical lookup codes like 'CAR', 'CD', 'CCS', and '[1111]' off visual chart labels automatically, translating every boundary level and farm sector into everyday Ontario agricultural language."
    )

    add_styled_table(
        doc,
        ["Level Name in Tool", "Plain-Language Meaning", "Total in Canada", "Total in Ontario", "Real-World Example"],
        [
            [
                "1. Country",
                "All of Canada combined.",
                "1",
                "—",
                "Canada (189,874 farms)"
            ],
            [
                "2. Provinces",
                "Each individual Canadian province for inter-provincial policy benchmarking.",
                "10",
                "1",
                "Ontario (48,346 farms), Quebec, Alberta, Saskatchewan"
            ],
            [
                "3. Agricultural Regions (CAR)",
                "Large multi-county Statistics Canada farming regions grouped by climate and geography.",
                "72",
                "5",
                "Southern, Western, Central, Eastern, and Northern Ontario"
            ],
            [
                "OFA Regional Zones (Profiles 2.0)",
                "OFA's 15 official governance & member service zones aggregating counties and split townships.",
                "—",
                "15",
                "Zone 7 (Huron & Perth), Zone 2 (Bruce & Grey), Zone 15 (Northern Ontario)"
            ],
            [
                "4. Counties & Districts (CD)",
                "Your County, Regional Municipality, Single-Tier City, or Northern District.",
                "282",
                "49",
                "Huron County (2,564 farms), Wellington County (2,617 farms), Chatham-Kent (2,412 farms)"
            ],
            [
                "5. Townships & Municipalities (CCS)",
                "Your local lower-tier Township or Consolidated Municipality inside a county.",
                "1,748",
                "414",
                "South Huron (253 farms), Mapleton (638 farms), North Perth (585 farms)"
            ],
        ],
        col_widths=[1.45, 1.85, 0.65, 0.65, 2.2],
    )

    add_callout_box(
        doc,
        "In Plain Language: What Do 'Withheld (x)', 'Withheld (F)', and '— / N/A' Mean?",
        [
            "AgCensus IQ enforces a strict 100% empirical, zero-fabrication policy. Rather than guessing or inventing numbers when Statistics Canada withholds a cell, the platform displays calm, transparent labels and offers a 1-click Parent-County Recovery button on small townships:",
            "• 'Withheld (x)' — Confidentiality Protection: Under the federal Statistics Act, if a local township has only a few farms growing a crop or in a revenue bracket, Statistics Canada hides the figure to protect individual farm privacy. Click the 'View Complete Data for [Parent County]' banner at the top of Overview to step up 1 level immediately.",
            "• 'Withheld (F)' — Small-Sample Variability: Used by Statistics Canada on 2021 Census sample/imputation items when small-area dispersion exceeds release standards.",
            "• '—' or 'N/A' — Zero Reporting Denominator: Displayed on per-farm averages (such as Average Pigs per Farm) when 0 farms in that township report that commodity."
        ],
        box_type="info",
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 3: STEP-BY-STEP GUIDE TO MODULES 1 TO 7
    # =========================================================================
    add_heading_1(doc, "3. Step-by-Step Guide to Plain-English Modules")

    # -------------------------------------------------------------------------
    # MODULE 1: OVERVIEW (FORMERLY AG SNAPSHOT)
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.1 Overview (At-a-Glance Summary, Quick-Start, #Rank Badges & Net Bridge)")
    add_body(
        doc,
        "Overview is your starting hub for any province, county, or township. It features a dismissible 4-card Quick-Start launcher, an Ontario-first Geography picker (listing Ontario's 49 Counties first by default), a 1-sentence Key Takeaway, automatic '#Rank of 49 in ON' badges and 'ON avg' benchmarks, a red 'Full [County] Profile & Excel (.xlsx)' button, and 8 visual cards."
    )

    add_screenshot(
        doc,
        "01_snapshot_ontario.png",
        "Figure 2: Ag Snapshot displaying the declarative headline, OFA Crimson #1 spotlight bars, and the 100%-reconciled Receipts, Expenses & Net Bridge."
    )

    add_heading_3(doc, "What Each of the 8 Snapshot Cards Tells You:")
    add_bullet(
        doc,
        "Card 1 — Census Farms & Farmland: ",
        "Total census farms in 2021, total farmland acres, average farm size, 2016–2021 % change badges, and a visual Cropland vs. Pasture vs. Woodland/Wetland bar."
    )
    add_bullet(
        doc,
        "Card 2 — Operators & Succession: ",
        "Average operator age, female operator share (%), operators under 35 vs. 55+, and the share of farms with a formal Written Succession Plan (highlighted in OFA Crimson)."
    )
    add_bullet(
        doc,
        "Card 3 — Leading Farm Specializations: ",
        "Ranks the top 5 primary farm sectors in plain English, spotlighting #1 in OFA Crimson against calm neutral context bars."
    )
    add_bullet(
        doc,
        "Card 4 — Land Tenure & Legal Structure: ",
        "Shows Owned (Pickled Bluewood) vs. Rented/Leased (Tulip Tree) farmland share alongside Sole Proprietorships, Partnerships, and Family/Non-Family Corporations."
    )
    add_bullet(
        doc,
        "Card 5 — Top Field Crops & Horticulture: ",
        "Identifies and ranks the top 5 field crops grown in that area by acreage (#1 in OFA Crimson), plus Fruit Acres, Field Vegetable Acres, and Greenhouse square footage."
    )
    add_bullet(
        doc,
        "Card 6 — Livestock, Poultry & Bees: ",
        "Census Day animal inventories: Cattle & Calves (Dairy vs. Beef cows), Hogs & Pigs (with average herd size per reporting farm), Hens & Chickens, and Sheep / Honeybee colonies."
    )
    add_bullet(
        doc,
        "Card 7 — Receipts, Expenses & Net Bridge: ",
        "Pairs Total Gross Farm Receipts with a 100%-reconciled visual Net-Score Bridge: Avg Gross Receipts / Farm minus Avg Operating Expenses equals Net Cash Operating Income & Margin (%)—eliminating mental subtraction."
    )
    add_bullet(
        doc,
        "Card 8 — Farm Capital, Farmland Value & Stewardship Tech: ",
        "Total Farm Capital ($), Land & Building value per acre ($/acre), and adoption rates for No-Till Seeding, Winter Cover Crops, Auto-Steer GPS, Renewable Energy, and Direct-to-Consumer Sales."
    )

    add_heading_3(doc, "Interactive Actions in Ag Snapshot:")
    add_bullet(
        doc,
        "The '+' Button on Every Card Header: ",
        "Jumps directly into Ag Explorer with that exact topic loaded."
    )
    add_bullet(
        doc,
        "'Click here to show map' (Geographic Context & Nearby Peers): ",
        "Opens a Canada-Only polygon map highlighting your selected boundary alongside the 12 closest peer geographies ranked by distance (km)."
    )
    add_bullet(
        doc,
        "'Export OFA County Factsheet': ",
        "Prints or saves a formatted 1-page PDF briefing handout."
    )

    add_screenshot(
        doc,
        "01b_snapshot_map_modal.png",
        "Figure 3: Clicking 'Click here to show map' in Ag Snapshot opens the interactive polygon map and ranks nearby peer areas by distance."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 2: AG EXPLORER
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.2 Module 2: Ag Explorer (Spotlight Bars, Tail Consolidation & 1976–2021 Line Charts)")
    add_body(
        doc,
        "Click 'Explorer' (the lightbulb icon) whenever you want to inspect all sub-categories inside one of the 10 Census topic groups, check exact denominator bases, or plot 45-year structural trajectories across 10 Census waves (1976–2021)."
    )

    add_screenshot(
        doc,
        "02_explorer_bars.png",
        "Figure 4: Ag Explorer spotlighting the #1 specialization in OFA Crimson, consolidating minor (<3%) tail categories into a reconciled 'Other' bucket, and pairing Companion Benchmarks on the right."
    )

    add_heading_3(doc, "How to Use Ag Explorer Step-by-Step:")
    add_bullet(
        doc,
        "1. Pick Any Geography & Topic Selector (Left Panel): ",
        "Select your geography at the top-left, choose 1 of the 10 plain-English Agricultural Topic Groups, and click a Breakdown View (such as 'Primary Farm Specializations' vs. 'Detailed Commodity Specializations')."
    )
    add_bullet(
        doc,
        "2. Automatic Minor-Tail Consolidation ('Other' Bucket): ",
        "To keep key bars readable without tiny slivers, categories below 3% of the base are automatically grouped into a 100%-reconciled 'Other (...)' bar. Click 'Show all individual categories' below the chart anytime to expand every single row."
    )
    add_bullet(
        doc,
        "3. Switch Between the 4 Visual Modes (Top-Center Icon Buttons): ",
        "(a) Horizontal Spotlight Bars (#1 in OFA Crimson, peers in calm neutral slate, with 2016–2021 change badges); (b) Proportional Share / Adoption Gauges (clean OFA proportional bar for mutually exclusive categories, or automatic individual 0–100% Adoption Gauges when farms can report multiple practices at once); (c) Multi-Census Structural Trajectory (1976–2021), featuring a zero-clutter single-scale SVG line chart with 6 metric pills, 4 snapped round ticks, a 0/$0 baseline, and OFA Crimson 2021 endpoint above the 10-census table; and (d) Structured Data Table & CSV."
    )
    add_bullet(
        doc,
        "4. Check 'Base ?' & 'Companion Benchmarks': ",
        "Verify the exact Statistics Canada denominator on the bottom-left or via 'Base ?', and review paired farm totals, averages, $/acre values, and margins on the right."
    )

    add_screenshot(
        doc,
        "02b_explorer_historical.png",
        "Figure 5: Ag Explorer's 1976–2021 Multi-Census Structural Trajectory mode pairs a single-scale SVG line chart (with clean round ticks and 0 baseline) above the 10-wave reference table."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 3: AG DRILLDOWN
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.3 Multi-Filter (Plain-English Multi-Trait Screening & Income/Education Tables)")
    add_body(
        doc,
        "Multi-Filter (the funnel icon) lets anyone find counties or townships matching 2 or 3 farm traits at once, presenting the exact Confirmed Matching Range ('At Least -> Up To') in plain English while preserving 100% rigorous Fréchet–Hoeffding mathematical bounds (explained in a collapsible 'How is this range calculated?' note)."
    )

    add_screenshot(
        doc,
        "03_drilldown.png",
        "Figure 6: Ag Drilldown Mode 1 — Plain-English Multi-Criteria Screening & Exact Fréchet–Hoeffding Joint Farm Bounds ([Guaranteed Min — Max Possible])."
    )

    add_heading_3(doc, "Mode 1 — Multi-Criteria Geography Screening & Exact Joint Bounds:")
    add_bullet(
        doc,
        "Combine Up to 3 Plain-English Filters + Minimum Share Thresholds: ",
        "Choose Filter 1 — Farm Specialization (e.g., 'Grain & Oilseed', 'Dairy', 'Beef & Feedlots'), Filter 2 — Revenue Scale (e.g., '$500,000 and over (Commercial Scale)'), and Filter 3 — Structure & Practice (e.g., 'Written Succession Plan', 'Auto-Steer GPS', 'Winter Cover Crops')."
    )
    add_bullet(
        doc,
        "Exact Fréchet–Hoeffding Mathematical Joint Bounds ([Min–Max]): ",
        "Whenever 2 or 3 filters are active, Ag Drilldown computes the mathematically guaranteed floor and ceiling on how many farms satisfy all selected criteria simultaneously: Guaranteed Min = max(0, N1 + N2 - Total) and Max Possible = min(N1, N2). Toggle the map between 'Max Bound' and 'Min Floor', and click 'Download Map (PNG)' for an 1800×1125 OFA briefing slide with an institutional Bottom Line strip."
    )

    add_heading_3(doc, "Mode 2 — Official Statistics Canada Cross-Tabulations (32-10-0401-01 & 32-10-0399-01):")
    add_bullet(
        doc,
        "True Published Joint Linkage Matrices (Province & National Level): ",
        "Click '2. Official StatCan Cross-Tabulations' at the top to explore Farm Specialization × Household Total Income (32-10-0401-01) and Farm Specialization × Operator Educational Attainment (32-10-0399-01) across Row %, Exact Counts, and Col %."
    )

    add_screenshot(
        doc,
        "03b_drilldown_crosstabs.png",
        "Figure 7: Ag Drilldown Mode 2 — Official Statistics Canada Cross-Tabulations (Farm Specialization × Household Income & Operator Education)."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 4: AG COMPARE
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.4 Compare 2 (Head-to-Head Benchmarking, Elevated Topic Bar & Peer Matcher)")
    add_body(
        doc,
        "Click 'Compare 2' on the left rail to benchmark Area A (Pickled Bluewood) against Area B (OFA Crimson) with an always-visible 'Compare Topic' & '% Share | Counts' bar right above the chart—or click 'Find Closest Match' to discover which other county in Ontario or Canada aligns most closely with yours."
    )

    add_screenshot(
        doc,
        "04_compare.png",
        "Figure 8: Ag Compare displaying Perth (Pickled Bluewood) vs. Huron (OFA Crimson) butterfly bars, suppression-safe Winner Dots, and the 'Find Closest Match' peer engine."
    )

    add_heading_3(doc, "Key Features of Ag Compare:")
    add_bullet(
        doc,
        "Automated 'Find Closest Match' & 'Most Alike Pair' Engine: ",
        "Computes standardized Z-score alignment across scale-free structural shares (commodity mix, operator profile, technology adoption, $/acre farmland value, and margins) to surface the top 5 peer matches, complete with 'Why They Match' pillars and the single 'Largest Gap'."
    )
    add_bullet(
        doc,
        "Two-Color Butterfly Bars & Suppression-Safe Winner Dots (●): ",
        "Marks whichever geography leads on each unsuppressed row with a matching Bluewood or Crimson dot (●). If either side is suppressed ('x' or 'F'), no misleading winner dot is awarded."
    )
    add_bullet(
        doc,
        "1800×1125 Slide Graphic, PDF & CSV Exports: ",
        "Click 'Download Visual (PNG)' in the header for a presentation-ready 1800×1125 OFA comparison graphic complete with a declarative alignment headline and Bottom Line takeaway strip."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 5: AG RANKER
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.5 Module 5: Ag Ranker (Custom Leaderboards Across All 244 Metrics)")
    add_body(
        doc,
        "Click 'Ranker' whenever you want to rank every county, district, region, or township across any of the 244 Census of Agriculture metrics—with the #1 leader spotlighted in OFA Crimson."
    )

    add_screenshot(
        doc,
        "05_ranker_acres.png",
        "Figure 9: Ag Ranker showing the 6-button Unit Filter, OFA Crimson #1 spotlight bar vs. muted peer bars, Extra Reference Column, and Quintile Map."
    )

    add_heading_3(doc, "How to Customize What You Rank in Ag Ranker:")
    add_bullet(
        doc,
        "1. Filter by Unit Measure (All 244, Acres, Head / Herd, Dollars $, Farms, Totals / Avgs): ",
        "Narrows the metric dropdown immediately to Acreage totals, Livestock head counts, Dollar revenues/capital, or Farm counts."
    )
    add_bullet(
        doc,
        "2. One-Click 'Switch Measure for This Topic' Pills: ",
        "Flip any selected commodity (such as Cattle, Pigs, Soybeans, or Corn) between Total Acres / Head, Farms Reporting, and Per-Farm Average in one click (active pill highlighted in OFA Crimson)."
    )
    add_bullet(
        doc,
        "3. Customize 'Extra Col:' & Export 1800×1125 PNG / PDF / CSV: ",
        "Pair your ranked metric with Auto Paired Acres/Head/Farms, Total Farmland, Cropland, Avg Size, Gross Rev ($), or 2016 Prior Value, and export via 'Download Map & Graph (PNG)' (with Bottom Line takeaway strip), 'Print / Save PDF', or 'Download Data (Excel CSV)'."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 6: AG BELTS & CLUSTER MAPS STUDIO
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.6 Module 6: Ag Belts & Cluster Maps Studio (1800×1125 Poster Generator)")
    add_body(
        doc,
        "Ag Belts & Cluster Maps Studio generates publication-grade 1800×1125 maps across all 282 agricultural Canadian Counties & Districts or any individual Province."
    )

    add_screenshot(
        doc,
        "06_belts_dominant.png",
        "Figure 10: Ag Belts & Cluster Maps Studio in 'Dominant Belts' mode with declarative headline, dotted perimeter callouts, active-only legend, and Bottom Line takeaway strip."
    )

    add_heading_3(doc, "The 3 Visual Map Modes in Ag Belts Studio:")
    add_bullet(
        doc,
        "Mode 1 — Dominant Belts (Leading Sector per County): ",
        "Colors each county or district by its #1 dominant crop, farm specialization, livestock group, or tillage practice—showing only active winning belts in provincial legends."
    )
    add_bullet(
        doc,
        "Mode 2 — All-CD Heat Map (6-Tier Continuous Production Footprint): ",
        "Shades every active county or district across 6 continuous tiers to show the full regional footprint."
    )
    add_bullet(
        doc,
        "Mode 3 — Cluster Focus (5-Tier Quintile Hotspots): ",
        "Maps any of the 244 Census variables into 5 quintile tiers (including the official Slate -> Pickled Bluewood -> OFA Crimson brand ramp), with Dark Editorial and Light OFA Report themes and 1-click 'Download Social Poster (PNG)'."
    )

    add_screenshot(
        doc,
        "06b_belts_heatmap.png",
        "Figure 11: Ag Belts & Cluster Maps Studio in 'All-CD Heat Map' mode showing full provincial production intensity."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 7: AGSCORE
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.7 Scorecard (Custom 0–100 Multi-Trait Peer Scorecard)")
    add_body(
        doc,
        "Scorecard combines up to 4 farm traits into a single 0 to 100 Peer Score using simple 'Off | Low | Med | High' priority buttons (plus an optional 'Advanced Cutoffs' toggle), real selected trait names as table column headers, and non-overlapping #1/#2/#3 map callouts."
    )

    add_screenshot(
        doc,
        "07_agscore.png",
        "Figure 12: AgScore combining 4 weighted variables into a 0–100 Composite Index using official OFA score bands (Crimson, Bluewood, Tulip Tree, Slate)."
    )

    add_callout_box(
        doc,
        "In Plain Language: How AgScore & OFA Score Bands Work",
        [
            "1. Standardization: Each of your 4 chosen characteristics is standardized across qualifying geographies into a Z-score and Normal Percentile from 0 to 100 (where 50 is average).",
            "2. Directional Polarity ('↑ High' vs. '↓ Low'): Click the polarity button at the top-right of any slot card when lower values should score higher (for example, younger Average Operator Age or lower Rented Farmland Pressure).",
            "3. Official OFA Score Bands: Composite scores are color-coded into Leading (90–100, OFA Crimson #D7182A), Strong (70–90, Pickled Bluewood #334B58), Moderate (50–70, Tulip Tree #ECA842), and Low (<50, Neutral Slate #94A3B8)."
        ],
        box_type="info",
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 4: GEOSEARCH, PROFILES 2.0 & GLOBAL REPORTING TOOLS
    # =========================================================================
    add_heading_1(doc, "4. GeoSearch, OFA Profiles 2.0, Multi-Area Reports, AI Briefs & Maps")

    # -------------------------------------------------------------------------
    # MODULE 8: GEOSEARCH
    # -------------------------------------------------------------------------
    add_heading_2(doc, "4.1 Module 8: GeoSearch — Area & Commodity Finder")
    add_body(
        doc,
        "Click 'GeoSearch' (the compass icon) to resolve any rural town, village, township, county, OFA Federation, or OFA Regional Zone (Zone 1–Zone 15) in plain English and inspect instant Census figures."
    )

    add_screenshot(
        doc,
        "08_geosearch.png",
        "Figure 13: GeoSearch resolving local communities, multi-district OFA Federations, and instant plain-English commodity searches."
    )

    add_bullet(
        doc,
        "Search Any Community, Federation, or OFA Regional Zone: ",
        "Type 'Listowel', 'Powassan', 'East Nipissing Parry Sound', or 'OFA Zone 7' to view its containment hierarchy, OFA Federation badge, and Champagne Combined Regional Rollup banner."
    )
    add_bullet(
        doc,
        "Instant 244-Metric Topic Lookup: ",
        "Type any keyword ('dairy', 'maple', 'solar', 'no-till', 'land value') in Step 2 on the right to view 2021 and 2016 figures immediately, or click any row to open it in Ag Explorer."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 9: OFA COUNTY & ZONE PROFILES 2.0
    # -------------------------------------------------------------------------
    add_heading_2(doc, "4.2 Module 9: OFA County & Zone Profiles 2.0 (65 Workbooks, Bridges & PDF Fact Sheets)")
    add_body(
        doc,
        "OFA County & Zone Profiles 2.0 covers all 49 Ontario Counties & Districts, all 15 OFA Regional Zones, and Ontario (65 profiles total), unifying 7 public datasets into 8 interactive tabs, ready-to-send 9-sheet Excel workbooks (.xlsx), and 2-page PDF Fact Sheets."
    )

    add_screenshot(
        doc,
        "11_profiles_huron_summary.png",
        "Figure 14: OFA Profiles 2.0 Executive Summary for Huron County (Zone 7), showing 12 multi-source KPI cards, declarative commodity headline, OFA Crimson #1 bar spotlight, and .xlsx / PDF downloads."
    )

    add_heading_3(doc, "What Is Inside Each of the 8 Interactive Profile Tabs:")
    add_bullet(
        doc,
        "Tab 1 — Executive Summary: ",
        "12 headline KPI cards plus leading commodities by 2024 OMAFA Farm Cash Receipts (#1 spotlighted in OFA Crimson against neutral context bars)."
    )
    add_bullet(
        doc,
        "Tab 2 — Townships: ",
        "Side-by-side comparison of every constituent municipality and township across farms, cropland, gross receipts, net margin, succession plans, 2024 farmland property tax, 50/10 Mbps broadband, and agri-food businesses."
    )
    add_bullet(
        doc,
        "Tab 3 — Farm Cash Receipts (2018–2025) & Operating Net-Score Bridge: ",
        "Opens with a 100%-reconciled 2020 Census Farm Operating Net-Score Bridge (Gross Farm Receipts minus Total Operating Expenses equals Net Cash Operating Income & Margin %), followed by OMAFA's 36-commodity series (2018–2025 Prelim)."
    )
    add_bullet(
        doc,
        "Tab 4 — Field Crop Yields: ",
        "Seeded acres, harvested acres, latest yield, 5-year rolling average yield, and metric-tonne production across 12 major field crops."
    )
    add_bullet(
        doc,
        "Tab 5 — Businesses & Day/Night Jobs (With Commuter Net-Score Bridge): ",
        "Plain-English agri-food business location counts (Dec 2016–Dec 2023) paired with a 100%-reconciled 2021 Agri-Food Workforce Commuter Net-Score Bridge (Place-of-Work Daytime Agri-Food Jobs minus Resident Agri-Food Workers equals Net Daily Commuter Balance)."
    )
    add_bullet(
        doc,
        "Tab 6 — Tax, Prime Soil & Broadband: ",
        "MMAH FIR Schedule 26A farmland assessment (CVA) and property tax levies (2021–2024), CLI Class 1–3 Prime Agricultural Soil acres, Greenbelt acres, and ISED 50/10 Mbps broadband availability."
    )
    add_bullet(
        doc,
        "Tab 7 — Ag Census (2006–2021): ",
        "Searchable 609-row 4-census historical table (use 'Show All 609 Rows' to expand the full un-truncated series) with zero spreadsheet formula errors."
    )
    add_bullet(
        doc,
        "Tab 8 — Local Food Est. (Badged 'Estimate'): ",
        "Population-scaled Ontario household food spending and local food demand benchmarks, keeping crop acres and livestock head strictly separate."
    )

    add_screenshot(
        doc,
        "11c_profiles_huron_tax_soil_broadband.png",
        "Figure 15: Profiles 2.0 Tab 6 — Municipal Farmland Property Tax (FIR), CLI Prime Agricultural Soil (Classes 1–3), Greenbelt, and ISED 50/10 Mbps Rural Broadband."
    )

    add_callout_box(
        doc,
        "Exact Geographic Reconciliation in OFA Zones (Sudbury & SDG Split):",
        [
            "• Zone 15 (Northern Ontario — Sudbury District vs. Greater Sudbury): Profiles 2.0 reconciles Statistics Canada's separate Greater Sudbury (CD 3553) and Sudbury District (CD 3552) tables with an explicit boundary banner so zone totals never double-count or omit Greater Sudbury.",
            "• Zone 11 & Zone 14 (Stormont, Dundas & Glengarry Split): Allocates North & South Dundas to Zone 11 and North & South Stormont + North & South Glengarry to Zone 14 using township-level CCS records."
        ],
        box_type="tip",
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # GLOBAL TOOLS: MULTI-AREA REPORT, AI BRIEF, MAPS
    # -------------------------------------------------------------------------
    add_heading_2(doc, "4.3 Multi-Area PDF Report Builder ('Multi-Area PDF Report' Button)")
    add_body(
        doc,
        "Click the OFA Crimson 'Multi-Area PDF Report' button in the top header from any screen to combine multiple counties, districts, or townships into a single printable briefing package."
    )

    add_screenshot(
        doc,
        "09_multi_area_report.png",
        "Figure 16: The Multi-Area PDF Report Builder combines custom jurisdictions with automatic nested double-count protection."
    )

    add_bullet(
        doc,
        "Double-Count-Safe Rollup Math: ",
        "If both a parent County (e.g., Huron) and a child Township inside it (e.g., South Huron) are selected, COMBINED UNION automatically excludes the nested child from the sum so farms and acres are never double-counted, while weighting averages and margins by their true denominators."
    )

    add_heading_2(doc, "4.4 AI Executive Policy Summary ('AI Policy Brief' Button)")
    add_body(
        doc,
        "Click 'AI Policy Brief' in the top header to open a 5-paragraph executive briefing drawer grounded 100% in official Statistics Canada tables for your active geography, with one-click Copy Policy Briefing."
    )

    add_screenshot(
        doc,
        "10_ai_policy_brief.png",
        "Figure 17: The AI Executive Policy Summary drawer generates citation-backed speaking notes with zero synthetic figures."
    )

    add_heading_2(doc, "4.5 Interactive Canada-Only Maps & Accessible Palette")
    add_bullet(
        doc,
        "Auto-Flowing Northern Ontario Inset & Regional Focus Pills: ",
        "Focuses map space on Canadian agricultural boundaries with one-click pills ('All Canada', 'West / Prairies', 'ON / QC', 'Atlantic', and 'South ON + Inset'), #1 OFA Crimson / #2–#3 Pickled Bluewood rank pins, and a colorblind-safe 'Accessible' palette toggle."
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 5: COMPLETE CATALOG OF DATA CATEGORIES
    # =========================================================================
    add_heading_1(doc, "5. Complete Directory of the 10 Census Data Categories & Official Table Citations")

    add_body(
        doc,
        "Below is the reference directory of all 10 Census of Agriculture topic groups in AgCensus IQ alongside their official Statistics Canada table citations:"
    )

    add_styled_table(
        doc,
        ["Topic Group", "Official StatCan Tables", "What You Can Look Up in This Category"],
        [
            [
                "1. Farm Types & Industry",
                "32-10-0231-01\n32-10-0403-01",
                "Total census farms and plain-English primary farm specializations across 10 major and 14 detailed commodity sectors: Grain & Oilseed (Soybean, Corn, Wheat, Canola), Dairy, Beef & Feedlots, Hogs & Pigs, Poultry & Eggs, Sheep & Goats, Fruit & Tree Nuts, Vegetables & Melons, Greenhouse & Nursery, Hay & Maple, and Equine/Bees/Mixed."
            ],
            [
                "2. Land Use & Farm Area Size",
                "32-10-0232-01 to 0234-01\n32-10-0153-01\n32-10-0249-01",
                "Farm area brackets (Under 10 acres up to 3,520+ acres), Total Farm Area, Average Farm Size, Land in Crops, Summerfallow, Tame & Natural Pasture, Woodlands & Wetlands, and Land Tenure (Owned vs. Rented/Leased, Cash Rent, Crop Share)."
            ],
            [
                "3. Field Crops, Grains & Oilseeds",
                "32-10-0309-01\n32-10-0154-01\n32-10-0416-01",
                "Farms reporting and total acres grown for Grain Corn, Soybeans, Wheat (Spring, Winter, Durum), Canola, Barley, Oats, Mixed Grains, Rye, Dry Peas, Lentils, Dry Beans, Alfalfa & Mixtures, Other Tame Hay, Silage Corn, Sugar Beets, and Potatoes."
            ],
            [
                "4. Fruit, Vegetables, Greenhouses & Maple",
                "32-10-0355-01 to 0358-01\n32-10-0236-01",
                "Field Vegetables (Sweet corn, Tomatoes, Carrots, Onions, Peppers, Pumpkins), Fruits/Berries/Vineyards (Apples, Grapes, Peaches, Strawberries, Blueberries), Sod/Nursery/Christmas trees, Maple syrup taps, and Greenhouse area (sq. ft.)."
            ],
            [
                "5. Livestock, Poultry & Apiculture",
                "32-10-0370-01 to 0378-01\n32-10-0160-01",
                "Farms reporting and total inventory for Cattle & Calves, Dairy Cows, Beef Cows, Feedlot Steers, Pigs (Sows, Weaners, Grower/Finishers), Sheep & Lambs, Goats, Horses, Hens & Chickens (Broilers vs. Layers), Turkeys, and Honeybee colonies."
            ],
            [
                "6. Farm Capital, Revenues & Expenses",
                "32-10-0237-01 to 0241-01\n32-10-0161-01 to 0164-01",
                "Farm Capital brackets, Total Capital ($), Land & Building Value per Acre ($/acre), 11 Gross Farm Revenue brackets, Gross Receipts ($), Operating Expenses ($), Net Cash Operating Income ($), Net Operating Margin (%), and Paid Agricultural Labour."
            ],
            [
                "7. Operator Demographics, Legal & Succession",
                "32-10-0381-01\n32-10-0382-01\n32-10-0244-01\n32-10-0399-01\n32-10-0401-01",
                "Total Operators, Male vs. Female share, Age brackets (Under 35, 35–54, 55+), Average Age, Legal Operating Structures, Formal Written Succession Plans, and Official Household Income & Education Cross-Tabulations."
            ],
            [
                "8. Precision Tech & Renewable Energy",
                "32-10-0379-01\n32-10-0380-01\n32-10-0246-01",
                "Auto-Steer GPS, GIS Mapping, Variable-Rate Inputs, Drones, Soil Sample Testing, Slow-Release Fertilizer, Robotic Milking, Automated Feeding, and On-Farm Solar, Wind, and Bioenergy systems."
            ],
            [
                "9. Soil Stewardship, Tillage & Manure",
                "32-10-0367-01 to 0369-01",
                "No-Till / Zero-Till Seeding, Conservation Tillage, Conventional Tillage, Solid/Composted & Liquid Manure, Commercial Fertilizer & Lime, Winter Cover Crops, Windbreaks, and Rotational Grazing."
            ],
            [
                "10. Direct-to-Consumer Sales & Organic",
                "32-10-0242-01\n32-10-0243-01",
                "Farms selling directly to consumers (Farm-gate stands, Farmers' markets, CSA boxes, Value-added products) and Certified / Transitional Organic operations."
            ],
        ],
        col_widths=[1.5, 1.3, 4.0],
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 6: 6 PRACTICAL OFA WORKFLOWS & RECIPES
    # =========================================================================
    add_heading_1(doc, "6. Practical OFA Playbooks: 6 Common Real-World Workflows")

    add_heading_2(doc, "Playbook 1: Pulling a Ready-to-Send County or OFA Zone Workbook & PDF Fact Sheet")
    add_bullet(
        doc,
        "1. Click 'Profiles 2.0' (bottom icon on the left rail) ",
        "or type your County or OFA Zone (e.g., 'Huron' or 'OFA Zone 7') directly into the top Pickled Bluewood search bar."
    )
    add_bullet(
        doc,
        "2. Click 'Download Excel (.xlsx)' (OFA Crimson button) ",
        "to download a 9-tab Excel workbook containing Executive KPIs, Township comparisons, 2018–2025 OMAFA Farm Cash Receipts, Crop Yields, Agri-Food Businesses, Farmland Tax & Prime Soil, Rural Broadband, and all 609 Ag Census rows (2006–2021)."
    )
    add_bullet(
        doc,
        "3. Click 'Download PDF Fact Sheet' ",
        "right beside it for a 2-page executive PDF handout ready for county federation meetings, MPPs, or municipal councillors."
    )

    add_heading_2(doc, "Playbook 2: Explaining Farm Cost Pressures & Agri-Food Commuting With Net-Score Bridges")
    add_bullet(
        doc,
        "1. Open Profiles 2.0 -> Tab 3 ('3. Farm Cash Receipts') ",
        "to show the 100%-reconciled 2020 Census Operating Net-Score Bridge (what share of Gross Farm Receipts is absorbed by Operating Expenses vs. Net Cash Operating Margin)."
    )
    add_bullet(
        doc,
        "2. Switch to Tab 5 ('5. Businesses & Day/Night Jobs') ",
        "to show the 2021 Agri-Food Workforce Commuter Bridge comparing local Place-of-Work agri-food jobs against resident agri-food workers."
    )

    add_heading_2(doc, "Playbook 3: Defending Prime Farmland & Fair Property Taxation in Municipal Planning")
    add_bullet(
        doc,
        "1. Open Profiles 2.0 -> Tab 6 ('6. Tax, Prime Soil & Broadband') ",
        "to pull exact CLI Class 1–3 Prime Agricultural Soil acreage, Farmland Current Value Assessment (CVA), and farmland's share of the municipal property tax levy."
    )
    add_bullet(
        doc,
        "2. Open Ag Explorer -> 'Multi-Census Structural Trajectory (1976–2021)' ",
        "and toggle the SVG line chart between 'Farmland Acres', 'Cropland Acres', and 'Total Capital ($)' to visualize 45-year structural shifts."
    )

    add_heading_2(doc, "Playbook 4: Screening Commercial Farms With Exact Mathematical Joint Bounds")
    add_bullet(
        doc,
        "1. Open Ag Drilldown ",
        "and select Filter 1 = 'Grain & Oilseed' and Filter 2 = '$500,000 and over (Commercial Scale)'."
    )
    add_bullet(
        doc,
        "2. Export the Briefing Slide ",
        "by clicking 'Download Map (PNG)' for an 1800×1125 OFA map graphic reporting the exact Fréchet–Hoeffding joint bounds and Bottom Line takeaway—or switch to Tab 2 ('Official StatCan Cross-Tabulations') for exact provincial Farm Specialization × Household Income matrices."
    )

    add_heading_2(doc, "Playbook 5: Building a Custom Multi-Factor Index (With Polarity Control)")
    add_bullet(
        doc,
        "1. Open AgScore ",
        "and click one of the 4 OFA Policy Presets (such as 'Soil Stewardship & Climate BMP Leadership' or 'Generational Renewal & Young Farmer Vitality')."
    )
    add_bullet(
        doc,
        "2. Flip '↑ High / ↓ Low' Polarity & Export ",
        "on any slot where lower values should score higher (e.g., younger operator age), review Leading (OFA Crimson) vs. Strong (Pickled Bluewood) counties, and click 'Print / PDF' or 'Export CSV'."
    )

    add_heading_2(doc, "Playbook 6: Exporting Peer Comparison & Crop Belt Graphics for Presentations")
    add_bullet(
        doc,
        "1. In Ag Compare or Ag Belts Studio, ",
        "click 'Download Visual (PNG)' or 'Download Social Poster (PNG)' (in Dark Editorial or Light OFA Report mode) to save 1800×1125 high-DPI visuals complete with declarative headlines and Bottom Line takeaway strips."
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 7: PLAIN-LANGUAGE GLOSSARY & FAQ
    # =========================================================================
    add_heading_1(doc, "7. Plain-Language Glossary of Census & Agri-Food Terms")

    add_styled_table(
        doc,
        ["Term / Symbol", "Plain-Language Definition"],
        [
            [
                "Census Farm",
                "Any agricultural operation producing at least one agricultural product (crops, livestock, poultry, greenhouse/nursery products, maple syrup, honey, Christmas trees) intended for sale."
            ],
            [
                "OFA Regional Zones (Zone 1–Zone 15)",
                "The Ontario Federation of Agriculture's 15 regional governance and member representation zones covering all 49 Ontario Counties & Districts (including township-level SDG allocation between Zones 11 and 14)."
            ],
            [
                "Primary Farm Specialization (NAICS)",
                "Classifies a farm by the commodity group generating more than 50% of estimated gross agricultural receipts—translated into plain-English names across all AgCensus IQ charts."
            ],
            [
                "Counties & Districts (CD) / Townships (CCS)",
                "Statistics Canada's geographic hierarchy: CAR = Agricultural Region (5 in Ontario); CD = County, Regional Municipality, or District (49 in Ontario, 282 agricultural CDs across Canada); CCS = Local Township or Municipality (414 in Ontario)."
            ],
            [
                "Net-Score Bridge",
                "A 100%-reconciled visual bar summary comparing offsetting inflows and outflows (Gross Receipts minus Operating Expenses = Net Cash Income; Daytime Jobs minus Resident Workers = Net Commuter Balance)."
            ],
            [
                "Exact Joint Bounds [Min–Max]",
                "In Ag Drilldown Mode 1, the exact Fréchet–Hoeffding mathematical floor and ceiling on how many farms simultaneously belong to 2 or 3 selected Census categories, computed strictly from published counts."
            ],
            [
                "OMAFA Farm Cash Receipts (FCR)",
                "Annual calendar-year cash receipts from marketings of crops, livestock, dairy, poultry, and direct program payments allocated to Ontario counties by OMAFA (2018–2025 Prelim in Profiles 2.0)."
            ],
            [
                "CLI Prime Agricultural Soil (Classes 1–3)",
                "Canada Land Inventory mineral soil capability classes 1, 2, and 3—Ontario's highest-capability agricultural land base."
            ],
            [
                "Suppressed ('x') & Unreliable ('F')",
                "Official Statistics Canada flags indicating a cell is withheld to protect farm confidentiality ('x') or has excessive sample dispersion ('F'). Never treated as zero."
            ],
            [
                "Zero Denominator ('—' or 'N/A')",
                "Displayed on per-farm averages or ratios when 0 farms in that local geography report the underlying commodity."
            ],
        ],
        col_widths=[2.05, 4.75],
    )

    add_callout_box(
        doc,
        "Deterministic Empirical Pipeline for Future Census & OMAFA Updates",
        [
            "All datasets in AgCensus IQ and OFA Profiles 2.0 are generated by auditable Python scripts in data-pipeline/. When Statistics Canada releases the 2026 Census of Agriculture tables—or when OMAFA, MMAH, and ISED publish annual county updates—re-running the pipeline refreshes the JSON bundles, 65 Excel workbooks, 65 PDF Fact Sheets, UI screenshots, and this Word User Guide automatically."
        ],
        box_type="tip",
    )

    doc.save(str(OUTPUT_DOCX))
    print(f"Successfully generated Word User Guide at: {OUTPUT_DOCX} ({OUTPUT_DOCX.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    build_user_guide()
