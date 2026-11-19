# AgCensus IQ — Canadian Census of Agriculture Intelligence Platform (OFA Edition)

An empirical agricultural data and rural policy platform built for the **Ontario Federation of Agriculture (OFA)**, designed for exploring, benchmarking, ranking, mapping, and exporting the **Statistics Canada Census of Agriculture** alongside **OMAFA, MMAH Municipal FIR, CLI Prime Soil, Greenbelt, and ISED Broadband** datasets across **2,113 Canadian geographies** and **15 OFA Regional Zones**.

> **User Manuals Included in This Repository:**
> - **Microsoft Word Manual (with OFA-Branded Screenshots):** [`AgCensus_IQ_OFA_User_Guide.docx`](./AgCensus_IQ_OFA_User_Guide.docx)
> - **Plain-Language Markdown Guide (with Screenshots):** [`USER_GUIDE.md`](./USER_GUIDE.md)

---

## 9 Integrated Analytical Modules & Global Tools

1. **01 Ag Snapshot (`src/components/modules/AgSnapshotModule.tsx`):**
   - Executive single-screen portrait for any of the 2,113 Census of Agriculture geographies across Canada (Country, Provinces, Agricultural Regions, Counties & Districts, and Townships & Municipalities).
   - Displays a declarative headline takeaway, 8 analytical cards with 2016–2021 benchmark deltas, OFA Federation badges, a 100%-reconciled **Receipts, Expenses & Net Bridge**, an interactive **Peer Distance Map Modal (km)**, and 1-page OFA Factsheet print/PDF export.
2. **02 Ag Explorer (`src/components/modules/AgExplorerModule.tsx`):**
   - Deep-dive exploration across **244 empirical Census of Agriculture characteristics** organized into 10 plain-English agricultural categories.
   - Switch between **Spotlight Horizontal Bars** (with automatic `<3%` `"Other"` tail consolidation), **Proportional Share / Individual 0–100% Adoption Gauges**, a **Single-Scale 1976–2021 SVG Trajectory Chart + 10-Census Table**, and **Structured CSV Data Export**, paired with explicit `Base` denominator definitions and companion benchmarks.
3. **03 Ag Drilldown (`src/components/modules/AgDrilldownModule.tsx`):**
   - **Mode 1:** Multi-criteria screening combining Geography Scope, Farm Specialization, Gross Revenue Scale, and Operating Structure/Practice, computing exact mathematical **Fréchet–Hoeffding Joint Bounds** (`Guaranteed Min – Max Possible`) without synthetic independence assumptions.
   - **Mode 2:** Official Statistics Canada Agriculture–Population Linkage cross-tabulations (**Farm Specialization × Household Income** `32-10-0401-01` and **Farm Specialization × Operator Education** `32-10-0399-01`), plus `1800 × 1125` OFA slide PNG and Excel CSV exports.
4. **04 Ag Compare (`src/components/modules/AgCompareModule.tsx`):**
   - Head-to-head benchmarking of Geography A (**Pickled Bluewood `#334B58`**) vs. Geography B (**OFA Crimson `#D7182A`**) with **Automated Similarity Discovery** (`Find Closest Match` & `Most Alike Pair`), shared-trait & largest-gap callouts, diverging butterfly bars with suppression-safe winner dots (`●`), and `1800 × 1125` OFA comparison PNG, PDF, and CSV exports.
5. **05 Ag Ranker (`src/components/modules/AgRankerModule.tsx`):**
   - Regional leaderboard across all 244 metrics with a **6-Button Unit Filter** (`All (244)`, `Acres`, `Head / Herd`, `Dollars ($)`, `Farms`, `Totals / Avgs`), contextual **Switch Measure for This Topic** pills, customizable `Extra Col:` reference column, `#1` OFA Crimson inline spotlight bars, synchronized quintile map, and `1800 × 1125` PNG, PDF, and CSV exports.
6. **06 Ag Belts & Cluster Maps Studio (`src/components/modules/AgBeltsModule.tsx`):**
   - Publication-grade National (282 Counties & Districts) and Provincial poster generator (`1800 × 1125` high-DPI canvas) with **Dominant Belts**, **All-CD Heat Map**, and **Cluster Focus** modes, `Dark Editorial` and `Light Report` OFA themes, dotted perimeter leader callouts, and an institutional **Bottom Line** takeaway strip.
7. **07 AgScore (`src/components/modules/AgScoreModule.tsx`):**
   - Standardized Z-score and Normal CDF percentile index builder (0–100) across 4 customizable slots with `Weight (0–1)`, `↑ High / ↓ Low` polarity inversion, min/max % filters, 4 OFA policy presets, and OFA score bands (`Leading 90–100` Crimson, `Strong 70–90` Bluewood, `Moderate 50–70` Tulip Tree, `Low <50` Slate).
8. **08 GeoSearch — Area & Commodity Finder (`src/components/modules/AgGeoLocatorAndOverlays.tsx`):**
   - Plain-language community, township, county, OFA Federation, and **OFA Regional Zone (Zone 1–Zone 15)** lookup across all 2,113 geographies, paired with instant 244-metric topic search and multi-district rollup banners.
9. **09 OFA County & Zone Profiles 2.0 (`src/components/modules/AgCountyProfilesModule.tsx`):**
   - Complete 8-tab agri-food & rural intelligence suite covering all **49 Ontario Counties & Districts**, **15 OFA Regional Zones**, and **Ontario** (65 profiles total), including **2020 Census Operating** and **2021 Agri-Food Workforce Commuter Net-Score Bridges**, 36-commodity OMAFA Farm Cash Receipts (2018–2025), 12 Field Crop Yields, MMAH FIR Farmland Tax, CLI Prime Soil, Greenbelt, ISED 50/10 Mbps Broadband, 609-row Ag Census History (2006–2021), downloadable 9-tab `.xlsx` workbooks, and 2-page `.pdf` Fact Sheets.

**Global Tools:** Includes the double-count-safe **Multi-Area PDF Report Builder** (`src/components/MultiAreaReportModal.tsx`), citation-backed **AI Executive Policy Brief Drawer**, and step-by-step **`? Guide` Walkthroughs**.

---

## Running & Building the Platform

```bash
# Start local development server at http://localhost:5173
npm run dev

# Type-check and build production bundle (also served by streamlit_app.py)
npx tsc --noEmit && npm run build
```
