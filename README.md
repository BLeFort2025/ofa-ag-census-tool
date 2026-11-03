# AgCensus IQ — Canadian Census of Agriculture Intelligence Platform (OFA Edition)

A commercial-grade SaaS analytics platform built for the **Ontario Federation of Agriculture (OFA)**, replicating and extending the full functional and visual architecture of the MTM Census Tool for the **Statistics Canada Census of Agriculture (`32-10-xxxx` series)**.

## Key Features & Modules

1. **01 Ag Snapshot (`src/components/modules/AgSnapshotModule.tsx`):**
   - Executive 1-page portrait for any of the **2,113 Census of Agriculture geographies** across Canada (`Country` → `Provinces & Territories` → `Census Agricultural Regions (CAR)` → `Counties / Census Divisions (CD)` → `Townships / Subdivisions (CCS)`).
   - Displays 9 bento KPI cards with **2016–2021 benchmark deltas**, **OFA County & Regional Federation** badges, `+` quick-jump drawers into Ag Explorer, an interactive **Polygon Choropleth & Peer Distance Map Modal (`km`)**, and **1-Click OFA County Factsheet Print/PDF Export**.
2. **02 Ag Explorer (`src/components/modules/AgExplorerModule.tsx`):**
   - Deep-dive exploration across **239 empirical Census of Agriculture characteristics** organized into 10 agricultural categories.
   - Switch between **Horizontal Bar Distribution** (`#0F3D6E` navy & `#D7D7CB` stone), **Proportional Share**, **Multi-Census Historical Time-Series (`1976–2021`)**, and **Structured Data Table (CSV Export)**, paired with explicit `Base` denominator definitions and `Aggregate Statistics`.
3. **03 Ag Drilldown (`src/components/modules/AgDrilldownModule.tsx`):**
   - 3-way multi-dimensional targeting intersecting `Geography Scope` × `Filter 1 (Farm Type / NAICS)` × `Filter 2 (Gross Revenue Class)` × `Filter 3 (Operating Structure, Succession Plan, Precision Tech, or Stewardship)`, with a `Share of Census Farms` donut card, quintile choropleth map (`Standard` & `Accessible` palettes), tabbed distribution bars, and ranked table.
4. **04 Ag Compare (`src/components/modules/AgCompareModule.tsx`):**
   - Side-by-side benchmarking of `Geography A` vs. `Geography B` (e.g., *Perth County vs. Huron County* or *Ontario vs. Canada*) with `Percentages` vs. `Counts` normalization, diverging butterfly bars, side-by-side `Aggregate Statistics`, and automated green winner dots (`●`).
5. **05 Ag Ranker (`src/components/modules/AgRankerModule.tsx`):**
   - Regional leaderboard seamlessly toggling between `Counts & Share` and `Aggregate Statistics` (e.g., `Land & Building Value $/Acre`, `Avg Revenue / Farm`), with threshold range filters (`Ranker Filters`), inline proportional table data bars, and synchronized quintile map.
6. **06 AgScore (`src/components/modules/AgScoreModule.tsx`):**
   - Multi-factor weighted Z-score and Normal CDF (`NORM.S.DIST`) percentile index builder (`0–100 Score`) across 4 customizable characteristic slots (`Weight 0.0–1.0` + `Filter % min/max`), complete with **1-Click OFA Policy Presets** and color-banded choropleth map (`0–50`, `50–70`, `70–90`, `90–100`).
7. **07 GeoLocator & Global Overlays (`src/components/modules/AgGeoLocatorAndOverlays.tsx`):**
   - Full-text hierarchy search across all 2,113 Canadian geographies, interactive `?` step-by-step guided coach-marks, and an evidence-bound `A` AI Executive Policy Summary drawer.

## Running the Platform

```bash
# Start development server at http://localhost:5173
npm run dev

# Build for production
npm run build
```

## Re-Running the Empirical Statistics Canada Data Pipeline

All raw Statistics Canada CSV cubes (`32-10-0153-01` through `32-10-0445-01`) and 2021 Digital Boundary polygons are ingested and compiled via the Python pipeline in `data-pipeline/`:

```bash
python data-pipeline/01_discover_statcan_cubes.py
python data-pipeline/02_download_and_inspect_cubes.py
python data-pipeline/04_fetch_statcan_geographies.py
python data-pipeline/06_build_ag_census_dataset.py
```
