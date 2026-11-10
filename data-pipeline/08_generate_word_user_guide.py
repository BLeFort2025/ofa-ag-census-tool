"""
08_generate_word_user_guide.py
Generates a comprehensive, plain-language, richly illustrated Microsoft Word (.docx)
User Guide for AgCensus IQ (OFA Edition) in AgCensus_IQ_OFA_User_Guide.docx.
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

# Brand colors
NAVY_HEX = "0F3D6E"
GREEN_HEX = "328475"
SLATE_HEX = "334155"
LIGHT_BG_HEX = "F1F5F9"
CALLOUT_BG_HEX = "EBF3F9"
TIP_BG_HEX = "EAF4F2"
BORDER_HEX = "CBD5E1"

NAVY_RGB = RGBColor(0x0F, 0x3D, 0x6E)
GREEN_RGB = RGBColor(0x32, 0x84, 0x75)
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
    """Adds a shaded callout box (Plain-Language Summary or OFA Advocacy Tip)."""
    bg = CALLOUT_BG_HEX if box_type == "info" else TIP_BG_HEX
    accent_rgb = NAVY_RGB if box_type == "info" else GREEN_RGB
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_background(cell, bg)
    set_cell_margins(cell, top=140, bottom=140, left=200, right=200)

    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(4)
    run_title = p.add_run(title)
    run_title.bold = True
    run_title.font.size = Pt(10.5)
    run_title.font.color.rgb = accent_rgb

    for idx, text in enumerate(body_paragraphs):
        bp = cell.add_paragraph()
        bp.paragraph_format.space_before = Pt(2)
        bp.paragraph_format.space_after = Pt(2 if idx < len(body_paragraphs) - 1 else 0)
        r = bp.add_run(text)
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
    r_cap.italic = True
    r_cap.font.size = Pt(9)
    r_cap.font.color.rgb = MUTED_RGB


def add_heading_1(doc: Document, text: str):
    h = doc.add_heading(level=1)
    h.paragraph_format.space_before = Pt(16)
    h.paragraph_format.space_after = Pt(6)
    r = h.add_run(text)
    r.font.name = "Calibri"
    r.font.size = Pt(17)
    r.font.bold = True
    r.font.color.rgb = NAVY_RGB
    return h


def add_heading_2(doc: Document, text: str):
    h = doc.add_heading(level=2)
    h.paragraph_format.space_before = Pt(12)
    h.paragraph_format.space_after = Pt(4)
    r = h.add_run(text)
    r.font.name = "Calibri"
    r.font.size = Pt(13.5)
    r.font.bold = True
    r.font.color.rgb = GREEN_RGB
    return h


def add_heading_3(doc: Document, text: str):
    h = doc.add_heading(level=3)
    h.paragraph_format.space_before = Pt(8)
    h.paragraph_format.space_after = Pt(2)
    r = h.add_run(text)
    r.font.name = "Calibri"
    r.font.size = Pt(11.5)
    r.font.bold = True
    r.font.color.rgb = NAVY_RGB
    return h


def add_body(doc: Document, text: str, bold_prefix: str = None):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.line_spacing = 1.15
    if bold_prefix:
        rb = p.add_run(bold_prefix)
        rb.bold = True
        rb.font.size = Pt(10.5)
        rb.font.color.rgb = SLATE_RGB
    r = p.add_run(text)
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
        rb.bold = True
        rb.font.size = Pt(10)
        rb.font.color.rgb = SLATE_RGB
    r = p.add_run(text)
    r.font.size = Pt(10)
    r.font.color.rgb = SLATE_RGB
    return p


def build_user_guide():
    doc = Document()

    # Page margins (0.8 inches all around for a clean modern manual layout)
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # Set base normal font
    style_normal = doc.styles["Normal"]
    style_normal.font.name = "Calibri"
    style_normal.font.size = Pt(10.5)

    # =========================================================================
    # COVER / TITLE PAGE
    # =========================================================================
    p_badge = doc.add_paragraph()
    p_badge.paragraph_format.space_before = Pt(20)
    p_badge.paragraph_format.space_after = Pt(4)
    r_badge = p_badge.add_run("ONTARIO FEDERATION OF AGRICULTURE (OFA)  •  OFFICIAL USER MANUAL")
    r_badge.bold = True
    r_badge.font.size = Pt(10)
    r_badge.font.color.rgb = GREEN_RGB

    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(6)
    r_title = p_title.add_run("AgCensus IQ (OFA Edition)\nComplete Plain-Language User Guide")
    r_title.bold = True
    r_title.font.size = Pt(24)
    r_title.font.color.rgb = NAVY_RGB

    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(12)
    r_sub = p_sub.add_run(
        "A Step-by-Step Guide to Exploring, Comparing, Ranking, Mapping, and Exporting Canadian & Ontario "
        "Agri-Food Intelligence — Including OFA County & Zone Profiles 2.0"
    )
    r_sub.font.size = Pt(12)
    r_sub.font.color.rgb = MUTED_RGB

    add_callout_box(
        doc,
        "At a Glance: What Is AgCensus IQ (OFA Edition)?",
        [
            "AgCensus IQ is a purpose-built agricultural intelligence and policy platform created for the Ontario Federation of Agriculture (OFA). It turns 49 massive Statistics Canada Census of Agriculture tables—plus OMAFA Farm Cash Receipts, Crop Yields, Municipal Farmland Property Tax (FIR), CLI Prime Soil, and CRTC Rural Broadband datasets—into an instant, visual, point-and-click workspace.",
            "Whether you are an OFA Policy Analyst writing a provincial submission, a Member Service Representative (MSR) preparing for a County Federation meeting, or a local board director speaking to municipal council about protecting farmland, this tool gives you official, rock-solid empirical numbers, ready-to-send Excel workbooks, and printable PDF Fact Sheets in seconds."
        ],
        box_type="info",
    )

    add_styled_table(
        doc,
        ["Platform Feature", "What Is Included in AgCensus IQ (OFA Edition)"],
        [
            ["Official Data Sources", "100% Empirical Statistics Canada Census of Agriculture (Tables 32-10-0153-01 to 32-10-0445-01, plus Cross-Tabulations 32-10-0399-01 & 32-10-0401-01) and OMAFA / MMAH FIR / CLI / ISED Datasets"],
            ["Historical Span", "2021 Census + 2016 Benchmark Deltas + 45-Year Historical Trend Series (1976–2021) + 2018–2025 OMAFA Farm Cash Receipts & Yields"],
            ["Geographic Coverage", "2,113 Geographies across Canada: 1 Country, 10 Provinces, 72 Agricultural Regions (CAR), 282 Counties (CD), and 1,748 Townships (CCS)"],
            ["Ontario & OFA Coverage", "All 5 Ontario Agricultural Regions, all 15 OFA Regional Zones (Zone 1–Zone 15), all 49 Ontario Counties mapped to OFA Federations, and all 414 Ontario Townships"],
            ["Agricultural Metrics", "244 Official Census Characteristics organized into 10 plain-language categories, plus 609-row County & Zone Ag Census Profiles"],
            ["Core Analytical Modules", "9 Left-Rail Modules (Snapshot, Explorer, Drilldown, Compare, Ranker, Ag Belts, AgScore, GeoSearch, Profiles 2.0) + Multi-Area PDF Report Builder + AI Policy Briefs"],
            ["OFA Profiles 2.0 Deliverables", "65 Multi-Sheet Excel Workbooks (.xlsx) & 65 Two-Page Printable PDF Fact Sheets (Ontario + 15 OFA Zones + 49 Counties) with bulk .zip downloads"],
        ],
        col_widths=[2.1, 4.7],
    )

    add_screenshot(
        doc,
        "01_snapshot_ontario.png",
        "Figure 1: AgCensus IQ (OFA Edition) opens directly to an executive one-screen dashboard with all 9 analytical modules along the left-hand rail."
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 1: GETTING STARTED & SCREEN LAYOUT
    # =========================================================================
    add_heading_1(doc, "1. Getting Started & Understanding the Screen Layout")

    add_body(
        doc,
        "AgCensus IQ is designed around a 'single-screen' philosophy. Unlike traditional government data portals where you have to scroll through endless tables or download giant raw CSV files just to answer a simple question, AgCensus IQ fits your slicers, charts, leaderboards, and maps onto your screen at once."
    )

    add_heading_2(doc, "1.1 How to Open the Tool (Hosted Cloud App or Local Desktop)")
    add_bullet(
        doc,
        "On the Hosted Web App (Streamlit Cloud): ",
        "Open the shared OFA Streamlit Cloud link in any modern browser (Edge, Chrome, Firefox, or Safari). Notice the collapsible bar right at the top of the hosted page ('OFA County & Zone Profiles 2.0 — Direct Excel (.xlsx) & PDF Downloads'), which also lets you download individual County/Zone Excel workbooks, printable PDFs, or the complete 65-file ZIP archive directly from the cloud wrapper."
    )
    add_bullet(
        doc,
        "When Running Locally on Your Computer: ",
        "Open a terminal or PowerShell window in the project folder, type npm run dev, and press Enter. Within 1 second, the tool will be live in your browser at http://localhost:5173."
    )

    add_heading_2(doc, "1.2 The Four Parts of the Screen")
    add_body(
        doc,
        "No matter which module you are using, the screen is always organized into four consistent areas so you never get lost:"
    )

    add_bullet(
        doc,
        "1. The Left-Hand Icon Rail (All 9 Main Modules): ",
        "Running down the far-left edge of the screen is a narrow vertical bar with the OFA logo at the top. Clicking any of the 9 icons switches your workspace immediately between: (1) Snapshot, (2) Explorer, (3) Drilldown, (4) Compare, (5) Ranker, (6) Ag Belts, (7) AgScore, (8) GeoSearch, and (9) Profiles 2.0. At the bottom of this rail are three helper buttons: (?) Guided Walkthrough, (A) AI Policy Brief Drawer, and Data Provenance Notes."
    )
    add_bullet(
        doc,
        "2. The Top Quick-Benchmark & Omnibox Header (Navy Blue Bar): ",
        "Across the very top of the screen are one-click shortcut pills for frequently used benchmarks (Canada, Ontario, Huron, Wellington, Perth, Chatham-Kent, Oxford), plus a Global Search Omnibox where you can type any County, Township, OFA Regional Zone (such as 'OFA Zone 7' or 'Zone 15'), or farm topic (such as 'Beef', 'Soybeans', or 'Solar'). On the right side are quick buttons for 'Multi-Area PDF Report', '+ AI Policy Brief', and '? Guide'."
    )
    add_bullet(
        doc,
        "3. The Left Control Column (Geography & Variable Slicers): ",
        "Just inside the workspace on the left side is where you choose WHICH geography (or geographies) and WHICH agricultural topic you want to inspect. Changes here update all charts, tables, and maps instantaneously."
    )
    add_bullet(
        doc,
        "4. The Main Analytical Canvas (Center & Right): ",
        "The large central and right-hand area displays your visual results—whether that is the 8-card County Snapshot, distribution gauges, joint-bounds screening tables, head-to-head benchmarks, ranked leaderboards, interactive choropleth maps, or the 8-tab OFA Profiles 2.0 viewer."
    )

    add_callout_box(
        doc,
        "OFA Pro Tip: Your Selected Geography Follows You Across Modules!",
        [
            "If you select 'Huron County' in Ag Snapshot and then click 'Explorer', 'Compare', or 'Profiles 2.0' on the left-hand menu, the tool remembers Huron County automatically. Even better, typing 'OFA Zone 7' or 'Zone 15' into the top search bar jumps straight to that OFA Regional Zone inside Profiles 2.0!"
        ],
        box_type="tip",
    )

    # =========================================================================
    # SECTION 2: UNDERSTANDING GEOGRAPHIES & OFFICIAL STATUS CODES
    # =========================================================================
    add_heading_1(doc, "2. Understanding Geographies, OFA Zones & Official Data Codes")

    add_body(
        doc,
        "One of the biggest frustrations with Statistics Canada tables is figuring out what codes like 'CAR', 'CD', and 'CCS' mean in everyday Ontario farm language—and how they map to OFA's 15 Regional Zones and County Federations. AgCensus IQ translates every code into plain English automatically."
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
                "2. Provinces & Territories",
                "Each individual Canadian province (for inter-provincial policy benchmarking).",
                "10",
                "1",
                "Ontario (48,346 farms), Quebec, Alberta, Saskatchewan"
            ],
            [
                "3. Census Agricultural Regions (CAR)",
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
                "4. Counties / Census Divisions (CD)",
                "Your County, Regional Municipality, Single-Tier City, or Northern District.",
                "282",
                "49",
                "Huron County (2,564 farms), Wellington County (2,617 farms), Chatham-Kent (2,412 farms)"
            ],
            [
                "5. Townships / Subdivisions (CCS)",
                "Your local lower-tier Township or Municipality inside a county.",
                "1,748",
                "414",
                "South Huron (253 farms), Mapleton (638 farms), North Perth (585 farms)"
            ],
        ],
        col_widths=[1.45, 1.85, 0.65, 0.65, 2.2],
    )

    add_callout_box(
        doc,
        "In Plain Language: What Do 'Suppressed (x)', 'Unreliable (F)', and '— / N/A' Mean?",
        [
            "AgCensus IQ follows a strict 100% empirical, zero-fabrication policy. Rather than guessing or inventing numbers when Statistics Canada withholds a cell, the tool distinguishes three exact official conditions:",
            "• 'x' — Suppressed for Confidentiality: Under the federal Statistics Act, if a local township has only a handful of farms growing a crop or in a revenue bracket, Statistics Canada hides the number so neighbours or competitors cannot deduce an individual farm family's private finances. Step up to the County (CD) level to see unsuppressed totals.",
            "• 'F' — Too Unreliable to Be Published: Used on 2021 Census sample/linkage estimates when sampling variability is too high to meet Statistics Canada's release standard.",
            "• '—' or 'N/A' — Zero Reporting Denominator: Displayed on average per-farm metrics (such as Average Pigs per Farm) when 0 farms in that township report that commodity (avoiding division by zero)."
        ],
        box_type="info",
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 3: STEP-BY-STEP GUIDE TO MODULES 1 TO 7
    # =========================================================================
    add_heading_1(doc, "3. Step-by-Step Guide to Analytical Modules 1 to 7")

    # -------------------------------------------------------------------------
    # MODULE 1: AG SNAPSHOT
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.1 Module 1: Ag Snapshot (Executive Regional Portrait)")
    add_body(
        doc,
        "Think of Ag Snapshot as your '1-Page Executive Briefing' for any single geography in Canada. Whenever someone asks, 'Tell me about agriculture in Huron County (or Ontario, or Mapleton Township),' this is the first screen to open."
    )

    add_screenshot(
        doc,
        "01_snapshot_ontario.png",
        "Figure 2: Ag Snapshot showing the executive regional portrait, 8 core analytical cards, and 2016–2021 change badges."
    )

    add_heading_3(doc, "What Each of the 8 Snapshot Cards Tells You:")
    add_bullet(
        doc,
        "Card 1 — Census Farms & Farmland: ",
        "Shows total census farms in 2021, total farmland area in acres, average farm size in acres, percentage change since 2016, and the split between Cropland (%) and Pasture/Woodland/Natural land (%)."
    )
    add_bullet(
        doc,
        "Card 2 — Operators & Succession: ",
        "Shows average operator age, female operator share (%), Young Operators under 35 vs. 55+, and the share of farms with a formal Written Succession Plan."
    )
    add_bullet(
        doc,
        "Card 3 — Top Farm Types / NAICS: ",
        "Automatically ranks the top 5 agricultural industries in that region by share of farms, showing both percentage share and exact farm count."
    )
    add_bullet(
        doc,
        "Card 4 — Land Tenure & Legal Structure: ",
        "Shows Owned vs. Rented/Leased farmland share alongside Sole Proprietorships, Partnerships, Family Corporations, and Non-Family Corporations."
    )
    add_bullet(
        doc,
        "Card 5 — Top Field Crops & Horticulture: ",
        "Automatically identifies and ranks the top 5 field crops grown in that region by acreage, plus summary boxes for Fruit Acres, Field Vegetable Acres, and Greenhouse square footage."
    )
    add_bullet(
        doc,
        "Card 6 — Livestock, Poultry & Bees: ",
        "Displays Census Day animal inventories: Total Cattle & Calves (Dairy vs. Beef Cows), Total Pigs (with average herd size per reporting farm), Hens & Chickens, and Sheep / Honeybee colonies."
    )
    add_bullet(
        doc,
        "Card 7 — Farm Revenues & Expenses: ",
        "Shows Total Gross Farm Receipts ($), 2016–2021 growth, Average Gross Revenue per Farm, Average Operating Expenses per Farm, and Net Cash Operating Income & Margin (%)."
    )
    add_bullet(
        doc,
        "Card 8 — Farm Capital, Farmland Value & Sustainability Tech: ",
        "Shows Total Farm Capital ($), average Land & Building value per acre ($/acre), and adoption rates for No-Till Seeding, Winter Cover Crops, Auto-Steer GPS Guidance, Renewable Energy, and Direct-to-Consumer Sales."
    )

    add_heading_3(doc, "Special Interactive Buttons in Ag Snapshot:")
    add_bullet(
        doc,
        "The '+' Button on Every Card Header: ",
        "Clicking '+' on any card jumps directly to Ag Explorer with that exact statistical category loaded."
    )
    add_bullet(
        doc,
        "'Click here to show map' (Geographic Context & Nearby Peers): ",
        "Opens a pop-up Canada-Only polygon map highlighting your selected county or township alongside the 12 closest neighbouring jurisdictions measured in kilometres (km)."
    )
    add_bullet(
        doc,
        "'Print / Save PDF' & 'Download Data (Excel CSV)': ",
        "Prints a clean 1-Page Executive County Factsheet or exports all underlying metrics to Excel."
    )

    add_screenshot(
        doc,
        "01b_snapshot_map_modal.png",
        "Figure 3: Clicking 'Click here to show map' in Ag Snapshot opens the Canada-Only polygon map and ranks nearby peer counties by distance."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 2: AG EXPLORER
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.2 Module 2: Ag Explorer (Deep Category, Denominator & 45-Year Trend Analyzer)")
    add_body(
        doc,
        "When you want to inspect every sub-category inside one of the 10 Census variable groups for a selected geography—complete with exact reference denominators, 2016–2021 percentage deltas, aggregate totals, and 45-year historical curves—click 'Explorer' (the lightbulb icon) on the left-hand rail."
    )

    add_screenshot(
        doc,
        "02_explorer_bars.png",
        "Figure 4: Ag Explorer displaying characteristic distributions, reference denominator base, 2016–2021 deltas, and the Aggregate Statistics sidebar."
    )

    add_heading_3(doc, "How to Use Ag Explorer Step-by-Step:")
    add_bullet(
        doc,
        "1. Pick Any Geography & Variable Group (Left Panel): ",
        "Choose your Country, Province, Agricultural Region, County, or Township at the top-left, then pick 1 of the 10 Census Variable Groups and click a specific Characteristic Breakdown (for example, 'Major Farm Types 4-Digit NAICS' vs. 'Detailed Farm Types 6-Digit NAICS')."
    )
    add_bullet(
        doc,
        "2. Check the 'Base' Reference Denominator: ",
        "Both the bottom-left 'Reference Denominator (Base)' box and the 'Base ?' button at the top of the chart explicitly display which official denominator is used to calculate percentages (for example, Total Census Farms = 48,346, or Total Prepared Seeding Land for Tillage %)."
    )
    add_bullet(
        doc,
        "3. Switch Between the 4 Visual Modes (Top-Center Icon Buttons): ",
        "(a) Horizontal Bar Chart (ranked counts, shares, and 2016–2021 change badges); (b) Proportional Share View (renders a Donut chart for mutually exclusive categories like NAICS or Revenue Brackets, and automatically switches to individual 0–100% Adoption Gauges for multi-response tables like Precision Ag Tech, Renewable Energy, Soil Conservation, or Direct Marketing where a single farm can adopt multiple practices so shares legitimately exceed 100%); (c) 45-Year Historical Trend Series (1976–2021) across 10 Census waves; and (d) Structured Data Table & CSV."
    )
    add_bullet(
        doc,
        "4. Review the Right-Hand 'Aggregate Statistics' Column: ",
        "Displays companion totals, averages, farmland values ($/acre), operating revenues, margins, and operator age alongside your distribution bars."
    )

    add_screenshot(
        doc,
        "02b_explorer_historical.png",
        "Figure 5: Switching Ag Explorer to the 45-Year Historical (1976–2021) mode plots long-term structural trends across 10 Census of Agriculture waves."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 3: AG DRILLDOWN
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.3 Module 3: Ag Drilldown (Exact Joint Bounds Screening & Official StatCan Cross-Tabs)")
    add_body(
        doc,
        "Standard public Census tables publish one dimension at a time (for example, how many Oilseed & Grain farms are in Oxford County, and separately how many farms earn $500,000+ in receipts). Ag Drilldown (the funnel icon) gives analysts two 100% empirical, zero-guesswork modes to analyze multi-characteristic intersections without ever inventing synthetic numbers."
    )

    add_screenshot(
        doc,
        "03_drilldown.png",
        "Figure 6: Ag Drilldown Mode 1 — Multi-Criteria Geography Screening & Exact Fréchet–Hoeffding Joint Farm Bounds ([Guaranteed Min – Max Possible])."
    )

    add_heading_3(doc, "Mode 1 — Multi-Criteria Geography Screening & Exact Joint Bounds:")
    add_bullet(
        doc,
        "Combine Up to 3 Empirical Filters + Minimum Share Thresholds: ",
        "Across the top row, choose Filter 1 — Farm Type (NAICS), Filter 2 — Revenue Scale (e.g., Commercial $500K+, $1M+, or $2M+), and Filter 3 — Operating Structure & Practice (e.g., Written Succession Plan, Auto-Steer GPS, Cover Crops, No-Till, Organic, or Direct Sales). Enter a 'Min Share Threshold (%)' in any box to screen out geographies below your target threshold."
    )
    add_bullet(
        doc,
        "Exact Fréchet–Hoeffding Mathematical Joint Bounds ([Min–Max]): ",
        "Whenever 2 or 3 filters are selected, Ag Drilldown computes the exact mathematical minimum and maximum number of farms in every county that can simultaneously satisfy all selected criteria—derived strictly from official marginal counts: Guaranteed Min = max(0, N1 + N2 - Total) and Max Possible = min(N1, N2). You can even toggle the choropleth map between 'Max Bound' and 'Min Floor', and suppressed ('x' / 'F') areas are tracked explicitly rather than treated as zeros."
    )

    add_heading_3(doc, "Mode 2 — Official Statistics Canada Cross-Tabulations (32-10-0401-01 & 32-10-0399-01):")
    add_bullet(
        doc,
        "True Published Joint Tables (Province & National Level): ",
        "Click the second tab at the top ('2. Official StatCan Cross-Tabulations') to explore Statistics Canada's official Census-to-Socioeconomic linkage matrices: Farm Type × Household Total Income Brackets (Table 32-10-0401-01) and Farm Type × Operator Highest Educational Attainment (Table 32-10-0399-01). Toggle effortlessly between Row %, Exact Counts, and Column %, and export directly to CSV."
    )

    add_screenshot(
        doc,
        "03b_drilldown_crosstabs.png",
        "Figure 7: Ag Drilldown Mode 2 — Official Statistics Canada Cross-Tabulations (Farm Type × Household Income & Operator Education)."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 4: AG COMPARE
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.4 Module 4: Ag Compare (Head-to-Head Benchmarking & Peer Matcher)")
    add_body(
        doc,
        "When you want to benchmark Geography A vs. Geography B head-to-head—or automatically discover which other county in Ontario or Canada is the closest structural peer to yours—click 'Compare' on the left rail."
    )

    add_screenshot(
        doc,
        "04_compare.png",
        "Figure 8: Ag Compare displaying Perth vs. Huron head-to-head bars, green Winner Dots, and the scale-free 'Find Closest Match' peer engine."
    )

    add_heading_3(doc, "Key Features of Ag Compare:")
    add_bullet(
        doc,
        "Automated 'Find Closest Match' & 'Most Alike Pair' Engine: ",
        "Click 'Find Closest Match' or 'Most Alike Pair in Ontario' in the header! Ag Compare computes standardized Z-score similarity across scale-free structural shares (commodity mix, operator profile, technology adoption, farmland value per acre, and margins—never distorted by raw county size) to surface the top 5 peer matches, complete with 'Why They Match' and 'Biggest Gap' callout badges."
    )
    add_bullet(
        doc,
        "Green 'Winner Dots' (●) With Suppression Safeguards: ",
        "Places a crisp green dot (●) on whichever geography leads on each row. If either side is suppressed ('x' or 'F'), no misleading winner dot is awarded."
    )
    add_bullet(
        doc,
        "Flip Between Percentages & Counts + One-Click 1600×1000 Visual PNG: ",
        "Switch between Percentage Shares (%) and Exact Counts on the left, swap A <-> B with one click, or click 'Download Visual (PNG)', 'Print / PDF', or 'CSV' in the header."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 5: AG RANKER
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.5 Module 5: Ag Ranker (Custom Leaderboards Across All 244 Metrics)")
    add_body(
        doc,
        "Whenever someone asks, 'Which counties have the most Acres of Soybeans?', 'Where are the largest Cattle herds?', or 'Where does our county rank for Gross Farm Receipts ($)?' click 'Ranker' on the left rail."
    )

    add_screenshot(
        doc,
        "05_ranker_acres.png",
        "Figure 9: Ag Ranker showing the 6-button Unit Filter (All 244, Acres, Head/Herd, Dollars $, Farms), Extra Reference Column, and Regional Map."
    )

    add_heading_3(doc, "How to Customize What You Rank in Ag Ranker:")
    add_bullet(
        doc,
        "1. Filter by Unit Measure (All 244, Acres, Head / Herd, Dollars $, Farms, Totals / Avgs): ",
        "Click one of the 6 unit buttons in the left panel to narrow the metric list immediately to Acreage totals, Livestock head counts, Dollar revenues/capital, or Farm counts."
    )
    add_bullet(
        doc,
        "2. One-Click 'Switch Measure for This Topic' Pills: ",
        "Whenever you pick a commodity (like Cattle, Pigs, Soybeans, or Corn), green pills appear right underneath so you can flip with one click between Total Acres / Total Head, Farms Reporting, and Average Size per Farm."
    )
    add_bullet(
        doc,
        "3. Customize the 'EXTRA COL:' Reference Column & Export PDF / PNG / CSV: ",
        "Above the leaderboard, pick any secondary reference column (Auto Paired Acres/Head/Farms, Total Farmland Acres, Land in Crops, Avg Farm Size, Gross Receipts, Avg Revenue/Farm, or Total Farms) and export via 'Download Map & Graph (PNG)', 'Print / Save PDF', or 'Download Data (Excel CSV)'."
    )
    add_bullet(
        doc,
        "4. Plain-English City Subtitles for Numbered Prairie & NL Divisions: ",
        "Numbered Census Divisions in Manitoba, Saskatchewan, Alberta, and Newfoundland & Labrador automatically display their major regional hub (e.g., 'Division No. 2 — Lethbridge / Brooks, AB')."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 6: AG BELTS & CLUSTER MAPS STUDIO
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.6 Module 6: Ag Belts & Cluster Maps Studio (1800×1125 Poster Generator)")
    add_body(
        doc,
        "Inspired by editorial data-journalism cartography, Ag Belts & Cluster Maps Studio generates publication-ready 1800×1125 maps across both National (all 282 agricultural Canadian Census Divisions) and Provincial (e.g., all 49 Ontario counties with a Northern Ontario inset) scopes."
    )

    add_screenshot(
        doc,
        "06_belts_dominant.png",
        "Figure 10: Ag Belts & Cluster Maps Studio in 'Dominant Belts' mode, mapping the #1 winning commodity belt across every Census Division."
    )

    add_heading_3(doc, "The 3 Visual Map Modes in Ag Belts Studio:")
    add_bullet(
        doc,
        "Mode 1 — Dominant Belts (Multi-Commodity Winner per County): ",
        "Colours every Census Division by its #1 dominant commodity within a selected belt family (Major Field Crop Belts by Acres, Broad NAICS Commodity Belts, Livestock Herd Belts, or Fruit/Berry/Vegetable Belts)."
    )
    add_bullet(
        doc,
        "Mode 2 — Single-Stat Cluster (5-Tier Quintile Hotspot Map): ",
        "Maps any of the 244 Census variables into 5 statistical quintile tiers to spotlight top regional production clusters."
    )
    add_bullet(
        doc,
        "Mode 3 — All-CD Heat Map (6-Tier Thermal Production Map): ",
        "Shades every Census Division reporting production across 6 continuous thermal colour tiers, with Dark Editorial (for social media/slides) and Light Report (for Word/print briefs) themes, non-overlapping perimeter callouts, and one-click 1800×1125 PNG download."
    )

    add_screenshot(
        doc,
        "06b_belts_heatmap.png",
        "Figure 11: Ag Belts & Cluster Maps Studio in 'All-CD Heat Map' mode showing full national production intensity."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 7: AGSCORE
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.7 Module 7: AgScore (Multi-Factor Weighted Index — 0 to 100)")
    add_body(
        doc,
        "AgScore lets you combine up to 4 different Census characteristics with custom weights—and custom directional polarity—into a single 0 to 100 Composite Index."
    )

    add_screenshot(
        doc,
        "07_agscore.png",
        "Figure 12: AgScore combining 4 weighted variables into a 0–100 Composite Index, with per-slot ↑ High / ↓ Low polarity toggles and PDF/CSV exports."
    )

    add_callout_box(
        doc,
        "In Plain Language: How Does AgScore Work (Including Polarity Inversion)?",
        [
            "1. Standardization: For each of the 4 characteristics you pick, AgScore computes the mean and spread across all qualifying geographies in view and converts each county's value into a Z-score and Normal Percentile from 0 to 100 (where 50 is average and 95+ is top tier).",
            "2. Directional Polarity ('↑ High' vs. '↓ Low'): Every Characteristic card has a '↑ High / ↓ Low' toggle button in its top-right corner! Leave it on '↑ High' when higher values should score higher (e.g., Cover Crop adoption %). Click it to flip to '↓ Low' when LOWER values should score higher (e.g., lower Average Operator Age, smaller farm size, or lower reliance on rented land).",
            "3. Weighted Combination & Export: Each slot's 0–100 score is multiplied by your chosen Weight and combined into a colour-coded 0–100 AgScore badge. Use 'Print / PDF' or 'Export CSV' at the top-right of the leaderboard to share your custom index."
        ],
        box_type="info",
    )

    add_heading_3(doc, "The 4 Built-In OFA Policy Presets:")
    add_bullet(
        doc,
        "1. Commercial Scale & Precision Ag Readiness: ",
        "Auto-Steer Guidance (1.0), Receipts $500K+ (0.8), Soil Sample Testing (0.8), and GIS Mapping (0.6)."
    )
    add_bullet(
        doc,
        "2. Soil Stewardship & Climate BMP Leadership: ",
        "No-Till Seeding (1.0), Winter Cover Crops (1.0), Soil Sample Testing (0.8), and Windbreaks / Shelterbelts (0.6)."
    )
    add_bullet(
        doc,
        "3. Generational Renewal & Young Farmer Vitality: ",
        "Operators Under 35 (1.0), Written Succession Plan (1.0), Direct-to-Consumer Marketing (0.6), and Female Operators (0.5)."
    )
    add_bullet(
        doc,
        "4. Farmland Capital Intensity & Tenure Pressure: ",
        "Capital $3.5M+ (1.0), Rented/Leased Area (0.9), Gross Receipts $2M+ (0.8), and Family Corporations (0.6)."
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 4: GEOSEARCH, PROFILES 2.0 & GLOBAL REPORTING TOOLS
    # =========================================================================
    add_heading_1(doc, "4. GeoSearch, OFA Profiles 2.0, Multi-Area Reports, AI Briefs & Maps")

    # -------------------------------------------------------------------------
    # MODULE 8: GEOSEARCH
    # -------------------------------------------------------------------------
    add_heading_2(doc, "4.1 Module 8: GeoSearch — Easy Area, OFA Zone & Data Finder")
    add_body(
        doc,
        "Not sure which County or OFA Regional Zone a rural township belongs to, or want to look up a farm keyword in plain English? Click 'GeoSearch' (the compass icon) on the left rail."
    )

    add_screenshot(
        doc,
        "08_geosearch.png",
        "Figure 13: GeoSearch (Easy Area & Data Finder) with hierarchy breadcrumbs, Combined Multi-Area Rollups, and the Instant Data & Topic Finder."
    )

    add_bullet(
        doc,
        "Search Any Township, County, or OFA Regional Zone (Zone 1–Zone 15): ",
        "Type a local municipality ('Mapleton', 'Powassan', 'Wainfleet'), a county, or an OFA Zone ('OFA Zone 7', 'Zone 15'). Matching OFA Regional Zones appear right at the top with a one-click jump into Profiles 2.0, while every township shows its full containment path (Ontario > CAR > County > Township) and OFA Federation badge."
    )
    add_bullet(
        doc,
        "Multi-Area Rollups & Instant 244-Metric Topic Finder: ",
        "Select multiple jurisdictions to inspect their combined farm rollup, or type any keyword ('dairy', 'maple', 'solar', 'tile drainage', 'soybeans') in Step 2 to view 2021 and 2016 figures immediately."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 9: OFA COUNTY & ZONE PROFILES 2.0
    # -------------------------------------------------------------------------
    add_heading_2(doc, "4.2 Module 9: OFA County & Zone Profiles 2.0 (65 Workbooks & PDF Fact Sheets)")
    add_body(
        doc,
        "OFA County & Zone Profiles 2.0 (the bottom document icon on the left rail) is a dedicated multi-source rural and agri-food intelligence suite covering all 49 Ontario Census Divisions, all 15 OFA Regional Zones (Zone 1–Zone 15), and Ontario as a whole (65 profiles in total). It unifies 7 authoritative public datasets into interactive tabs, ready-to-send 9-sheet Excel workbooks (.xlsx), and 2-page printable PDF Fact Sheets."
    )

    add_screenshot(
        doc,
        "11_profiles_huron_summary.png",
        "Figure 14: OFA Profiles 2.0 Executive Summary for Huron County (Zone 7), showing 12 multi-source KPI cards, OMAFA Cash Receipts, and .xlsx / PDF download buttons."
    )

    add_heading_3(doc, "What Is Inside Each of the 8 Interactive Profile Tabs:")
    add_bullet(
        doc,
        "Tab 1 — Executive Summary: ",
        "12 headline KPI cards spanning 2021 Census Farms & Farmland, Census Gross Receipts, 2024 & 2025 Prelim OMAFA Farm Cash Receipts, Farmland Property Tax (MMAH FIR), CLI Class 1–3 Prime Soil, CRTC 50/10 Mbps Rural Broadband, Agri-Food Businesses & Place-of-Work Jobs, Operators & Succession, Capital, Soil Health/Tech, and Direct Sales—plus Top Commodities by 2024 Farm Cash Receipts."
    )
    add_bullet(
        doc,
        "Tab 2 — Townships (Lower-Tier CCS Breakdown): ",
        "Compares every local township inside the County or OFA Zone side-by-side on farm count, farmland acres, cropland share, and municipal farmland property tax share."
    )
    add_bullet(
        doc,
        "Tab 3 — Farm Cash Receipts (2018–2025 Prelim): ",
        "Annual OMAFA county commodity cash receipts across 36 crop, livestock, dairy, poultry, horticultural, and program payment lines, including % of local FCR and % of Ontario total."
    )
    add_bullet(
        doc,
        "Tab 4 — Field Crop Yields & Acreage: ",
        "Multi-year OMAFA county acreage, production, and yield series across major Ontario field crops."
    )
    add_bullet(
        doc,
        "Tab 5 — Agri-Food Businesses & Day/Night Jobs: ",
        "Canadian Business Counts across the agri-food value chain (farming, food & beverage manufacturing, ag wholesale/inputs, retail, foodservice) paired with Place-of-Work ('Daytime') vs. Employed Labour Force ('Nighttime') jobs."
    )
    add_bullet(
        doc,
        "Tab 6 — Farmland Property Tax, CLI Prime Soil & Rural Broadband: ",
        "Combines MMAH Financial Information Return (FIR) farmland assessment (CVA) and municipal property tax burden, Canada Land Inventory (CLI) Agricultural Soil Classes 1–7 + Greenbelt acreage, and ISED/CRTC 50/10 Mbps wired & LTE wireless coverage."
    )
    add_bullet(
        doc,
        "Tab 7 — Complete Ag Census Profile (2006, 2011, 2016 & 2021): ",
        "Searchable 4-census-wave historical table (use the 'Show All 609 Rows' button to expand every single line), with all 7 historical 2021 StatCan restructuring gaps (such as Paid Labour, Greenhouse Area, Organic Products, and Forest Products) fully populated and verified."
    )
    add_bullet(
        doc,
        "Tab 8 — Local Food Retail & Direct Sales Benchmark (Explicitly Badged 'Estimate'): ",
        "Combines empirical Census direct-to-consumer farm counts with population-scaled Ontario consumer food expenditure benchmarks, clearly flagged with an amber 'Estimate' badge and methodology disclosures."
    )

    add_screenshot(
        doc,
        "11c_profiles_huron_tax_soil_broadband.png",
        "Figure 15: Profiles 2.0 Tab 6 — Municipal Farmland Property Tax (FIR), CLI Prime Agricultural Soil (Class 1–3), and Rural Broadband availability."
    )

    add_callout_box(
        doc,
        "Exact Geographic Reconciliation in OFA Zones (Sudbury & SDG Split):",
        [
            "• Zone 15 (Northern Ontario — Sudbury District vs. Greater Sudbury): Statistics Canada publishes Greater Sudbury (CD 3553) separately from Sudbury District (CD 3552), whereas OMAFA combines Greater Sudbury into Sudbury District. Profiles 2.0 flags this reconciliation with a prominent footnote banner so county and zone sums never double-count or omit Greater Sudbury.",
            "• Zone 11 & Zone 14 (Stormont, Dundas & Glengarry Split): Automatically routes North & South Dundas to Zone 11 and North & South Stormont + North & South Glengarry to Zone 14 using township-level CCS data.",
            "• Ready-to-Send Downloads: Click 'Download Excel (.xlsx)' or 'Print / Save PDF Fact Sheet' in the top-right header of any County or Zone, or click 'Download All 65 Workbooks (.zip)' at the bottom-left to grab the entire provincial library at once."
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
        "Need a customized briefing package combining multiple counties or townships across chosen Census categories? Click 'Multi-Area PDF Report' in the top navy header from any screen."
    )

    add_screenshot(
        doc,
        "09_multi_area_report.png",
        "Figure 16: The Multi-Area PDF Report Builder lets you combine multiple jurisdictions with automatic nested double-count protection."
    )

    add_bullet(
        doc,
        "Smart Rollup Math (Zero Double-Counting): ",
        "Check any combination of regions, counties, or townships and choose which of the 10 Census sections to include. If you accidentally select both a parent County (e.g., Huron) and a child Township inside it (e.g., South Huron), the Combined Total column automatically excludes the nested child from the sum so farms are never double-counted, and weights all averages/margins by their proper farm, acre, or revenue denominator."
    )

    add_heading_2(doc, "4.4 AI Executive Policy Summary ('+ AI Policy Brief' Button)")
    add_body(
        doc,
        "Click '+ AI Policy Brief' in the top-right header from anywhere in the app to generate a 5-paragraph executive narrative grounded 100% in official Statistics Canada figures for your active geography, with exact StatCan table citations at the end of every paragraph and one-click Copy to Clipboard."
    )

    add_screenshot(
        doc,
        "10_ai_policy_brief.png",
        "Figure 17: The AI Executive Policy Summary drawer generates a citation-backed 5-paragraph briefing note with zero synthetic hallucinations."
    )

    add_heading_2(doc, "4.5 Interactive Canada-Only Maps & Colorblind-Safe Palette")
    add_bullet(
        doc,
        "Canada-Only Vector Canvas & Regional Focus Pills: ",
        "Focuses 100% of map space on Canadian agricultural divisions with one-click zoom pills ('All Canada', 'West', 'ON / QC', 'Atlantic', and 'South ON + Inset' featuring an interactive Northern Ontario Districts inset)."
    )
    add_bullet(
        doc,
        "Accessible Palette Toggle ('Standard | Accessible' Button Above Maps): ",
        "Switches map ramps and badges to an Okabe–Ito / Viridis colorblind-safe palette for accessible presentations."
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 5: COMPLETE CATALOG OF DATA CATEGORIES
    # =========================================================================
    add_heading_1(doc, "5. Complete Directory of the 10 Census Data Categories & Official Table Citations")

    add_body(
        doc,
        "Below is the verified reference directory showing all 10 Census of Agriculture categories in AgCensus IQ alongside their exact Statistics Canada table numbers:"
    )

    add_styled_table(
        doc,
        ["Category Name", "Official StatCan Tables", "What You Can Look Up in This Category"],
        [
            [
                "1. Farm Types & Industry (NAICS)",
                "32-10-0231-01\n32-10-0403-01",
                "Total census farms and classifications across all 10 major 4-digit and 14 detailed 6-digit NAICS industries: Oilseed & grain (Soybean, Corn, Wheat, Oilseed), Dairy cattle & milk, Beef cattle ranching & feedlots, Hog & pig farming, Poultry & egg, Sheep & goat, Fruit & tree nut, Vegetable & melon, Greenhouse/nursery/floriculture, and Other crop/animal production."
            ],
            [
                "2. Farm Size, Land Use & Tenure",
                "32-10-0232-01\n32-10-0233-01\n32-10-0234-01\n32-10-0153-01\n32-10-0154-01\n32-10-0249-01",
                "Farm area size brackets (Under 10 acres up to 3,520+ acres), Total Farm Area (acres), Average Farm Size (acres), Land in Crops, Summerfallow, Tame/Seeded Pasture, Natural Pasture, Woodlands & Wetlands, and Land Tenure (Owned vs. Rented/Leased Acres, Cash Rent, Crop Share, Government Land)."
            ],
            [
                "3. Field Crops, Hay & Seeded Pasture",
                "32-10-0309-01\n32-10-0154-01\n32-10-0416-01",
                "Both farms reporting AND total acres grown for: Corn for grain, Soybeans, Total Wheat (Spring, Winter, Durum), Canola, Barley, Oats, Mixed grains, Rye, Dry field peas, Lentils, Dry beans, Chickpeas, Alfalfa & mixtures, Other tame hay/fodder, Corn for silage, Sugar beets, and Potatoes."
            ],
            [
                "4. Horticulture, Fruit, Berries & Greenhouses",
                "32-10-0355-01\n32-10-0356-01\n32-10-0357-01\n32-10-0358-01\n32-10-0236-01",
                "Field Vegetables (32-10-0355-01: Sweet corn, Tomatoes, Carrots, Onions, Cabbage, Peppers, Squash/Pumpkins, Broccoli, Lettuce), Fruits/Berries/Nuts (32-10-0356-01: Apples, Grapes/Vineyards, Peaches, Strawberries, Blueberries, Raspberries, Cranberries), Sod/Nursery/Christmas trees (32-10-0357-01), Maple syrup taps (32-10-0358-01), and Greenhouse area in sq. ft. (32-10-0236-01)."
            ],
            [
                "5. Livestock, Poultry, Apiculture & Dairy",
                "32-10-0370-01 to\n32-10-0378-01\n32-10-0160-01",
                "Farms reporting AND total animal inventory for: Total Cattle & Calves, Dairy Cows, Beef Cows, Heifers, Steers/Feedlot cattle, Calves, Total Pigs (Sows/Gilts, Nursing/Weaner, Grower/Finisher), Sheep & Lambs, Goats, Horses & Ponies, Llamas/Alpacas, Bison, Deer/Elk, Hens & Chickens (Broilers/Roasters vs. Layers), Turkeys, Ducks/Geese, and Honeybee colonies."
            ],
            [
                "6. Farm Capital, Machinery & Real Estate",
                "32-10-0237-01\n32-10-0238-01\n32-10-0161-01",
                "Total Farm Capital size brackets (Under $100K up to $3.5M+), Total Farm Capital ($), Average Capital per Farm ($), Total Value of Land & Buildings ($), Average Land & Building Value per Acre ($/acre), Farm Machinery & Equipment Value ($), and Livestock & Poultry Capital Value ($)."
            ],
            [
                "7. Farm Revenues, Expenses & Margins",
                "32-10-0239-01\n32-10-0240-01\n32-10-0241-01\n32-10-0162-01\n32-10-0164-01",
                "11 Gross Farm Operating Receipts brackets (Under $10K up to $2M+), Total Gross Farm Receipts ($), Average Revenue per Farm ($), Total Operating Expenses ($), Average Expenses per Farm ($), Net Cash Operating Income ($), Net Operating Margin (%), Paid Agricultural Labour farms, and Year-Round vs. Seasonal Employees."
            ],
            [
                "8. Operator Demographics, Legal & Succession",
                "32-10-0381-01\n32-10-0382-01\n32-10-0244-01\n32-10-0230-01\n32-10-0399-01\n32-10-0401-01",
                "Total Farm Operators, Male vs. Female Operators, Age brackets (Under 35, 35–54, 55+ years), Average Operator Age, On-farm vs. Off-farm work hours, Legal Operating Arrangements (Sole Proprietorship, Partnership, Family & Non-Family Corporations), Formal Written Succession Plans (32-10-0244-01), plus Education & Household Income Cross-Tabulations."
            ],
            [
                "9. Precision Ag Tech & Renewable Energy",
                "32-10-0379-01\n32-10-0380-01\n32-10-0246-01",
                "Adoption counts and % of farms using Precision Technologies (32-10-0379-01: Automated Guidance Auto-Steer, GIS Mapping, Variable-Rate Inputs, Drones/UAVs, Soil Sample Testing, Slow-Release Fertilizer, Robotic Milking, Automated Barn Controls & Feeding) and On-Farm Renewable Energy Systems (32-10-0380-01: Solar panels, Wind turbines, Bioenergy)."
            ],
            [
                "10. Soil Conservation, Manure & Direct Sales",
                "32-10-0367-01\n32-10-0368-01\n32-10-0369-01\n32-10-0242-01\n32-10-0243-01",
                "Tillage Practices (32-10-0367-01: No-Till/Zero-Till, Conservation Tillage, Conventional Tillage), Inputs & Manure (32-10-0368-01: Solid/Composted vs. Liquid Manure, Commercial Fertilizer & Lime), Land Practices (32-10-0369-01: Winter Cover Crops, Windbreaks, Rotational & In-field Winter Grazing), Direct-to-Consumer Sales (32-10-0242-01), and Organic Production (32-10-0243-01)."
            ],
        ],
        col_widths=[1.5, 1.25, 4.05],
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 6: 6 PRACTICAL OFA WORKFLOWS & RECIPES
    # =========================================================================
    add_heading_1(doc, "6. Practical OFA Playbooks: 6 Common Real-World Workflows")

    add_heading_2(doc, "Playbook 1: Pulling a Complete County or OFA Zone Workbook & 2-Page PDF Fact Sheet")
    add_bullet(
        doc,
        "1. Click 'Profiles 2.0' (bottom icon on the left rail) ",
        "or type your County or OFA Zone (e.g., 'Huron' or 'OFA Zone 7') directly into the top navy search bar."
    )
    add_bullet(
        doc,
        "2. Click 'Download Excel (.xlsx)' ",
        "in the top-right header to download a ready-to-send 9-tab Excel workbook containing Executive KPIs, Township comparisons, 2018–2025 OMAFA Farm Cash Receipts, Crop Yields, Agri-Food Businesses, Farmland Property Tax & Prime Soil, Rural Broadband, and all 609 Ag Census rows (2006–2021)."
    )
    add_bullet(
        doc,
        "3. Click 'Print / Save PDF Fact Sheet' ",
        "right beside it to download or print a crisp 2-page executive PDF handout for county federation meetings, MPPs, or municipal councillors."
    )

    add_heading_2(doc, "Playbook 2: Preparing Speaking Points for a County Federation AGM or Council Deputation")
    add_bullet(
        doc,
        "1. Open Ag Snapshot ",
        "and select your County (e.g., Wellington County or Huron County)."
    )
    add_bullet(
        doc,
        "2. Click '+ AI Policy Brief' ",
        "in the top header bar and click 'Copy Policy Briefing' to get 5 ready-to-read paragraphs citing exact Statistics Canada tables on farm count, gross farm receipts, farmland value per acre, succession plans, and soil conservation."
    )

    add_heading_2(doc, "Playbook 3: Defending Prime Farmland & Fair Property Taxation in Municipal Planning")
    add_bullet(
        doc,
        "1. Open Profiles 2.0 -> Tab 6 ('Tax, Prime Soil & Broadband') ",
        "to pull your county's exact CLI Class 1–3 Prime Agricultural Soil acreage, Farmland Current Value Assessment (CVA), and share of the municipal property tax levy paid by farmland."
    )
    add_bullet(
        doc,
        "2. Open Ag Explorer -> '45-Year Historical (1976–2021)' ",
        "under Category 2 ('Land Use & Tenure') to show the 45-year trajectory of farmland consolidation and rented land pressure."
    )

    add_heading_2(doc, "Playbook 4: Screening Commercial Farms With Exact Mathematical Joint Bounds")
    add_bullet(
        doc,
        "1. Open Ag Drilldown ",
        "and pick Filter 1 = 'Oilseed & Grain Farming [1111]' and Filter 2 = 'Receipts: $500,000 and over (Commercial Scale)'."
    )
    add_bullet(
        doc,
        "2. Read the Exact Joint Farm Bounds Table ",
        "to report the mathematically guaranteed minimum and maximum possible count of commercial grain farms in every Ontario county—or switch to Tab 2 ('Official StatCan Cross-Tabulations') for exact provincial Farm Type × Household Income figures."
    )

    add_heading_2(doc, "Playbook 5: Building a Custom Multi-Factor Index (With Polarity Control)")
    add_bullet(
        doc,
        "1. Open AgScore ",
        "and click one of the 4 OFA Policy Presets (such as 'Soil Stewardship & Climate BMP Leadership' or 'Generational Renewal & Young Farmer Vitality'), or choose any 4 metrics of your own."
    )
    add_bullet(
        doc,
        "2. Use '↑ High / ↓ Low' Polarity & Export ",
        "to flip any slot where lower values are desirable (e.g., younger operator age), then click 'Print / PDF' or 'Export CSV' above the ranked table."
    )

    add_heading_2(doc, "Playbook 6: Benchmarking Ontario Against Other Provinces or Peer Counties")
    add_bullet(
        doc,
        "1. Open Ag Compare ",
        "and click 'Find Closest Match' to discover which other counties in Ontario or across Canada have the closest commodity, operator, and financial profile to yours—then click 'Download Visual (PNG)' for a slide-ready comparison card."
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 7: PLAIN-LANGUAGE GLOSSARY & FAQ
    # =========================================================================
    add_heading_1(doc, "7. Plain-Language Glossary of Census & Agri-Food Terms")

    add_styled_table(
        doc,
        ["Term / Code", "Plain-Language Definition"],
        [
            [
                "Census Farm",
                "Any agricultural operation producing at least one agricultural product (crops, livestock, poultry, greenhouse/nursery products, maple syrup, honey, Christmas trees, etc.) intended for sale."
            ],
            [
                "OFA Regional Zones (Zone 1–Zone 15)",
                "The Ontario Federation of Agriculture's 15 regional governance and member representation zones covering all 49 Ontario Census Divisions (including township-level SDG allocation between Zones 11 and 14)."
            ],
            [
                "NAICS (North American Industry Classification System)",
                "Statistics Canada's standard system for classifying a farm's primary commodity specialization when 50%+ of estimated potential receipts come from that commodity."
            ],
            [
                "CAR / CD / CCS",
                "Statistics Canada's geographic hierarchy: CAR = Census Agricultural Region (5 in Ontario); CD = Census Division / County or District (49 in Ontario, 282 agricultural CDs across Canada); CCS = Census Consolidated Subdivision / Local Township (414 in Ontario)."
            ],
            [
                "Exact Joint Bounds [Min–Max]",
                "In Ag Drilldown Mode 1, the exact Fréchet–Hoeffding mathematical floor and ceiling on how many farms in a geography simultaneously belong to 2 or 3 selected Census categories, computed strictly from published counts without synthetic assumptions."
            ],
            [
                "OMAFA Farm Cash Receipts (FCR)",
                "Annual calendar-year cash receipts from marketings of crops, livestock, dairy, poultry, and direct program payments allocated to Ontario counties by OMAFA (2018–2025 Prelim in Profiles 2.0)."
            ],
            [
                "CLI Prime Agricultural Soil (Classes 1–3)",
                "Canada Land Inventory mineral soil capability classes 1, 2, and 3—Ontario's highest-capability, most productive agricultural land base."
            ],
            [
                "Suppressed ('x')",
                "Official Statistics Canada confidentiality code under the Statistics Act indicating a figure is withheld in a small area to protect individual farm privacy."
            ],
            [
                "Unreliable ('F')",
                "Official Statistics Canada quality indicator marking a 2021 sample/linkage estimate whose sampling variability is too high for reliable publication."
            ],
            [
                "Zero Denominator ('—' or 'N/A')",
                "Displayed on per-farm averages or ratios when 0 farms in that local geography report the underlying commodity (e.g., 0 hog farms in a township)."
            ],
        ],
        col_widths=[2.0, 4.8],
    )

    add_callout_box(
        doc,
        "How Is AgCensus IQ Updated When Future Census & Annual OMAFA Releases Arrive?",
        [
            "All datasets in AgCensus IQ and OFA Profiles 2.0 are built by deterministic, auditable Python scripts in the project's data-pipeline/ folder. When Statistics Canada releases the 2026 Census of Agriculture tables—or when OMAFA, MMAH, and CRTC publish annual county updates—re-running the pipeline automatically refreshes the JSON bundles, 65 Excel workbooks, 65 PDF Fact Sheets, and Word User Guide with zero manual copy-paste."
        ],
        box_type="tip",
    )

    doc.save(str(OUTPUT_DOCX))
    print(f"Successfully generated Word User Guide at: {OUTPUT_DOCX} ({OUTPUT_DOCX.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    build_user_guide()
