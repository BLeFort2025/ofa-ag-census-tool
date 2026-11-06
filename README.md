# AgCensus IQ — Canadian Census of Agriculture Intelligence Platform (OFA Edition)

A commercial-grade agricultural intelligence platform built for the **Ontario Federation of Agriculture (OFA)**, designed for exploring, benchmarking, ranking, and mapping the **Statistics Canada Census of Agriculture (`32-10-xxxx` series)** across all **2,113 Canadian geographies** from the national level down to individual townships.

> **📖 User Guides Included in This Project Folder:**
> - **Microsoft Word Manual (with Screenshots):** [`AgCensus_IQ_OFA_User_Guide.docx`](./AgCensus_IQ_OFA_User_Guide.docx)
> - **Plain-Language Markdown Guide (with Screenshots):** [`USER_GUIDE.md`](./USER_GUIDE.md)

---

## 8 Integrated Modules & Global Tools

1. **01 Ag Snapshot (`src/components/modules/AgSnapshotModule.tsx`):**
   - Executive 1-page portrait for any of the **2,113 Census of Agriculture geographies** across Canada (`Country` → `Provinces & Territories` → `Census Agricultural Regions (CAR)` → `Counties / Census Divisions (CD)` → `Townships / Subdivisions (CCS)`).
   - Displays 9 bento KPI cards with **2016–2021 benchmark deltas**, **OFA County & Regional Federation** badges, `+` quick-jump drawers into Ag Explorer, an interactive **Canada-Only Polygon Choropleth & Peer Distance Map Modal (`km`)**, and **1-Click OFA County Factsheet Print/PDF Export**.
2. **02 Ag Explorer (`src/components/modules/AgExplorerModule.tsx`):**
   - Deep-dive exploration across **239 empirical Census of Agriculture characteristics** organized into 10 agricultural categories.
   - Switch between **Horizontal Bar Distribution**, **Proportional Share**, **Multi-Census Historical Time-Series (`1976–2021`)**, and **Structured Data Table (CSV Export)**, paired with explicit `Base` denominator definitions and `Aggregate Statistics`.
3. **03 Ag Drilldown (`src/components/modules/AgDrilldownModule.tsx`):**
   - 3-way multi-dimensional screening intersecting `Geography Scope` × `Filter 1 (Farm Type / NAICS)` × `Filter 2 (Gross Revenue Class)` × `Filter 3 (Operating Structure, Succession Plan, Precision Tech, or Stewardship)`, with a `Share of Census Farms` donut card, plain-English 5-tier choropleth map (`Standard` & `Accessible` palettes), non-overlapping PNG map export, and Excel CSV export.
4. **04 Ag Compare (`src/components/modules/AgCompareModule.tsx`):**
   - Side-by-side benchmarking of `Geography A` vs. `Geography B` (e.g., *Perth vs. Huron* or *Hastings vs. Leeds and Grenville*) with **Automated Similarity Discovery** (`Find Closest Match` & `Most Alike Pair`), plain-English **"Why These Counties Are Alike"** trait cards, diverging butterfly bars, green winner dots (`●`), and **1-Click Social Comparison Poster (PNG)**, **PDF**, and **CSV** exports.
5. **05 Ag Ranker (`src/components/modules/AgRankerModule.tsx`):**
   - Regional leaderboard with a **6-Button Unit Filter** (`All`, `Acres`, `Head / Herd`, `Dollars $`, `Farms`, `Totals / Avgs`), a **Smart Contextual Topic Measure Switcher** (1-click pills to flip any crop or livestock topic between Acres, Head, and Farms), a **Customizable Extra Reference Column (`Extra Col:`)**, threshold filters, and synchronized Canada-only map + PNG/PDF/CSV exports.
6. **06 Ag Belts & Cluster Maps Studio (`src/components/modules/AgBeltsModule.tsx`):**
   - Publication-grade National & Provincial social poster generator (`1800 × 1125` high-DPI canvas) with **3 Visual Modes**:
     - **Dominant Belts:** Colors each Census Division by its `#1` leading crop, farm industry, livestock group, or tillage system (like *"Canada's Crop Belts"*).
     - **Single-Stat Cluster:** 5-tier quintile cluster map for any single Census metric.
     - **All-CD Heat Map (Full Production Footprint):** 6-tier thermal heat map showing every Census Division with active production (`> 0`) across Canada or a province, with 1-click commodity footprint presets, Dark Editorial & Light Report themes, and non-crossing perimeter callouts.
7. **07 AgScore (`src/components/modules/AgScoreModule.tsx`):**
   - Multi-factor weighted Z-score and Normal CDF (`NORM.S.DIST`) percentile index builder (`0–100 Score`) across 4 customizable characteristic slots (`Weight 0.0–1.0` + `Filter % min/max`), complete with **1-Click OFA Policy Presets** and plain-English score bands (`Low <50`, `Moderate 50–70`, `Strong 70–90`, `Leading 90–100`).
8. **08 Easy Area & Data Finder / Global Overlays (`src/components/modules/AgGeoLocatorAndOverlays.tsx`, `src/components/MultiAreaReportModal.tsx`):**
   - Layperson community & alias search across all 2,113 Canadian geographies (including human-readable city labels for all numbered Prairie & NL Census Divisions), **Multi-Area Combined + Individual PDF Report Builder**, `?` step-by-step guided walkthroughs, and the `✦ AI Policy Brief` executive narrative drawer.

---

## Running & Building the Platform

```bash
# Start development server at http://localhost:5173
npm run dev

# Build production bundle (also used by streamlit_app.py)
npm run build
```
