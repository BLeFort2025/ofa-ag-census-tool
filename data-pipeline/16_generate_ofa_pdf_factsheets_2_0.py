"""16_generate_ofa_pdf_factsheets_2_0.py — Generate all 65 OFA County & Zone Profile 2.0 PDF Fact Sheets.

Reads `public/data/ofa_county_profiles_2_0.json` and renders vector-crisp executive PDF Fact Sheets
for all 49 Ontario Census Divisions, 15 OFA Zones, and Ontario into
`public/downloads/county_profiles_2_0/pdf/`, plus a master ZIP archive
`public/downloads/county_profiles_2_0/OFA_County_and_Zone_Profiles_2_0_All_65_FactSheets_PDF.zip`.
"""
from __future__ import annotations

import html
import json
import zipfile
from pathlib import Path
from typing import Any
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).resolve().parent.parent
MASTER_JSON = PROJECT_DIR / "public" / "data" / "ofa_county_profiles_2_0.json"
OUT_BASE = PROJECT_DIR / "public" / "downloads" / "county_profiles_2_0"
PDF_DIR = OUT_BASE / "pdf"


def fmt_int(v: float | int | None, fallback: str = "—") -> str:
    if v is None:
        return fallback
    return f"{round(v):,}"


def fmt_curr(v: float | int | None) -> str:
    if v is None:
        return "—"
    a = abs(v)
    sign = "-" if v < 0 else ""
    if a >= 1_000_000_000:
        return f"{sign}${a / 1_000_000_000:.2f}B"
    if a >= 1_000_000:
        return f"{sign}${a / 1_000_000:.1f}M"
    return f"{sign}${round(a):,}"


def fmt_pct(v: float | int | None, dec: int = 1, signed: bool = False) -> str:
    if v is None:
        return "—"
    pfx = "+" if (signed and v > 0) else ""
    return f"{pfx}{v:.{dec}f}%"


def esc(s: Any) -> str:
    return html.escape(str(s or ""))


def render_profile_html(p: dict[str, Any]) -> str:
    es = p["executiveSummary"]
    feds = ", ".join(p.get("federations", []))
    fn_block = ""
    if p.get("footnote"):
        fn_block = f"""
        <div class="footnote">
          <strong>OFA Zone Boundary Note:</strong> {esc(p['footnote'])}
        </div>
        """

    comm_rows_html = ""
    for c in es.get("topCommoditiesFcr2024", [])[:7]:
        lbl = c["label"].replace("Farm cash receipts: ", "")
        comm_rows_html += f"""
        <tr>
          <td>{esc(lbl)}</td>
          <td class="r"><strong>{fmt_curr(c['val2024'])}</strong></td>
          <td class="r">{fmt_pct(c['shareOfGeo2024Pct'])}</td>
          <td class="r">{fmt_pct(c['ontShare2024Pct'], 2)}</td>
        </tr>
        """
    if not comm_rows_html:
        comm_rows_html = '<tr><td colspan="4" style="color:#64748b;">Included in Census Gross Farm Receipts above.</td></tr>'

    crop_rows_html = ""
    for cr in p.get("fieldCrops", [])[:7]:
        yld_str = f"{cr['yield']} {cr['yieldUom']}" if cr.get("yield") is not None else "—"
        crop_rows_html += f"""
        <tr>
          <td>{esc(cr['cropName'])}</td>
          <td class="r">{fmt_int(cr['harvestedAcres'])}</td>
          <td class="r">{esc(yld_str)}</td>
          <td class="r"><strong>{fmt_int(cr['productionTonnes'])}</strong></td>
        </tr>
        """
    if not crop_rows_html:
        crop_rows_html = '<tr><td colspan="4" style="color:#64748b;">Field crop county series not published separately for this urban area.</td></tr>'

    twp_section_html = ""
    townships = p.get("townships", [])
    if townships:
        twp_rows = ""
        for t in townships:
            gr = fmt_curr(t["grossReceipts2020"]) if t["grossReceipts2020"] is not None else "x"
            twp_rows += f"""
            <tr>
              <td><strong>{esc(t['name'])}</strong> <span class="muted">({esc(t['code'])})</span></td>
              <td class="r">{fmt_int(t['farms2021'], 'x')}</td>
              <td class="r">{fmt_int(t['farmlandAcres2021'], 'x')}</td>
              <td class="r">{gr}</td>
              <td class="r">{fmt_curr(t['farmlandTax2024'])}</td>
              <td class="r">{fmt_pct(t['broadband50_10Pct'])}</td>
              <td class="r">{fmt_int(t['agrifoodBiz2023'])}</td>
            </tr>
            """
        twp_section_html = f"""
        <div class="section">
          <h2>Constituent Townships / Municipalities Side-by-Side ({len(townships)})</h2>
          <table>
            <thead>
              <tr>
                <th>Township / Subdivision</th>
                <th class="r">Farms (2021)</th>
                <th class="r">Farmland (ac)</th>
                <th class="r">Gross Receipts (2020)</th>
                <th class="r">Farmland Tax (2024)</th>
                <th class="r">50/10 Broadband</th>
                <th class="r">Agri-Food Biz (2023)</th>
              </tr>
            </thead>
            <tbody>{twp_rows}</tbody>
          </table>
        </div>
        """

    rank_str = f"Rank #{es['farmsRank']} of {es['farmsRankOutOf']} • " if es.get("farmsRank") else ""
    prime_str = f"{fmt_int(es['primeSoilClass1To3Acres'])} ac ({fmt_pct(es['primeSoilSharePct'])})" if es.get("primeSoilClass1To3Acres") is not None else "Unmapped Shield"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'Segoe UI', -apple-system, Arial, sans-serif; color: #0f172a; font-size: 10px; line-height: 1.35; }}
  .banner {{ border-bottom: 2.5px solid #0F3D6E; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start; }}
  .eyebrow {{ font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #1E6B5E; }}
  h1 {{ font-size: 18px; font-weight: 900; color: #0F3D6E; margin: 2px 0; }}
  .sub {{ font-size: 10.5px; color: #475569; }}
  .meta {{ text-align: right; font-size: 9px; color: #64748b; }}
  .footnote {{ background: #fffbeb; border: 1px solid #f59e0b; border-radius: 4px; padding: 6px 8px; margin-bottom: 10px; font-size: 9.5px; color: #78350f; }}
  .kpi-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-bottom: 10px; }}
  .kpi {{ border: 1px solid #cbd5e1; border-radius: 5px; padding: 6px 8px; background: #f8fafc; }}
  .kpi-lbl {{ font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #475569; }}
  .kpi-val {{ font-size: 14px; font-weight: 900; color: #0F3D6E; margin: 1px 0; }}
  .kpi-sub {{ font-size: 8.8px; color: #334155; }}
  .two-col {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }}
  h2 {{ font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #0F3D6E; margin-bottom: 4px; letter-spacing: 0.03em; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 9.2px; }}
  th {{ text-align: left; border-bottom: 1.5px solid #94a3b8; padding: 3px 4px; font-weight: 800; color: #1e293b; background: #f1f5f9; }}
  td {{ border-bottom: 1px solid #e2e8f0; padding: 2.8px 4px; }}
  .r {{ text-align: right; }}
  .muted {{ color: #64748b; font-weight: 400; font-size: 8.5px; }}
  .section {{ margin-bottom: 10px; }}
  .footer {{ margin-top: 8px; padding-top: 6px; border-top: 1px solid #cbd5e1; font-size: 8.2px; color: #64748b; }}
  thead {{ display: table-header-group; }}
  tr {{ page-break-inside: avoid; }}
</style>
</head>
<body>
  <div class="banner">
    <div>
      <div class="eyebrow">Ontario Federation of Agriculture (OFA) • County &amp; Zone Profiles 2.0 Fact Sheet</div>
      <h1>{esc(p['name'])}</h1>
      <div class="sub">Federation(s): <strong>{esc(feds)}</strong> • {esc(p['zoneName'])}</div>
    </div>
    <div class="meta">
      <div><strong>AgCensus IQ Empirical Pipeline</strong></div>
      <div>Data Vintages: 2006–2025</div>
      <div>Zero-Error Reconciled Release</div>
    </div>
  </div>

  {fn_block}

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-lbl">Census Farms (2021)</div>
      <div class="kpi-val">{fmt_int(es['farms2021'])}</div>
      <div class="kpi-sub">{fmt_pct(es['farmsChangePct'], 1, True)} vs 2016 • {rank_str}{fmt_pct(es['farmsOntSharePct'], 2)} ON</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Farmland &amp; Cropland</div>
      <div class="kpi-val">{fmt_int(es['farmlandAcres2021'])} ac</div>
      <div class="kpi-sub">Cropland: {fmt_int(es['croplandAcres2021'])} ac ({fmt_pct(es['croplandShareOfFarmlandPct'])})</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Census Gross Receipts (2020)</div>
      <div class="kpi-val">{fmt_curr(es['censusGrossReceipts2020'])}</div>
      <div class="kpi-sub">Net Margin: {fmt_pct(es['censusNetMarginPct2020'])} • Avg {fmt_curr(es['avgReceiptsPerFarm2020'])}/farm</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">OMAFA Farm Cash Receipts (24)</div>
      <div class="kpi-val">{fmt_curr(es['omafaFcr2024'])}</div>
      <div class="kpi-sub">2025 Prelim: {fmt_curr(es['omafaFcr2025'])} ({fmt_pct(es['omafaFcrOntSharePct2024'], 2)} ON)</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Farmland Tax (FIR {es['firYear']})</div>
      <div class="kpi-val">{fmt_curr(es['farmlandTotalTaxDollars'])}</div>
      <div class="kpi-sub">CVA: {fmt_curr(es['farmlandCvaDollars'])} ({fmt_pct(es['farmlandShareOfTotalTaxPct'], 2)} of levy)</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">CLI Prime Soil &amp; Greenbelt</div>
      <div class="kpi-val">{prime_str}</div>
      <div class="kpi-sub">Greenbelt: {fmt_int(es['greenbeltAcres'])} ac ({fmt_pct(es['greenbeltShareLandPct'])})</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Rural Broadband (50/10 Mbps)</div>
      <div class="kpi-val">{fmt_pct(es['broadband50_10Pct'])}</div>
      <div class="kpi-sub">Wired: {fmt_pct(es['broadbandWired50_10Pct'])} • Underserved: {fmt_int(es['broadbandUnderservedHouseholds'])} HHs</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Agri-Food Biz &amp; Day Jobs</div>
      <div class="kpi-val">{fmt_int(es['agrifoodBizLocations2023'])} biz</div>
      <div class="kpi-sub">Day Jobs: {fmt_int(es['agrifoodJobsDay2021'])} ({fmt_pct(es['agrifoodShareOfDayJobsPct2021'])}) • Ops: {fmt_int(es['totalOperators2021'])}</div>
    </div>
  </div>

  <div class="two-col">
    <div>
      <h2>Top Commodities by 2024 OMAFA Farm Cash Receipts</h2>
      <table>
        <thead>
          <tr><th>Commodity</th><th class="r">2024 ($)</th><th class="r">% Local</th><th class="r">% ON</th></tr>
        </thead>
        <tbody>{comm_rows_html}</tbody>
      </table>
    </div>
    <div>
      <h2>Major Field Crops (OMAFA Area, Yield &amp; Tonnes)</h2>
      <table>
        <thead>
          <tr><th>Field Crop</th><th class="r">Harvested (ac)</th><th class="r">Yield</th><th class="r">Tonnes</th></tr>
        </thead>
        <tbody>{crop_rows_html}</tbody>
      </table>
    </div>
  </div>

  {twp_section_html}

  <div class="footer">
    <strong>Empirical Sources:</strong> Statistics Canada Census of Agriculture (2006–2021, incl. Table 32-10-0380-01), Census of Population Place-of-Work &amp; Residence (2011–2021), Canadian Business Counts (Dec 2016–2023); OMAFA County Farm Cash Receipts &amp; Field Crop Series (2011–2025, county-allocated estimates); MMAH Municipal Financial Information Return Schedule 26A (2021–2024); Land Information Ontario (LIO) Soil Survey Complex CLI Class 1–3 &amp; Greenbelt Outer Boundary; ISED National Broadband Data (2021 PHH). Prepared for the Ontario Federation of Agriculture (OFA).
  </div>
</body>
</html>"""


def main() -> None:
    # Clean any stray test PDFs in OUT_BASE
    for stray in OUT_BASE.glob("OFA_FactSheet_*.pdf"):
        stray.unlink(missing_ok=True)

    PDF_DIR.mkdir(parents=True, exist_ok=True)
    master = json.loads(MASTER_JSON.read_text(encoding="utf-8"))
    profiles = list(master["profiles"].values())
    print(f"Rendering {len(profiles)} OFA Profile 2.0 PDF Fact Sheets in {PDF_DIR}...")

    generated_files: list[Path] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        for p in profiles:
            pdf_name = p["excelFilename"].replace(".xlsx", ".pdf")
            pdf_path = PDF_DIR / pdf_name
            page.set_content(render_profile_html(p), wait_until="load")
            page.pdf(
                path=str(pdf_path),
                format="Letter",
                print_background=True,
                margin={"top": "0.35in", "bottom": "0.35in", "left": "0.35in", "right": "0.35in"},
            )
            generated_files.append(pdf_path)
        browser.close()

    zip_path = OUT_BASE / "OFA_County_and_Zone_Profiles_2_0_All_65_FactSheets_PDF.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for fp in sorted(generated_files):
            zf.write(fp, arcname=fp.name)

    avg_kb = sum(fp.stat().st_size for fp in generated_files) / len(generated_files) / 1024
    print(f"Generated {len(generated_files)} PDF Fact Sheets (avg {avg_kb:.1f} KB) and {zip_path.name} ({zip_path.stat().st_size/1024/1024:.2f} MB)")


if __name__ == "__main__":
    main()
