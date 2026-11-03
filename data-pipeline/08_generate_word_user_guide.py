"""
08_generate_word_user_guide.py
Generates a comprehensive, plain-language, richly illustrated Microsoft Word (.docx)
User Guide for AgCensus IQ (OFA Edition) in c:\\Projects\\Census Tool\\AgCensus_IQ_OFA_User_Guide.docx.
"""

from pathlib import Path
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

PROJECT_DIR = Path(r"c:\Projects\Census Tool")
ARTIFACT_DIR = Path(r"C:\Users\ben.lefort\.gemini\antigravity\brain\23b428a3-5d13-4e1a-9b57-721583ddcbae")
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
    img_path = ARTIFACT_DIR / filename
    if not img_path.exists():
        return
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
    p_badge.paragraph_format.space_before = Pt(24)
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
    p_sub.paragraph_format.space_after = Pt(14)
    r_sub = p_sub.add_run(
        "A Step-by-Step Guide to Exploring, Comparing, Ranking, and Mapping Canadian & Ontario "
        "Census of Agriculture Data from the National Level Down to Your Local Township"
    )
    r_sub.font.size = Pt(12.5)
    r_sub.font.color.rgb = MUTED_RGB

    add_callout_box(
        doc,
        "At a Glance: What Is AgCensus IQ (OFA Edition)?",
        [
            "AgCensus IQ is a purpose-built agricultural intelligence and policy tool created for the Ontario Federation of Agriculture (OFA). It takes 49 massive, hard-to-read Statistics Canada Census of Agriculture tables and turns them into an instant, visual, point-and-click dashboard.",
            "Whether you are an OFA Policy Analyst writing a provincial submission, a Member Service Representative (MSR) preparing for a County Federation meeting, or a local board director speaking to municipal council about protecting farmland, this tool gives you official, rock-solid Statistics Canada numbers in seconds."
        ],
        box_type="info",
    )

    add_styled_table(
        doc,
        ["Platform Feature", "What Is Included in AgCensus IQ (OFA Edition)"],
        [
            ["Official Data Source", "100% Empirical Statistics Canada Census of Agriculture (Tables 32-10-0153-01 to 32-10-0445-01)"],
            ["Historical Span", "2021 Census + 2016 Benchmark Deltas + 45-Year Historical Trend Series (1976–2021)"],
            ["Geographic Coverage", "2,113 Geographies across Canada: 1 Country, 10 Provinces, 72 Agricultural Regions (CAR), 282 Counties (CD), and 1,748 Townships (CCS)"],
            ["Ontario & OFA Coverage", "All 5 Ontario Agricultural Regions, all 49 Ontario Counties mapped to OFA Federations, and all 414 Ontario Townships"],
            ["Agricultural Metrics", "239 Official Characteristics organized into 10 plain-language agricultural categories"],
            ["Core Analytical Modules", "6 Main Modules (Snapshot, Explorer, Drilldown, Compare, Ranker, AgScore) + GeoLocator + AI Policy Briefs"],
        ],
        col_widths=[2.1, 4.7],
    )

    add_screenshot(
        doc,
        "ofa_01_snapshot_ontario.png",
        "Figure 1: AgCensus IQ (OFA Edition) opens directly to an executive one-screen dashboard with zero page scrolling required."
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 1: GETTING STARTED & SCREEN LAYOUT
    # =========================================================================
    add_heading_1(doc, "1. Getting Started & Understanding the Screen Layout")

    add_body(
        doc,
        "AgCensus IQ is designed around a 'single-screen' philosophy. Unlike traditional government data websites where you have to scroll through endless tables or download giant spreadsheets just to answer a simple question, AgCensus IQ fits everything onto your computer screen at once."
    )

    add_heading_2(doc, "1.1 How to Open the Tool")
    add_bullet(
        doc,
        "When the Local Server Is Running: ",
        "Simply open your web browser (Edge, Chrome, Firefox, or Safari) and go to http://localhost:5173."
    )
    add_bullet(
        doc,
        "If You Restart Your Computer: ",
        "Open a terminal or PowerShell window in the project folder (c:\\Projects\\Census Tool), type npm run dev, and press Enter. Within 1 second, the tool will be live at http://localhost:5173."
    )

    add_heading_2(doc, "1.2 The Four Parts of the Screen")
    add_body(
        doc,
        "No matter which module you are using, the screen is always organized into four consistent areas so you never get lost:"
    )

    add_bullet(
        doc,
        "1. The Left-Hand Icon Rail (Your Main Menu): ",
        "Running down the far-left edge of the screen is a narrow vertical bar with the OFA logo at the top. Clicking any of the 7 icons switches your workspace immediately between Snapshot, Explorer, Drilldown, Compare, Ranker, AgScore, and GeoSearch. At the bottom of this rail are three helper buttons: (?) Guided Walkthrough, (A) AI Policy Brief, and Data Provenance Notes."
    )
    add_bullet(
        doc,
        "2. The Top Quick-Benchmark Bar (Navy Blue Header): ",
        "Across the very top of the screen is a dark navy bar with one-click shortcut buttons for frequently used regions: Canada, Ontario, Huron County, Wellington County, Perth County, Chatham-Kent, Oxford County, and Niagara Region. Clicking any of these buttons instantly switches the active geography to that region. On the right side of this bar are quick buttons for '+ AI Policy Brief' and '? Guide'."
    )
    add_bullet(
        doc,
        "3. The Left Control Column (Geography & Variable Slicers): ",
        "Just inside the workspace on the left side is where you choose WHICH geography (or geographies) and WHICH agricultural topic you want to look at. Changes you make here update the charts, tables, and maps instantly."
    )
    add_bullet(
        doc,
        "4. The Main Analytical Canvas (Center & Right): ",
        "The large central and right-hand area displays your visual results—whether that is the 8-card County Snapshot, comparison bar charts, head-to-head tables, ranked leaderboards, or interactive maps."
    )

    add_callout_box(
        doc,
        "OFA Pro Tip: Your Selected Geography Follows You Across Modules!",
        [
            "If you select 'Huron County' in Ag Snapshot and then click 'Explorer' or 'Compare' on the left-hand menu, the tool remembers that you were looking at Huron County. You do not need to re-select your county every time you switch tools."
        ],
        box_type="tip",
    )

    # =========================================================================
    # SECTION 2: UNDERSTANDING GEOGRAPHIES
    # =========================================================================
    add_heading_1(doc, "2. Understanding the 5 Geographic Levels (National to Township)")

    add_body(
        doc,
        "One of the most common frustrations with Statistics Canada data is figuring out what terms like 'CAR', 'CD', and 'CCS' actually mean in everyday Ontario farm language. AgCensus IQ translates these codes into plain English and connects them directly to OFA County and Regional Federations."
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
                "Each individual Canadian province (used for inter-provincial benchmarking).",
                "10",
                "1",
                "Ontario (48,346 farms), Quebec, Alberta, Saskatchewan"
            ],
            [
                "3. Census Agricultural Regions (CAR)",
                "Large multi-county farming zones grouped by climate and geography.",
                "72",
                "5",
                "Southern Ontario, Western Ontario, Central Ontario, Eastern Ontario, Northern Ontario"
            ],
            [
                "4. Counties / Census Divisions (CD)",
                "Your County, Regional Municipality, or District. Directly matched to OFA County Federations.",
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
        col_widths=[1.4, 1.8, 0.7, 0.7, 2.2],
    )

    add_heading_2(doc, "2.1 How the Geography Filter Works")
    add_body(
        doc,
        "In every module, the Geography box on the left lets you narrow down your view in three easy steps:"
    )
    add_bullet(
        doc,
        "Step 1 — Pick the Geographic Level: ",
        "Use the top dropdown in the Geography box to choose whether you want to look at the Country, Provinces, Agricultural Regions (CAR), Counties (CD), or Townships (CCS)."
    )
    add_bullet(
        doc,
        "Step 2 — Filter by Province or Region (Optional): ",
        "When you are looking at Counties or Townships, two helpful filter dropdowns appear automatically: 'Province' (e.g., choose Ontario so you only see Ontario's 49 counties instead of all 282 across Canada) and 'Agricultural Region' (e.g., choose Western Ontario or Southern Ontario)."
    )
    add_bullet(
        doc,
        "Step 3 — Type to Search or Pick from the List: ",
        "You can either pick your county/township from the dropdown list or type part of its name (or even its OFA Federation name) into the search box."
    )

    add_callout_box(
        doc,
        "In Plain Language: What Does 'Suppressed (x)' or 'N/A' Mean at the Township Level?",
        [
            "Under the federal Statistics Act, Statistics Canada is legally required to protect the privacy of individual farm families. If a small township only has 1 or 2 farms growing a specific crop (or raising a specific type of livestock), publishing the exact acreage or dollar figure would allow neighbours or competitors to figure out that specific farm's private business numbers.",
            "Whenever Statistics Canada hides a number for privacy reasons, they mark it with an 'x' in the official census file. In AgCensus IQ, we never invent or guess fake numbers to fill those gaps. Instead, the tool clearly displays 'Suppressed (x)' or 'N/A' and tells you how many variables in that township are affected. If you ever run into a suppressed number in a small township, simply step up one level to the County (CD) level, where almost 100% of figures are unsuppressed."
        ],
        box_type="info",
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 3: MODULE-BY-MODULE GUIDE
    # =========================================================================
    add_heading_1(doc, "3. Step-by-Step Guide to All 6 Analytical Modules")

    # -------------------------------------------------------------------------
    # MODULE 1: AG SNAPSHOT
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.1 Module 1: Ag Snapshot (Executive Regional Portrait)")
    add_body(
        doc,
        "Think of Ag Snapshot as your '1-Page Executive Briefing' for any single geography. Whenever someone asks, 'Tell me about agriculture in Huron County (or Ontario, or Mapleton Township),' this is the first screen you should open."
    )

    add_screenshot(
        doc,
        "ofa_01b_snapshot_huron.png",
        "Figure 2: Ag Snapshot showing Huron County, Ontario, complete with its OFA Federation badge, 8 core analytical cards, and 2016–2021 change indicators."
    )

    add_heading_3(doc, "What Each of the 8 Snapshot Cards Tells You:")
    add_bullet(
        doc,
        "Card 1 — Census Farms & Farmland (Left Column, Middle): ",
        "Shows the total number of census farms in 2021, the total farmland area in acres, and the average farm size in acres. Right underneath the big numbers, green or amber badges show the percentage change since the 2016 Census (for example, Huron County grew +2.6% in farm count from 2,500 to 2,564 farms). The horizontal bar at the bottom shows the split between Cropland (%) and Pasture/Woodland/Natural land (%)."
    )
    add_bullet(
        doc,
        "Card 2 — Operators & Succession (Left Column, Bottom): ",
        "Shows the average age of farm operators (e.g., 55.4 years in Huron County), the percentage of female operators (31.4%), and—crucially for OFA policy—the percentage of farms with a formal Written Succession Plan (14.5%). It also breaks down Young Operators under 35 vs. Operators aged 55+."
    )
    add_bullet(
        doc,
        "Card 3 — Top Farm Types / NAICS (Center-Left, Top): ",
        "Automatically ranks the top 5 agricultural industries in that region by share of farms (for example, in Huron County: 49.7% Oilseed & Grain, 21.2% Cattle Ranching, 8.3% Poultry & Egg, 6.7% Hog Farming). Every bar shows both the percentage share and the exact farm count in parentheses."
    )
    add_bullet(
        doc,
        "Card 4 — Land Tenure & Legal Structure (Center-Left, Bottom): ",
        "Shows what percentage of farmland in the county is Owned vs. Rented/Leased (a critical indicator of farmland access pressure), followed by the breakdown of farm business structures: Sole Proprietorships, Partnerships, Family Corporations, and Non-Family Corporations."
    )
    add_bullet(
        doc,
        "Card 5 — Top Field Crops & Horticulture (Center-Right, Top): ",
        "Automatically identifies and ranks the top 5 crops grown in that specific region by acreage (e.g., Corn for Grain, Soybeans, Wheat, Alfalfa, Silage Corn), plus summary boxes at the bottom for Fruit Acres, Field Vegetable Acres, and Greenhouse square footage."
    )
    add_bullet(
        doc,
        "Card 6 — Livestock, Poultry & Bees (Center-Right, Bottom): ",
        "Displays total Census Day animal inventories: Total Cattle & Calves (with Dairy Cows vs. Beef Cows breakdown), Total Pigs (with average herd size per farm), Hens & Chickens, and Sheep / Honeybee colonies."
    )
    add_bullet(
        doc,
        "Card 7 — Farm Revenues & Expenses (Far-Right, Top): ",
        "Shows Total Gross Farm Receipts in dollars (and % growth since 2016), Average Gross Revenue per Farm, Average Operating Expenses per Farm, and the resulting Average Net Cash Operating Income per Farm and Net Operating Margin (%)."
    )
    add_bullet(
        doc,
        "Card 8 — Farm Capital, Farmland Value & Sustainability Tech (Far-Right, Middle & Bottom): ",
        "Shows Total Farm Capital ($), the average market value of Land & Buildings per Acre ($/acre), and adoption rates for No-Till Seeding, Winter Cover Crops, Auto-Steer GPS Guidance, Renewable Energy, and Direct-to-Consumer Farm Gate Sales."
    )

    add_heading_3(doc, "Special Interactive Buttons in Ag Snapshot:")
    add_bullet(
        doc,
        "The '+' Button on Every Card Header: ",
        "Notice the small '+' button in the top-right corner of every card. Clicking '+' on any card (for example, 'Top Field Crops' or 'Farm Revenues') automatically takes you to the Ag Explorer module with that exact category loaded so you can examine all subcategories and historical trends."
    )
    add_bullet(
        doc,
        "'Click here to show map' (Geographic Context & Nearby Peers Modal): ",
        "Clicking this button opens a pop-up map highlighting your selected county or township, alongside an automatic distance table showing the 12 closest neighbouring counties or townships measured in kilometres (km). Clicking any neighbour in that list switches your Snapshot directly to that neighbour."
    )
    add_bullet(
        doc,
        "'Export OFA County Factsheet' (Top-Right Navy Button): ",
        "Generates a clean, formatted 1-Page Executive County Factsheet (.html file) that opens in any browser or Word processor for instant printing or saving to PDF for county board meetings."
    )

    add_screenshot(
        doc,
        "ofa_01c_snapshot_map_modal.png",
        "Figure 3: Clicking 'Click here to show map' in Ag Snapshot opens the interactive polygon map and ranks nearby peer counties by distance in kilometres."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 2: AG EXPLORER
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.2 Module 2: Ag Explorer (Deep Category & 45-Year Historical Analyzer)")
    add_body(
        doc,
        "When you want to dive deep into one of the 10 agricultural categories—and compare up to 8 regions at the same time—click 'Explorer' (the lightbulb icon) on the left-hand rail."
    )

    add_screenshot(
        doc,
        "ofa_02_explorer_bars.png",
        "Figure 4: Ag Explorer comparing Huron County, Wellington County, and Perth County across NAICS Farm Types, with 2021 values (coloured bars) stacked directly above 2016 benchmark values (stone-grey bars)."
    )

    add_heading_3(doc, "How to Use Ag Explorer Step-by-Step:")
    add_bullet(
        doc,
        "1. Select 1 to 8 Geographies (Left Panel): ",
        "Use the multi-select Geography Slicer on the left to check the boxes for up to 8 regions (for instance, Huron, Wellington, Perth, and Oxford). Each region is assigned its own distinct colour badge."
    )
    add_bullet(
        doc,
        "2. Pick Any of the 10 Variable Categories: ",
        "Use the Variable Category dropdown (or click the quick category pills at the bottom of the left panel) to switch between Farm Types, Land Use, Field Crops, Horticulture, Livestock, Capital, Revenues, Operators, Precision Tech, and Soil Conservation."
    )
    add_bullet(
        doc,
        "3. Understand the Dual Bars (2021 vs. 2016 Benchmark): ",
        "By default, the '2016 Benchmark' button in the top-right of the chart is turned ON. For every region, the top solid bar shows the 2021 Census value, while the lighter stone-grey bar right underneath shows the 2016 Census value, followed by a green (+%) or amber (-%) badge showing the exact 5-year change."
    )
    add_bullet(
        doc,
        "4. Switch Between Counts, Percentages, and Aggregate Metrics: ",
        "At the top-left of the chart canvas, you will see three mode buttons: 'Counts (Farms / Units)', 'Percentages (%)', and 'Aggregate Metrics ($, Acres, Ratios)'. Use 'Percentages (%)' when comparing a huge region (like all of Ontario) against a single county so they are on a level playing field; use 'Aggregate Metrics' to inspect total dollar revenues, average $/acre farmland values, or crop acreages."
    )
    add_bullet(
        doc,
        "5. Turn On '45-Year Historical (1976–2021)' View: ",
        "Click the '45-Year Historical (1976–2021)' button in the top-right of the chart to switch into the long-term multi-decade trend analyzer. This view displays a 10-census-wave line chart (1976, 1981, 1986, 1991, 1996, 2001, 2006, 2011, 2016, and 2021) alongside a complete decade-by-decade comparison table."
    )

    add_screenshot(
        doc,
        "ofa_02b_explorer_historical.png",
        "Figure 5: Switching Ag Explorer to '45-Year Historical (1976–2021)' plots structural trends across 10 Census of Agriculture waves."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 3: AG DRILLDOWN
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.3 Module 3: Ag Drilldown (Multi-Criteria Regional Screening)")
    add_body(
        doc,
        "Suppose you are working on an OFA soil health initiative or precision agriculture grant program, and you need to answer a question like: 'Which Ontario counties have at least 25% of cropland in No-Till seeding AND at least 20% of farms planting Winter Cover Crops AND at least 500 farms?' That is exactly what Ag Drilldown (the funnel icon) is built for."
    )

    add_screenshot(
        doc,
        "ofa_03_drilldown.png",
        "Figure 6: Ag Drilldown screening across all 49 Ontario counties using multiple agricultural threshold criteria simultaneously."
    )

    add_heading_3(doc, "How to Screen Geographies in Ag Drilldown:")
    add_bullet(
        doc,
        "Step 1 — Choose Your Geographic Scope: ",
        "In the top-left Geography card, choose the level you want to screen (e.g., 'Counties / Census Divisions (CD)' filtered to 'Ontario')."
    )
    add_bullet(
        doc,
        "Step 2 — Set Your Farm Scale & Growth Filters (Bottom-Left Card): ",
        "You can filter out tiny non-agricultural areas by setting a minimum number of Total Census Farms (e.g., Min 25 farms), a minimum 2016–2021 Farm Count Change (%), or a minimum Average Farm Size in acres."
    )
    add_bullet(
        doc,
        "Step 3 — Set Up to 4 Characteristic Thresholds (Top Row Cards): ",
        "Across the top row are 4 Characteristic boxes (Characteristic 1, 2, 3, and 4). In each box, pick any variable from the 239 Census metrics and enter a 'Min (%)' and/or 'Max (%)' threshold. As soon as you type a number into 'Min (%)', any county that falls below that threshold is filtered out."
    )
    add_bullet(
        doc,
        "Step 4 — Inspect the Qualifying Map & Table: ",
        "The map in the center highlights only the counties that passed ALL of your filters, while the table on the right lists every qualifying county along with its exact percentage and farm count for each of your 4 characteristics. Clicking any county row in the table zooms the map directly to that county."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 4: AG COMPARE
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.4 Module 4: Ag Compare (Head-to-Head County & Provincial Matrix)")
    add_body(
        doc,
        "When you want to put 2 to 10 counties (or provinces) side-by-side in a comprehensive spreadsheet-style report across ALL 10 Census categories at once, click 'Compare' (the two-way arrows icon) on the left rail."
    )

    add_screenshot(
        doc,
        "ofa_04_compare.png",
        "Figure 7: Ag Compare displaying a head-to-head matrix of Huron County, Wellington County, Perth County, and Chatham-Kent with green 'Winner Dots' marking the leading region in every row."
    )

    add_heading_3(doc, "Key Features of Ag Compare:")
    add_bullet(
        doc,
        "Green 'Winner Dots' (●) on Every Row: ",
        "To help your eye scan hundreds of numbers effortlessly, Ag Compare automatically places a green dot (●) and bold navy text on whichever county has the highest value in every single row. For example, in Figure 7, you can spot in half a second that Wellington leads in Total Census Farms (2,617), Huron leads in Total Farm Area (681,476 acres), and Chatham-Kent leads in Oilseed & Grain share (73.4%)."
    )
    add_bullet(
        doc,
        "Three View Modes (Counts, Percentages, Aggregate Metrics): ",
        "Use the three mode buttons in the left control panel to flip the entire comparison table between Farm Counts, Percentage Shares (%), or Dollar/Acreage Aggregate Metrics."
    )
    add_bullet(
        doc,
        "2016–2021 Delta Badges (Optional Toggle): ",
        "Leave 'Show 2016–2021 % Delta Badges' checked to see the 5-year growth or decline right beside every 2021 number, or uncheck it if you want a compact table for printing."
    )
    add_bullet(
        doc,
        "Expand All / Collapse All Categories: ",
        "You can expand or collapse any of the 10 agricultural category headers by clicking on its title bar, or use the 'Expand All (10)' and 'Collapse All' buttons at the top of the table."
    )
    add_bullet(
        doc,
        "One-Click CSV / Excel Export: ",
        "Click 'Export Matrix (CSV)' in the top-right corner to download the entire multi-county comparison table directly into Microsoft Excel."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 5: AG RANKER
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.5 Module 5: Ag Ranker (Regional Leaderboard & Quintile Map)")
    add_body(
        doc,
        "Whenever someone asks, 'Where does our county rank in Ontario for Dairy Farms (or Soybeans, or Cover Crops, or Farmland Value per Acre)?' click 'Ranker' (the bar-chart leaderboard icon) on the left rail."
    )

    add_screenshot(
        doc,
        "ofa_05_ranker.png",
        "Figure 8: Ag Ranker ranking all 49 Ontario counties by Dairy Cattle & Milk farms, paired with a synchronized quintile choropleth map."
    )

    add_heading_3(doc, "How to Read and Use Ag Ranker:")
    add_bullet(
        doc,
        "Dual Inline Data Bars (Navy for Count, Green for % Share): ",
        "Every row in the leaderboard displays two visual bars right under the numbers: a navy bar showing the county's raw count/value relative to the #1 county, and a forest-green bar showing the county's percentage share (%). This is vital because a large county might rank high in raw count, while a smaller eastern county (like Stormont, Dundas and Glengarry or Prescott and Russell) might have the highest concentration (%) of farms in that sector."
    )
    add_bullet(
        doc,
        "Click Any Column Header to Re-Sort: ",
        "Click 'Count / Value' to rank from largest to smallest volume, click '%' to rank by highest concentration, or click '16–21 Δ' to rank counties by fastest 5-year growth!"
    )
    add_bullet(
        doc,
        "Synchronized Quintile Map (P0 to P100): ",
        "The map on the right automatically divides all ranked counties into 5 equal statistical buckets ('quintiles', from lightest blue for the bottom 20% to darkest navy for the top 20%). You can toggle the map between 'Counts' and 'Percentages' at the top of the map panel, or switch to the 'Accessible' colour-blind-safe palette."
    )

    doc.add_page_break()

    # -------------------------------------------------------------------------
    # MODULE 6: AGSCORE
    # -------------------------------------------------------------------------
    add_heading_2(doc, "3.6 Module 6: AgScore (Multi-Factor Weighted Index — 0 to 100)")
    add_body(
        doc,
        "Inspired by commercial site-selection tools (like MTM's CanadaScore), AgScore is the most sophisticated analytical engine in the platform—yet it is designed so anyone can use it with a single click."
    )

    add_screenshot(
        doc,
        "ofa_06_agscore.png",
        "Figure 9: AgScore combining 4 variables into a single 0–100 Composite Index across Ontario counties."
    )

    add_callout_box(
        doc,
        "In Plain Language: How Does AgScore Calculate a 0 to 100 Score?",
        [
            "Imagine you want to rank counties on overall 'Soil Stewardship Leadership' by combining three different numbers: (1) % of cropland using No-Till, (2) % of farms planting Winter Cover Crops, and (3) % of farms doing Soil Sample Testing.",
            "You cannot just add those raw numbers together if they have different scales or averages. Instead, AgScore uses a standard statistical method called a Z-Score & Normal Percentile transformation:",
            "1. For each of the 4 characteristics you pick, the tool calculates the average and spread across all counties in your view and converts each county's result into a Percentile Score from 0 to 100 (where 50 is average, 95 means the county is in the top 5%, and 10 means it is in the bottom 10%).",
            "2. Next, it multiplies each of the 4 percentile scores by the 'Weight' you chose (for example, Weight 1.0 vs. Weight 0.5) and combines them into a single overall AgScore from 0 to 100.",
            "3. Colour-coded badges make the final score easy to read: Green (90–100, Top Tier), Blue (70–90, Above Average), Amber (50–70, Moderate), and Coral Red (0–50, Below Average)."
        ],
        box_type="info",
    )

    add_heading_3(doc, "The 4 Built-In OFA Policy Presets (Top Bar of AgScore):")
    add_body(
        doc,
        "At the top of the AgScore screen are 4 one-click OFA Preset buttons that automatically load curated combinations of Census variables and weights:"
    )
    add_bullet(
        doc,
        "Preset 1 — Commercial Scale & Precision Ag Readiness: ",
        "Combines Auto-Steer Guidance Systems (Weight 1.0), Gross Revenue $500K–$999K (Weight 0.8), Soil Sample Testing (Weight 0.8), and GIS Mapping (Weight 0.6). Ideal for identifying high-tech commercial farming corridors."
    )
    add_bullet(
        doc,
        "Preset 2 — Soil Stewardship & Climate BMP Leadership: ",
        "Combines No-Till / Zero-Till Seeding (Weight 1.0), Winter Cover Crops (Weight 1.0), Soil Sample Testing (Weight 0.8), and Windbreaks / Shelterbelts (Weight 0.6). Ideal for environmental and Agri-Environmental stewardship briefs."
    )
    add_bullet(
        doc,
        "Preset 3 — Generational Renewal & Young Farmer Vitality: ",
        "Combines Operators Under 35 Years (Weight 1.0), Formal Written Succession Plan (Weight 1.0), Direct-to-Consumer Marketing (Weight 0.6), and Female Operators (Weight 0.5). Ideal for young farmer and succession policy programming."
    )
    add_bullet(
        doc,
        "Preset 4 — Farmland Capital Intensity & Tenure Pressure: ",
        "Combines Capital Value $3.5M+ (Weight 1.0), Rented / Leased Farmland Area (Weight 0.9), Gross Receipts $2M+ (Weight 0.8), and Family Corporations (Weight 0.6). Ideal for land-use planning, farmland preservation, and taxation briefs."
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 4: GEOLOCATOR, AI POLICY BRIEF & INTERACTIVE MAPS
    # =========================================================================
    add_heading_1(doc, "4. GeoLocator Search, AI Policy Briefs & Interactive Maps")

    add_heading_2(doc, "4.1 Ag GeoLocator (Finding Any Township or County in Seconds)")
    add_body(
        doc,
        "Not sure which Census Agricultural Region or County a particular rural township belongs to? Click 'GeoSearch' (the compass icon) on the left rail, or click the small 'GeoLocator' link at the top of any Geography box."
    )

    add_screenshot(
        doc,
        "ofa_09_layperson_geosearch.png",
        "Figure 10: The Easy Area & Data Finder (GeoLocator) showing the 'East Nipissing Parry Sound' search, Combined Regional Rollup, and Step 2 Instant Data & Topic Finder on the right."
    )

    add_bullet(
        doc,
        "Full Containment Path: ",
        "Every result shows the exact hierarchy path (for example: Ontario > Western Ontario Region > Huron (CD) > Huron East (CCS)) along with its OFA County Federation badge and total census farms."
    )
    add_bullet(
        doc,
        "Boundary & Centroid Preview Map: ",
        "Clicking any row in the search list highlights that region on the right-hand preview map (along with its constituent townships) and lets you click 'Open Snapshot ->' to jump straight into its full data profile."
    )

    add_heading_2(doc, "4.2 AI Executive Policy Summary ('A' Button / '+ AI Policy Brief')")
    add_body(
        doc,
        "Need to write an executive summary paragraph for an OFA briefing note, board presentation, or letter to a mayor or MPP? Click '+ AI Policy Brief' in the top-right header (or the 'A' button at the bottom-left of the icon rail) from anywhere in the app."
    )

    add_screenshot(
        doc,
        "ofa_08_ai_policy_brief.png",
        "Figure 11: The AI Executive Policy Summary drawer generates a 5-paragraph narrative grounded 100% in official Statistics Canada tables."
    )

    add_bullet(
        doc,
        "100% Evidence-Grounded (Zero Hallucinations): ",
        "Unlike generic AI chatbots that sometimes guess or invent numbers, AgCensus IQ's narrative engine pulls every single number directly from the official Statistics Canada Census of Agriculture record for your selected region and cites the exact StatCan table number (e.g., StatCan 32-10-0231-01) at the end of every paragraph."
    )
    add_bullet(
        doc,
        "Five Structured Policy Paragraphs: ",
        "Automatically covers: (1) Farm Structure & Consolidation, (2) Economic Output & Operating Margins, (3) Farmland Capital & Land Tenure, (4) Operator Demographics & Succession Readiness, and (5) Precision Technology & Soil Stewardship."
    )
    add_bullet(
        doc,
        "One-Click Copy to Clipboard: ",
        "Click the 'Copy Policy Briefing' button at the bottom of the drawer to copy all 5 paragraphs and paste them directly into Microsoft Word, Outlook, or PowerPoint."
    )

    add_heading_2(doc, "4.3 Interactive Maps: Polygons vs. Bubbles")
    add_body(
        doc,
        "Every map in AgCensus IQ includes a 'Polygons | Bubbles' toggle button in its top-left corner:"
    )
    add_bullet(
        doc,
        "Polygons Mode (Default): ",
        "Draws official Statistics Canada boundary shapes for Provinces, Agricultural Regions (CAR), and Counties (CD), shaded by value (choropleth). This lets you see exact county borders across Ontario and Canada."
    )
    add_bullet(
        doc,
        "Bubbles Mode: ",
        "Places proportional coloured circles at the exact geographic center of each region (and is also used automatically when viewing all 414 local townships simultaneously)."
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 5: COMPLETE CATALOG OF DATA CATEGORIES
    # =========================================================================
    add_heading_1(doc, "5. Complete Directory of the 10 Agricultural Data Categories")

    add_body(
        doc,
        "Below is a quick-reference directory showing where to find any agricultural statistic across the 10 categories in AgCensus IQ, along with the official Statistics Canada table numbers used for citations:"
    )

    add_styled_table(
        doc,
        ["Category Name", "Official StatCan Tables", "What You Can Look Up in This Category"],
        [
            [
                "1. Farm Types & Industry (NAICS)",
                "32-10-0231-01\n32-10-0403-01",
                "Total census farms and farm classifications across all 10 major NAICS industries: Oilseed & grain (plus Soybean, Corn, Wheat sub-types), Dairy cattle & milk, Beef cattle ranching & feedlots, Hog & pig farming, Poultry & egg production, Sheep & goat, Fruit & tree nut, Vegetable & melon, Greenhouse/nursery/floriculture, and Other animal production (horses, bees, mixed)."
            ],
            [
                "2. Farm Size, Land Use & Tenure",
                "32-10-0232-01\n32-10-0233-01\n32-10-0234-01\n32-10-0153-01\n32-10-0154-01\n32-10-0249-01",
                "Farm size distribution brackets (Under 10 acres up to 3,520+ acres), Total Farm Area (acres), Average Farm Size (acres), Land in Crops, Summerfallow, Tame/Seeded Pasture, Natural Pasture, Woodlands & Wetlands, and Land Tenure (Owned Acres vs. Rented/Leased Acres, Cash Rent, Crop Share, and Government Land)."
            ],
            [
                "3. Field Crops, Hay & Seeded Pasture",
                "32-10-0359-01\n32-10-0156-01\n32-10-0416-01",
                "Both the number of farms reporting AND total acres grown for: Corn for grain, Soybeans, Total Wheat (plus Spring Wheat, Winter Wheat, Durum), Canola, Barley, Oats, Mixed grains, Rye, Dry field peas, Lentils, Dry beans, Chickpeas, Alfalfa & alfalfa mixtures, All other tame hay/fodder, Corn for silage, Sugar beets, and Potatoes."
            ],
            [
                "4. Horticulture, Fruit, Berries & Greenhouses",
                "32-10-0360-01 to\n32-10-0363-01\n32-10-0235-01\n32-10-0236-01\n32-10-0422-01",
                "Total Fruit/Berry/Nut farms & acres (Apples, Grapes/Vineyards, Peaches, Strawberries, Highbush blueberries, Raspberries, Cranberries), Field Vegetables (Sweet corn, Tomatoes, Carrots, Onions, Cabbage, Peppers, Squash/Pumpkins, Broccoli, Lettuce), Greenhouse area in sq. ft. (Vegetables, Flowers, Tree seedlings), Sod acres, Nursery acres, Christmas trees, and Maple syrup taps."
            ],
            [
                "5. Livestock, Poultry, Apiculture & Dairy",
                "32-10-0370-01 to\n32-10-0378-01\n32-10-0160-01",
                "Farms reporting AND total animal head/inventory for: Total Cattle & Calves, Dairy Cows, Beef Cows, Heifers, Steers/Feedlot cattle, Calves under 1 year, Total Pigs (plus Sows/Gilts, Nursing/Weaner pigs, Grower/Finisher pigs), Sheep & Lambs, Goats, Horses & Ponies, Llamas/Alpacas, Bison, Deer/Elk, Hens & Chickens (Broilers/Roasters vs. Laying Hens), Turkeys, Ducks/Geese, and Honeybee colonies."
            ],
            [
                "6. Farm Capital, Machinery & Real Estate",
                "32-10-0237-01\n32-10-0380-01\n32-10-0161-01",
                "9 Total Farm Capital brackets (Under $100K up to $3.5M+), plus dollar aggregates: Total Farm Capital ($), Average Capital per Farm ($), Total Value of Land & Buildings ($), Average Land & Building Value per Acre ($/acre), Total Value of Farm Machinery & Equipment ($), and Total Value of Livestock & Poultry ($)."
            ],
            [
                "7. Farm Revenues, Expenses & Margins",
                "32-10-0238-01 to\n32-10-0241-01\n32-10-0162-01\n32-10-0164-01",
                "11 Gross Farm Revenue brackets (Under $10K up to $2M+), plus dollar & labour aggregates: Total Gross Farm Operating Revenues ($), Average Revenue per Farm ($), Total Farm Operating Expenses ($), Average Expenses per Farm ($), Net Cash Operating Income ($), Net Operating Margin (%), Farms reporting Paid Agricultural Labour, and Total Paid Employees (Year-round vs. Seasonal)."
            ],
            [
                "8. Operator Demographics & Succession",
                "32-10-0381-01 to\n32-10-0383-01\n32-10-0230-01\n32-10-0244-01\n32-10-0245-01",
                "Total Farm Operators, Male vs. Female Operators, Age brackets (Under 35, 35–54, and 55+ years), Average Operator Age, On-farm vs. Off-farm work hours, Legal Operating Arrangements (Sole Proprietorship, Partnership with/without written agreement, Family Corporation, Non-Family Corporation), and Formal Written Succession Plans."
            ],
            [
                "9. Precision Ag Tech & Renewable Energy",
                "32-10-0379-01\n32-10-0246-01\n32-10-0369-01\n32-10-0443-01",
                "Adoption counts and % of farms using: Automated Guidance Steering (Auto-Steer), GIS Mapping, Variable-Rate Input Application, Drones / UAVs, Soil Sample Testing, Slow-Release / Stabilized Fertilizer, Robotic Milking Systems, Automated Environmental Barn Controls, Automated Livestock Feeding, and On-Farm Renewable Energy (Solar panels, Wind turbines, Bioenergy)."
            ],
            [
                "10. Soil Conservation, Manure & Direct Sales",
                "32-10-0366-01 to\n32-10-0368-01\n32-10-0247-01\n32-10-0248-01\n32-10-0165-01",
                "Tillage breakdown (% of prepared land in No-Till/Zero-Till, Conservation Tillage, and Conventional Tillage), Winter Cover Crops, Windbreaks/Shelterbelts, Rotational Grazing, In-field Winter Grazing, Plowing down Green Crops, Solid/Composted vs. Liquid Manure application, Commercial Fertilizer & Lime acres, Organic Production, and Direct-to-Consumer Sales (Farm Gate Stands, Farmers' Markets, CSA, Value-Added Products)."
            ],
        ],
        col_widths=[1.5, 1.2, 4.1],
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 6: 5 PRACTICAL OFA WORKFLOWS & RECIPES
    # =========================================================================
    add_heading_1(doc, "6. Practical OFA Playbooks: 5 Common Real-World Workflows")

    add_heading_2(doc, "Playbook 1: Preparing for a County Federation AGM or Municipal Council Presentation")
    add_bullet(
        doc,
        "1. Open Ag Snapshot ",
        "and select your County (e.g., Wellington County or Huron County) from the Geography box."
    )
    add_bullet(
        doc,
        "2. Click 'Export OFA County Factsheet' ",
        "in the top-right corner to generate a clean, 1-page printable profile you can hand out or attach to a council agenda package."
    )
    add_bullet(
        doc,
        "3. Click '+ AI Policy Brief' ",
        "in the top header bar and click 'Copy Policy Briefing' to get 5 ready-to-read speaking points citing exact Statistics Canada tables on farm count, gross farm receipts, farmland value per acre, succession plans, and soil conservation."
    )

    add_heading_2(doc, "Playbook 2: Defending Farmland in an Official Plan or Land-Use Appeal")
    add_bullet(
        doc,
        "1. Open Ag Explorer ",
        "and select your County alongside 'Ontario' and neighbouring peer counties."
    )
    add_bullet(
        doc,
        "2. Choose Category 2 ('Farm Size, Land Use & Tenure') or Category 6 ('Farm Capital & Real Estate') ",
        "and click 'Aggregate Metrics ($, Acres, Ratios)' to show the exact Land & Building value per acre ($/acre) and the share of rented farmland."
    )
    add_bullet(
        doc,
        "3. Click '45-Year Historical (1976–2021)' ",
        "to show the long-term trajectory of farmland acreage and consolidation over the past 45 years—demonstrating visually why every remaining acre of productive farmland matters."
    )

    add_heading_2(doc, "Playbook 3: Highlighting Farmer Environmental Stewardship (Cover Crops & No-Till)")
    add_bullet(
        doc,
        "1. Open AgScore ",
        "from the left menu and click the second preset at the top: 'Soil Stewardship & Climate BMP Leadership'."
    )
    add_bullet(
        doc,
        "2. Review the Leaderboard ",
        "to see how Ontario counties lead in combining No-Till seeding, Winter Cover Crops, Soil Sample Testing, and Windbreaks."
    )
    add_bullet(
        doc,
        "3. Switch to Ag Ranker ",
        "and select '10. Soil Conservation -> Winter Cover Crops' to print or export the full county-by-county leaderboard showing both raw farm counts and 2016–2021 adoption growth."
    )

    add_heading_2(doc, "Playbook 4: Benchmarking Ontario Against Other Provinces (Inter-Provincial Policy)")
    add_bullet(
        doc,
        "1. Open Ag Compare ",
        "and change the Geographic Level dropdown to 'Provinces & Territories'."
    )
    add_bullet(
        doc,
        "2. Check the boxes for Ontario, Quebec, Manitoba, Saskatchewan, Alberta, and British Columbia.",
        ""
    )
    add_bullet(
        doc,
        "3. Toggle between 'Percentages (%)' and 'Aggregate Metrics' ",
        "to compare Ontario's net operating margin (%), average farmland cost per acre ($14,326/ac in Ontario vs. $3,929/ac national average), succession planning rate, and commodity mix against every other province."
    )

    add_heading_2(doc, "Playbook 5: Investigating a Specific Local Township (CCS)")
    add_bullet(
        doc,
        "1. Open GeoSearch (the compass icon) ",
        "and type the name of any rural township (e.g., 'Mapleton', 'South Huron', 'North Perth', 'Wainfleet')."
    )
    add_bullet(
        doc,
        "2. Click 'Open Snapshot ->' ",
        "next to the township to view its local farm count, top farm types, and operator profile, or compare all townships inside a county using Ag Ranker by filtering Geographic Level to 'Townships / Subdivisions (CCS)' and picking your county's Agricultural Region."
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 7: PLAIN-LANGUAGE GLOSSARY & FAQ
    # =========================================================================
    add_heading_1(doc, "7. Plain-Language Glossary of Census Terms & FAQ")

    add_styled_table(
        doc,
        ["Term / Acronym", "Plain-Language Definition"],
        [
            [
                "Census Farm",
                "Any agricultural operation that produces at least one agricultural product (crops, livestock, poultry, greenhouse/nursery products, maple syrup, honey, etc.) intended for sale."
            ],
            [
                "NAICS (North American Industry Classification System)",
                "The standard system used by Statistics Canada to classify a farm's main commodity type. If more than 50% of a farm's potential receipts come from dairy cattle and milk, it is classified as a 'Dairy Cattle & Milk' farm."
            ],
            [
                "CAR (Census Agricultural Region)",
                "A sub-provincial geographic grouping of adjacent counties used by Statistics Canada for agricultural reporting. Ontario is divided into 5 CARs: Southern, Western, Central, Eastern, and Northern Ontario."
            ],
            [
                "CD (Census Division / County)",
                "The official Statistics Canada term for an Ontario County, Regional Municipality, Single-Tier City, or Northern District (49 in total across Ontario)."
            ],
            [
                "CCS (Census Consolidated Subdivision / Township)",
                "The official Statistics Canada term for a local lower-tier Township or Municipality within a county (414 in total across Ontario)."
            ],
            [
                "DGUID (Dissemination Geography Unique Identifier)",
                "Statistics Canada's official unique ID code for each geographic boundary (for example, Ontario is 2021A000235 and Huron County is 2021A00033540). Included on screens so analysts can cross-reference raw StatCan files."
            ],
            [
                "Net Cash Operating Income & Margin (%)",
                "Calculated as Total Gross Farm Operating Revenues minus Total Farm Operating Expenses (before depreciation). The Net Operating Margin (%) is Net Cash Operating Income divided by Gross Farm Operating Revenues."
            ],
            [
                "Written Succession Plan",
                "Measured by Statistics Canada Table 32-10-0244-01: a formal written plan (not just a verbal intention) that outlines how the ownership and management of the farm business will be transferred to the next generation or successor."
            ],
            [
                "Suppressed ('x')",
                "A confidentiality marker placed by Statistics Canada when publishing a specific number in a small geography could reveal the identity or financial details of an individual farm operation."
            ],
        ],
        col_widths=[2.0, 4.8],
    )

    add_callout_box(
        doc,
        "How Is This Data Updated When Future Census Releases Come Out?",
        [
            "All data in AgCensus IQ is generated by an automated Python data pipeline located in c:\\Projects\\Census Tool\\data-pipeline. When Statistics Canada releases the 2026 Census of Agriculture tables, running the pipeline scripts will automatically fetch the new tables from the Statistics Canada Web Data Service API and rebuild the database without requiring manual data entry."
        ],
        box_type="tip",
    )

    doc.save(str(OUTPUT_DOCX))
    print(f"Successfully generated Word User Guide at: {OUTPUT_DOCX} ({OUTPUT_DOCX.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    build_user_guide()
