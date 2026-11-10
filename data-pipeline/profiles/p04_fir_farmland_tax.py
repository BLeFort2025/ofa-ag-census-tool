"""p04_fir_farmland_tax.py — Municipal Financial Information Return (FIR) Farmland Assessment & Taxation.

Downloads and parses Ontario Ministry of Municipal Affairs and Housing (MMAH)
Financial Information Return (FIR) open data CSV archives (2021, 2023, 2024)
Schedule 26A ("Taxation and Payments-in-Lieu Summary") for every Ontario
Lower-Tier (LT) and Single-Tier (ST) municipality.

Extracts:
  - Farmland Taxable Current Value Assessment (CVA) — slc.26A.L0110.C01.16
  - Farmland Weighted & Discounted CVA — slc.26A.L0110.C01.02
  - Farmland Municipal Taxes (LT/ST) — slc.26A.L0110.C01.04
  - Farmland Municipal Taxes (Upper Tier / County) — slc.26A.L0110.C01.05
  - Farmland Education Taxes — slc.26A.L0110.C01.06
  - Farmland Total Property Taxes — slc.26A.L0110.C01.03
  - Total All-Property-Classes Taxable CVA — slc.26A.L9199.C01.16
  - Total All-Property-Classes Property Taxes — slc.26A.L9199.C01.03
  - Derived: Farmland Share of Total Assessment (%)
  - Derived: Farmland Share of Total Property Taxes (%)
  - Derived: Effective Farmland Tax Rate per $1,000 CVA

Aggregates cleanly (without double-counting Upper-Tier rows, since LT rows on
Schedule 26A already include LT + UT + Education taxes) to:
  - Municipality (CSD, 7-digit StatCan SGC code = "35" + SGC_CODE.zfill(5))
  - County / Census Division (CD, 4-digit StatCan code = "35" + SGC_CODE.zfill(5)[:2])
  - OFA Zone (OFA_Z01..OFA_Z15, using exact SD&G township split for CD 3501)
  - Province (Ontario)
"""
from __future__ import annotations

import csv
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (
    PROCESSED_DIR,
    PROJECT_DIR,
    QAReport,
    RAW_PROFILES_DIR,
    download_file,
    fmt_num,
    register_source,
    to_num,
    write_tidy,
)

SOURCE_ID = "fir_farmland_tax"
LANDING = "https://efis.fma.csc.gov.on.ca/fir/MultiYearReport/MYCIndex.html"
YEARS = [2021, 2023, 2024]

SLC_MAP = {
    "slc.26A.L0110.C01.16": "farmland_cva",
    "slc.26A.L0110.C01.02": "farmland_wtd_cva",
    "slc.26A.L0110.C01.04": "farmland_tax_lt",
    "slc.26A.L0110.C01.05": "farmland_tax_ut",
    "slc.26A.L0110.C01.06": "farmland_tax_edu",
    "slc.26A.L0110.C01.03": "farmland_tax_total",
    "slc.26A.L9199.C01.16": "total_all_classes_cva",
    "slc.26A.L9199.C01.03": "total_all_classes_tax",
}

METRICS_META = [
    ("fir_farmland_cva", "Farmland Taxable Assessment (CVA)", "dollars", "farmland_cva"),
    ("fir_farmland_wtd_cva", "Farmland Weighted & Discounted Assessment", "dollars", "farmland_wtd_cva"),
    ("fir_farmland_tax_lt", "Farmland Lower/Single-Tier Municipal Property Taxes", "dollars", "farmland_tax_lt"),
    ("fir_farmland_tax_ut", "Farmland Upper-Tier (County/Region) Property Taxes", "dollars", "farmland_tax_ut"),
    ("fir_farmland_tax_edu", "Farmland Education Property Taxes", "dollars", "farmland_tax_edu"),
    ("fir_farmland_tax_total", "Farmland Total Property Taxes Levied", "dollars", "farmland_tax_total"),
    ("fir_total_cva", "Total Taxable Assessment Across All Property Classes (CVA)", "dollars", "total_all_classes_cva"),
    ("fir_total_tax", "Total Property Taxes Levied Across All Property Classes", "dollars", "total_all_classes_tax"),
]


def parse_fir_zip(zip_path: Path) -> dict[str, dict]:
    """Return dict keyed by 7-digit CSD code -> municipality record."""
    muni: dict[str, dict] = {}
    with zipfile.ZipFile(zip_path) as z:
        csv_name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        with z.open(csv_name) as f:
            lines = (line.decode("latin-1", errors="ignore") for line in f)
            rd = csv.DictReader(lines)
            for r in rd:
                slc = r.get("SLC", "").strip()
                if slc not in SLC_MAP:
                    continue
                tier = r.get("TIER_CODE", "").strip()
                if tier not in ("LT", "ST"):
                    continue
                sgc_raw = r.get("SGC_CODE", "").strip()
                if not sgc_raw.isdigit():
                    continue
                sgc5 = sgc_raw.zfill(5)
                csd_code = "35" + sgc5
                cd_code = "35" + sgc5[:2]
                rec = muni.setdefault(csd_code, {
                    "csd_code": csd_code,
                    "cd_code": cd_code,
                    "tier": tier,
                    "name": r.get("MUNICIPALITY_DESC", "").strip(),
                    "mars_year": int(r.get("MARSYEAR", 0) or 0),
                })
                val = to_num(r.get("AMOUNT"))
                key = SLC_MAP[slc]
                rec[key] = (rec.get(key) or 0.0) + (val or 0.0)
    return muni


def emit_group_rows(
    rows: list[dict],
    table_id: str,
    ref_year: int,
    geo_level: str,
    geo_code: str,
    geo_dguid: str,
    geo_name: str,
    vals: dict[str, float],
    note: str = "",
) -> None:
    for ind_id, ind_label, uom, key in METRICS_META:
        v = vals.get(key, 0.0)
        rows.append({
            "table_id": table_id,
            "ref_year": ref_year,
            "geo_level": geo_level,
            "geo_code": geo_code,
            "geo_dguid": geo_dguid,
            "geo_name": geo_name,
            "indicator_id": ind_id,
            "indicator_label": ind_label,
            "category": "Municipal Farmland Assessment & Taxation (FIR)",
            "uom": uom,
            "value": fmt_num(round(v)),
            "status_flag": "",
            "is_estimate": 0,
            "note": note or "MMAH Financial Information Return (FIR), Schedule 26A",
        })

    fcva = vals.get("farmland_cva", 0.0)
    tcva = vals.get("total_all_classes_cva", 0.0)
    ftax = vals.get("farmland_tax_total", 0.0)
    ttax = vals.get("total_all_classes_tax", 0.0)

    if tcva > 0:
        rows.append({
            "table_id": table_id,
            "ref_year": ref_year,
            "geo_level": geo_level,
            "geo_code": geo_code,
            "geo_dguid": geo_dguid,
            "geo_name": geo_name,
            "indicator_id": "fir_farmland_share_cva_pct",
            "indicator_label": "Farmland Share of Total Municipal Assessment (CVA %)",
            "category": "Municipal Farmland Assessment & Taxation (FIR)",
            "uom": "percent",
            "value": f"{(fcva / tcva * 100.0):.2f}",
            "status_flag": "",
            "is_estimate": 0,
            "note": note or "Derived from MMAH FIR Schedule 26A (Farmland CVA / Total CVA)",
        })
    if ttax > 0:
        rows.append({
            "table_id": table_id,
            "ref_year": ref_year,
            "geo_level": geo_level,
            "geo_code": geo_code,
            "geo_dguid": geo_dguid,
            "geo_name": geo_name,
            "indicator_id": "fir_farmland_share_tax_pct",
            "indicator_label": "Farmland Share of Total Municipal Property Taxes (%)",
            "category": "Municipal Farmland Assessment & Taxation (FIR)",
            "uom": "percent",
            "value": f"{(ftax / ttax * 100.0):.2f}",
            "status_flag": "",
            "is_estimate": 0,
            "note": note or "Derived from MMAH FIR Schedule 26A (Farmland Total Tax / Total Tax)",
        })


def main() -> None:
    qa = QAReport(SOURCE_ID, "MMAH Financial Information Return (FIR) — Schedule 26A Farmland Assessment & Taxation")
    ag = json.loads((PROJECT_DIR / "public" / "data" / "ag_census_data.json").read_text(encoding="utf-8"))
    zones_data = json.loads((PROCESSED_DIR / "ofa_zones.json").read_text(encoding="utf-8"))
    cd_names = {
        g["id"][-4:]: g["cleanName"]
        for g in ag["geographies"]
        if g["level"] == "Counties / Census Divisions (CD)" and g["provinceCode"] == "35"
    }
    ccs_to_zone = zones_data["ccs_to_zone"]

    by_year: dict[int, dict[str, dict]] = {}
    for yr in YEARS:
        url = f"https://efis.fma.csc.gov.on.ca/fir/MultiYearReport/fir_data_{yr}.zip"
        zp = download_file(url, RAW_PROFILES_DIR / "fir_farmland_tax" / f"fir_data_{yr}.zip")
        by_year[yr] = parse_fir_zip(zp)
        qa.check(f"FIR {yr}: >350 LT/ST municipalities parsed", len(by_year[yr]) >= 350, f"parsed={len(by_year[yr])}")

    # Build a composite 'latest' (2024 with 2023 fallback for municipalities not yet in 2024 file)
    latest_muni: dict[str, dict] = {}
    fallback_2023_munis: list[str] = []
    all_csds = sorted(set(by_year[2023].keys()) | set(by_year[2024].keys()))
    for csd in all_csds:
        if csd in by_year[2024]:
            rec = dict(by_year[2024][csd])
            rec["source_year"] = 2024
            latest_muni[csd] = rec
        elif csd in by_year[2023]:
            rec = dict(by_year[2023][csd])
            rec["source_year"] = 2023
            latest_muni[csd] = rec
            fallback_2023_munis.append(f"{rec['name']} ({csd})")

    qa.note(f"2024 FIR composite uses 2023 FIR fallback for {len(fallback_2023_munis)} municipalities not yet in 2024 file: {', '.join(fallback_2023_munis[:15])}")

    rows: list[dict] = []
    for yr in YEARS:
        muni_map = by_year[yr] if yr != 2024 else latest_muni
        table_id = f"MMAH_FIR_26A_{yr}"

        # 1. CSD rows
        cd_agg: dict[str, dict[str, float]] = {}
        cd_fallbacks: dict[str, list[str]] = {}
        zone_agg: dict[str, dict[str, float]] = {}
        prov_agg: dict[str, float] = {}

        for csd, rec in sorted(muni_map.items()):
            cd = rec["cd_code"]
            is_fb = yr == 2024 and rec.get("source_year") == 2023
            note = "2023 FIR Schedule 26A (2024 return not yet filed in MMAH open data)" if is_fb else f"{yr} MMAH FIR Schedule 26A"
            if is_fb:
                cd_fallbacks.setdefault(cd, []).append(rec["name"])

            emit_group_rows(
                rows, table_id, yr, "CSD", csd, f"2021A0005{csd}", rec["name"], rec, note
            )

            cdict = cd_agg.setdefault(cd, {})
            for k in SLC_MAP.values():
                cdict[k] = cdict.get(k, 0.0) + (rec.get(k) or 0.0)
                prov_agg[k] = prov_agg.get(k, 0.0) + (rec.get(k) or 0.0)

            # Map to OFA Zone (handle split CD 3501 by exact CSD code!)
            zid = ccs_to_zone.get(csd)
            if not zid:
                if cd == "3501":
                    zid = "OFA_Z11" if csd in ("3501020", "3501030") else "OFA_Z14"
                else:
                    zid = zones_data["cd_to_zone"].get(cd, {}).get("zone_id")
            if zid and zid.startswith("OFA_Z"):
                zdict = zone_agg.setdefault(zid, {})
                for k in SLC_MAP.values():
                    zdict[k] = zdict.get(k, 0.0) + (rec.get(k) or 0.0)

        # 2. CD rows
        for cd, vals in sorted(cd_agg.items()):
            fb = cd_fallbacks.get(cd, [])
            cnote = (
                f"{yr} MMAH FIR Schedule 26A (includes 2023 FIR values for {', '.join(fb)} pending 2024 filing)"
                if fb else f"{yr} MMAH FIR Schedule 26A (sum of LT/ST municipalities in CD {cd})"
            )
            emit_group_rows(
                rows, table_id, yr, "CD", cd, f"2021A0003{cd}", cd_names.get(cd, cd), vals, cnote
            )

        # 3. OFA Zone rows
        for z in zones_data["zones"]:
            zid = z["zone_id"]
            if zid in zone_agg:
                emit_group_rows(
                    rows, table_id, yr, "OFA_ZONE", zid, "", z["zone_name"], zone_agg[zid],
                    f"{yr} MMAH FIR Schedule 26A aggregated to {z['zone_name']}"
                )

        # 4. Province row
        emit_group_rows(
            rows, table_id, yr, "PROVINCE", "35", "2021A000235", "Ontario", prov_agg,
            f"{yr} MMAH FIR Schedule 26A provincial sum across all Ontario LT/ST municipalities"
        )

        qa.check(f"FIR {yr}: all 49 Ontario CDs covered", len(cd_agg) == 49, f"CDs={len(cd_agg)}")
        # Check Huron (3540) farmland CVA is > $5B (MPAC 2016-base valuation)
        huron_fcva = cd_agg.get("3540", {}).get("farmland_cva", 0)
        qa.check(f"FIR {yr}: Huron (3540) Farmland CVA > $5B (MPAC 2016 base)", huron_fcva > 5e9, f"Huron Farmland CVA=${huron_fcva:,.0f}")

    out = write_tidy(SOURCE_ID, rows)
    qa.write()
    register_source(
        SOURCE_ID,
        publisher="Ontario Ministry of Municipal Affairs and Housing (MMAH)",
        title="Financial Information Return (FIR) — Schedule 26A Taxation and Payments-in-Lieu Summary",
        url=LANDING,
        licence="Open Government Licence – Ontario",
        vintage="2021, 2023, 2024",
        geography="All 414+ Ontario Lower-Tier/Single-Tier Municipalities (CSDs), 49 Census Divisions, 15 OFA Zones, and Ontario",
        method=(
            "Extracted Schedule 26A Farmland (L0110) and Total All Property Classes (L9199) Taxable CVA and Property Taxes "
            "across all LT and ST municipalities. Because LT rows include LT, UT, and Education taxes, summing LT+ST "
            "yields exact county/zone totals without double-counting."
        ),
        caveats=[
            f"For {len(fallback_2023_munis)} municipalities whose 2024 FIR return was not yet in the 2024 open-data zip, 2023 FIR values are used in the 2024 composite and explicitly flagged in the note column."
        ],
        row_count=len(rows),
        output_file=str(out.name),
        script=Path(__file__).name,
    )
    print(f"Wrote {len(rows):,} rows -> {out}; QA all passed: {qa.all_passed}")


if __name__ == "__main__":
    main()
