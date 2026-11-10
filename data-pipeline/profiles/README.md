# OFA County Profiles 2.0 — Data Pipeline (Phase 1)

This folder holds the source-acquisition scripts for **OFA County Profiles 2.0**
(Excel workbook + PDF fact sheet + in-app County Profile page).

## Contract every script follows

| Item | Location |
|---|---|
| Shared helpers | [`common.py`](common.py) |
| Raw downloads (git-ignored) | `data-pipeline/raw/profiles/<source_id>/` (StatCan cubes reuse `data-pipeline/raw/cubes/`) |
| Tidy output (one per source) | `data-pipeline/processed/profiles/<source_id>.csv` — columns = `common.TIDY_COLUMNS` |
| Source manifest | `data-pipeline/processed/profiles/sources_manifest.json` (publisher, URL, licence, vintage, retrieval date, method, caveats) |
| QA report | `data-pipeline/processed/profiles/qa/<source_id>.md` |

### Evidence rules
- Only published data. No silent imputation, interpolation or estimation.
- Suppressed / not-available values are written as `value = ""` with a `status_flag` (`x`, `..`, `F`, `placeholder`, …).
- Anything derived by the pipeline (e.g. a zone total, a percentage, an area overlay) carries `is_estimate = 1`
  only if it involves an assumption; plain arithmetic roll-ups of published counts keep `is_estimate = 0`
  but record the method in `note`.

## Scripts

| Script | Source | Owner |
|---|---|---|
| `p01_omafa_fcr.py` | OMAFA Farm Cash Receipts by County & Commodity, 2011–2025 (data.ontario.ca, OGL-Ontario) | main |
| `p02_ofa_zones.py` | OFA 15 zones + 51 county/regional federations (OFA Directory, Dec 2025) | main |
| `p03_census_ag_ontario.py` | Census of Agriculture 2021/2016 — all Ontario CD/CCS rows from cubes already in `raw/cubes/` | main |
| `p10_census_population.py` | Census of Population 2021/2016 — CD/CSD community indicators | sub-agent A |
| `p11_business_counts.py` | StatCan Canadian Business Counts — agri-food NAICS by CSD/CD | sub-agent A |
| `p20_omafa_field_crops.py` | OMAFA field crop area/yield/production by county (annual) | sub-agent B |
| `p21_fir_farmland_tax.py` | MMAH Financial Information Return — farmland class assessment & taxes by municipality | sub-agent B |
| `p30_prime_farmland_cli.py` | Canada Land Inventory soil capability (Class 1–3) overlay by CD/CCS | sub-agent C |
| `p31_greenbelt.py` | Ontario Greenbelt boundary overlay by CD/CCS | sub-agent C |
| `p32_broadband.py` | ISED National Broadband Data (50/10 Mbps availability) by CD/CCS | sub-agent C |
| `p90_build_profiles_qa.py` | Cross-source QA roll-up & reconciliation | main |

Decisions and rationale: see the County Profiles 2.0 plan (OMAFA evaluation) in the conversation artifacts.
