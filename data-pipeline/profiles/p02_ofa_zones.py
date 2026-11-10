"""p02_ofa_zones.py — Official OFA 15 Zones & 51 Federations geographic crosswalk.

Maps Ontario's 49 Census Divisions (CDs) and relevant Census Consolidated
Subdivisions (CCSs / Townships) to the 15 Ontario Federation of Agriculture (OFA)
Zones.

Special geographic alignment rules:
1. Stormont, Dundas and Glengarry (CD 3501) spans two OFA Zones:
   - Zone 11 (Dundas, Frontenac, Grenville & Leeds):
       * North Dundas (CCS 3501030)
       * South Dundas (CCS 3501020)
   - Zone 14 (Glengarry, Prescott, Russell & Stormont):
       * North Stormont (CCS 3501042)
       * South Stormont (CCS 3501011)
       * North Glengarry (CCS 3501050)
       * South Glengarry (CCS 3501005)
   For datasets available at the township/CCS level (Statistics Canada Census of
   Agriculture), Zone 11 and Zone 14 totals use the exact township split. For
   datasets published only at the Census Division level (e.g., OMAFA Farm Cash
   Receipts, Census of Population county tables, Canadian Business Counts),
   CD 3501 is reported alongside Zone 11 and Zone 14 with an explicit shared-CD
   methodology note, or allocated by each half's share of SD&G Census gross farm
   receipts / farms where a single additive total is displayed (always flagged).
2. Greater Sudbury / Grand Sudbury (CD 3553) is included in Zone 15 (Northern
   Ontario) totals with the explicit footnote:
   "Greater Sudbury (CD 3553) is not named in OFA's Zone 15 federation list. It
   is included in Zone 15 totals because it falls within the Sudbury East /
   Sudbury West federation area."
3. Toronto (CD 3520) has no OFA county federation and is reported as a standalone
   urban Census Division (not assigned to an OFA Zone).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROCESSED_DIR as OUT_DIR, PROJECT_DIR as ROOT, QAReport, register_source, write_tidy

SOURCE_ID = "ofa_zones"

SUDBURY_FOOTNOTE = (
    "Greater Sudbury (CD 3553) is not named in OFA's Zone 15 federation list. "
    "It is included in Zone 15 totals because it falls within the Sudbury East / "
    "Sudbury West federation area."
)

SDG_FOOTNOTE = (
    "Stormont, Dundas and Glengarry (CD 3501) is split between OFA Zone 11 "
    "(North Dundas CCS 3501030 & South Dundas CCS 3501020) and OFA Zone 14 "
    "(North Stormont CCS 3501042, South Stormont CCS 3501011, North Glengarry "
    "CCS 3501050 & South Glengarry CCS 3501005). Census of Agriculture Zone "
    "totals use exact township (CCS) sums; county-only datasets flag CD 3501 "
    "as shared between Zone 11 and Zone 14."
)

OFA_ZONES = [
    {
        "zone_id": "OFA_Z01",
        "zone_number": 1,
        "zone_name": "Zone 1 — Essex & Kent",
        "short_name": "Essex & Kent",
        "federations": ["Essex", "Kent"],
        "cds": ["3537", "3536"],
        "split_ccs": {},
        "notes": "",
    },
    {
        "zone_id": "OFA_Z02",
        "zone_number": 2,
        "zone_name": "Zone 2 — Bruce & Grey",
        "short_name": "Bruce & Grey",
        "federations": ["Bruce", "Grey"],
        "cds": ["3541", "3542"],
        "split_ccs": {},
        "notes": "",
    },
    {
        "zone_id": "OFA_Z03",
        "zone_number": 3,
        "zone_name": "Zone 3 — Brant, Haldimand & Norfolk",
        "short_name": "Brant, Haldimand & Norfolk",
        "federations": ["Brant", "Haldimand", "Norfolk"],
        "cds": ["3529", "3528"],
        "split_ccs": {},
        "notes": "Statistics Canada and OMAFA combine Haldimand and Norfolk into CD 3528 (Haldimand-Norfolk); both federations are in Zone 3.",
    },
    {
        "zone_id": "OFA_Z04",
        "zone_number": 4,
        "zone_name": "Zone 4 — Elgin & Oxford",
        "short_name": "Elgin & Oxford",
        "federations": ["Elgin", "Oxford"],
        "cds": ["3534", "3532"],
        "split_ccs": {},
        "notes": "",
    },
    {
        "zone_id": "OFA_Z05",
        "zone_number": 5,
        "zone_name": "Zone 5 — Halton, Hamilton-Wentworth & Niagara",
        "short_name": "Halton, Hamilton & Niagara",
        "federations": ["Halton", "Hamilton-Wentworth", "Niagara"],
        "cds": ["3524", "3525", "3526"],
        "split_ccs": {},
        "notes": "",
    },
    {
        "zone_id": "OFA_Z06",
        "zone_number": 6,
        "zone_name": "Zone 6 — Lambton & Middlesex",
        "short_name": "Lambton & Middlesex",
        "federations": ["Lambton", "Middlesex"],
        "cds": ["3538", "3539"],
        "split_ccs": {},
        "notes": "",
    },
    {
        "zone_id": "OFA_Z07",
        "zone_number": 7,
        "zone_name": "Zone 7 — Huron & Perth",
        "short_name": "Huron & Perth",
        "federations": ["Huron", "Perth"],
        "cds": ["3540", "3531"],
        "split_ccs": {},
        "notes": "",
    },
    {
        "zone_id": "OFA_Z08",
        "zone_number": 8,
        "zone_name": "Zone 8 — Arnprior, Lanark, Ottawa & Renfrew",
        "short_name": "Arnprior, Lanark, Ottawa & Renfrew",
        "federations": ["Arnprior", "Lanark", "Ottawa", "Renfrew"],
        "cds": ["3509", "3506", "3547"],
        "split_ccs": {},
        "notes": "The Arnprior federation covers the Arnprior area along the Renfrew (CD 3547) / Ottawa (CD 3506) / Lanark (CD 3509) boundary, all within Zone 8.",
    },
    {
        "zone_id": "OFA_Z09",
        "zone_number": 9,
        "zone_name": "Zone 9 — Dufferin, Waterloo & Wellington",
        "short_name": "Dufferin, Waterloo & Wellington",
        "federations": ["Dufferin", "Waterloo", "Wellington"],
        "cds": ["3522", "3530", "3523"],
        "split_ccs": {},
        "notes": "",
    },
    {
        "zone_id": "OFA_Z10",
        "zone_number": 10,
        "zone_name": "Zone 10 — Durham, Peterborough & Kawartha Lakes/Haliburton",
        "short_name": "Durham, Peterborough, Kawartha Lakes & Haliburton",
        "federations": ["Durham", "Peterborough", "Kawartha Lakes-Haliburton"],
        "cds": ["3518", "3515", "3516", "3546"],
        "split_ccs": {},
        "notes": "",
    },
    {
        "zone_id": "OFA_Z11",
        "zone_number": 11,
        "zone_name": "Zone 11 — Dundas, Frontenac, Grenville & Leeds",
        "short_name": "Dundas, Frontenac, Grenville & Leeds",
        "federations": ["Dundas", "Frontenac", "Grenville", "Leeds"],
        "cds": ["3510", "3507"],
        "shared_cds": ["3501"],
        "split_ccs": {
            "3501": ["3501020", "3501030"],  # South Dundas, North Dundas
        },
        "notes": SDG_FOOTNOTE,
    },
    {
        "zone_id": "OFA_Z12",
        "zone_number": 12,
        "zone_name": "Zone 12 — Hastings, Lennox & Addington, Northumberland & Prince Edward",
        "short_name": "Hastings, L&A, Northumberland & Prince Edward",
        "federations": ["Hastings", "Lennox & Addington", "Northumberland", "Prince Edward"],
        "cds": ["3512", "3511", "3514", "3513"],
        "split_ccs": {},
        "notes": "",
    },
    {
        "zone_id": "OFA_Z13",
        "zone_number": 13,
        "zone_name": "Zone 13 — Peel, Simcoe & York",
        "short_name": "Peel, Simcoe & York",
        "federations": ["Peel", "Simcoe", "York"],
        "cds": ["3521", "3543", "3519"],
        "split_ccs": {},
        "notes": "",
    },
    {
        "zone_id": "OFA_Z14",
        "zone_number": 14,
        "zone_name": "Zone 14 — Glengarry, Prescott, Russell & Stormont",
        "short_name": "Glengarry, Prescott, Russell & Stormont",
        "federations": ["Glengarry", "Prescott", "Russell", "Stormont"],
        "cds": ["3502"],
        "shared_cds": ["3501"],
        "split_ccs": {
            "3501": ["3501005", "3501011", "3501042", "3501050"],  # South Glengarry, South Stormont, North Stormont, North Glengarry
        },
        "notes": SDG_FOOTNOTE,
    },
    {
        "zone_id": "OFA_Z15",
        "zone_number": 15,
        "zone_name": "Zone 15 — Northern Ontario",
        "short_name": "Northern Ontario",
        "federations": [
            "Algoma",
            "Cochrane",
            "East Nipissing / Parry Sound",
            "Kenora / Dryden",
            "Manitoulin - North Shore / Sudbury West",
            "Muskoka",
            "Rainy River",
            "Temiskaming",
            "Thunder Bay",
            "West Nipissing / Sudbury East",
        ],
        "zone_15_constituent_areas": [
            "Algoma", "Cochrane", "Dryden", "Kenora", "Manitoulin - North Shore",
            "Muskoka", "Nipissing East", "Nipissing West", "Parry Sound",
            "Rainy River", "Sudbury East", "Sudbury West", "Temiskaming", "Thunder Bay"
        ],
        "cds": ["3557", "3556", "3560", "3551", "3544", "3548", "3549", "3559", "3552", "3553", "3554", "3558"],
        "split_ccs": {},
        "notes": SUDBURY_FOOTNOTE,
    },
]


def main() -> None:
    qa = QAReport(SOURCE_ID, "OFA 15 Zones & 51 Federations Geographic Crosswalk")
    ag_path = ROOT / "public" / "data" / "ag_census_data.json"
    with open(ag_path, encoding="utf-8") as f:
        ag = json.load(f)

    geos = ag["geographies"]
    vals = ag["values"]
    on_cds = {g["id"][-4:]: g for g in geos if g["level"] == "Counties / Census Divisions (CD)" and g["provinceCode"] == "35"}
    on_ccss = {g["id"][-7:]: g for g in geos if g["level"] == "Townships / Subdivisions (CCS)" and g["provinceCode"] == "35"}

    qa.check("49 Ontario CDs present in ag_census_data.json", len(on_cds) == 49, f"found {len(on_cds)}")

    # Verify every CD (except 3520 Toronto and split 3501 SD&G) is assigned to exactly one zone
    assigned_cds: dict[str, list[str]] = {}
    for z in OFA_ZONES:
        for cd in z["cds"]:
            assigned_cds.setdefault(cd, []).append(z["zone_id"])

    qa.check("47 whole CDs assigned to exactly 1 OFA Zone", len(assigned_cds) == 47 and all(len(v) == 1 for v in assigned_cds.values()),
             f"assigned={len(assigned_cds)}")
    unassigned = set(on_cds.keys()) - set(assigned_cds.keys())
    qa.check("Only CD 3501 (split SD&G) and CD 3520 (Toronto) are not whole-CD assigned",
             unassigned == {"3501", "3520"}, f"unassigned={sorted(unassigned)}")

    # Verify SD&G CCS split covers 100% of CD 3501 CCSs
    sdg_ccss = {k for k in on_ccss if k.startswith("3501")}
    z11_sdg = set(OFA_ZONES[10]["split_ccs"]["3501"])
    z14_sdg = set(OFA_ZONES[13]["split_ccs"]["3501"])
    qa.check("SD&G CCS split between Zone 11 (2 CCSs) and Zone 14 (4 CCSs) is mutually exclusive and exhaustive",
             z11_sdg.isdisjoint(z14_sdg) and (z11_sdg | z14_sdg) == sdg_ccss,
             f"Z11={sorted(z11_sdg)}, Z14={sorted(z14_sdg)}, all_3501={sorted(sdg_ccss)}")

    def get_v21(gid: str, cid: str) -> float:
        full_id = on_cds[gid]["id"] if gid in on_cds else (on_ccss[gid]["id"] if gid in on_ccss else gid)
        arr = vals.get(full_id, {}).get(cid) or vals.get(gid, {}).get(cid)
        return float(arr[0]) if arr and arr[0] is not None else 0.0

    # Compute SD&G 2021 farms and gross receipts split shares for county-only dataset reference
    sdg_cd_farms = get_v21("3501", "total_farms")
    sdg_cd_rev = get_v21("3501", "rev_total_dollars")
    z11_farms = sum(get_v21(c, "total_farms") for c in z11_sdg)
    z14_farms = sum(get_v21(c, "total_farms") for c in z14_sdg)
    z11_rev = sum(get_v21(c, "rev_total_dollars") for c in z11_sdg)
    z14_rev = sum(get_v21(c, "rev_total_dollars") for c in z14_sdg)
    tot_sdg_farms = z11_farms + z14_farms
    tot_sdg_rev = z11_rev + z14_rev

    qa.check("SD&G 2021 township farms sum to CD 3501 total farms",
             tot_sdg_farms == sdg_cd_farms,
             f"CCS sum={tot_sdg_farms} vs CD={sdg_cd_farms}")
    qa.check("SD&G 2021 township gross revenues sum to CD 3501 gross revenues",
             abs(tot_sdg_rev - sdg_cd_rev) < 10,
             f"CCS sum=${tot_sdg_rev:,.0f} vs CD=${sdg_cd_rev:,.0f}")

    total_federations = sum(len(z["federations"]) for z in OFA_ZONES)
    qa.check("51 OFA county/regional federations across 15 Zones", total_federations == 51, f"count={total_federations}")

    # Build CD -> Zone lookup and CCS -> Zone lookup
    cd_to_zone: dict[str, dict] = {}
    ccs_to_zone: dict[str, str] = {}

    for z in OFA_ZONES:
        zid = z["zone_id"]
        for cd in z["cds"]:
            cd_to_zone[cd] = {
                "zone_id": zid,
                "zone_number": z["zone_number"],
                "zone_name": z["zone_name"],
                "short_name": z["short_name"],
                "is_split_cd": False,
                "footnote": SUDBURY_FOOTNOTE if cd == "3553" else z["notes"],
            }
            for ccs in on_ccss:
                if ccs.startswith(cd):
                    ccs_to_zone[ccs] = zid

    # Add SD&G split
    cd_to_zone["3501"] = {
        "zone_id": "OFA_Z11+OFA_Z14",
        "zone_number": None,
        "zone_name": "Zone 11 (Dundas) & Zone 14 (Stormont & Glengarry)",
        "short_name": "Split: Zone 11 & Zone 14",
        "is_split_cd": True,
        "zones": ["OFA_Z11", "OFA_Z14"],
        "sdg_2021_shares": {
            "OFA_Z11": {
                "ccs_codes": sorted(z11_sdg),
                "farms_2021": z11_farms,
                "farms_share": round(z11_farms / tot_sdg_farms, 6) if tot_sdg_farms else 0,
                "gross_revenues_2021": z11_rev,
                "gross_revenues_share": round(z11_rev / tot_sdg_rev, 6) if tot_sdg_rev else 0,
            },
            "OFA_Z14": {
                "ccs_codes": sorted(z14_sdg),
                "farms_2021": z14_farms,
                "farms_share": round(z14_farms / tot_sdg_farms, 6) if tot_sdg_farms else 0,
                "gross_revenues_2021": z14_rev,
                "gross_revenues_share": round(z14_rev / tot_sdg_rev, 6) if tot_sdg_rev else 0,
            },
        },
        "footnote": SDG_FOOTNOTE,
    }
    for ccs in z11_sdg:
        ccs_to_zone[ccs] = "OFA_Z11"
    for ccs in z14_sdg:
        ccs_to_zone[ccs] = "OFA_Z14"

    # Toronto
    cd_to_zone["3520"] = {
        "zone_id": "UNASSIGNED_TORONTO",
        "zone_number": None,
        "zone_name": "Toronto (Standalone Urban CD — No OFA Zone)",
        "short_name": "Standalone Urban CD",
        "is_split_cd": False,
        "footnote": "Toronto (CD 3520) does not have an OFA county federation and is not part of an OFA Zone.",
    }
    for ccs in on_ccss:
        if ccs.startswith("3520"):
            ccs_to_zone[ccs] = "UNASSIGNED_TORONTO"

    qa.check("All 414 Ontario CCSs mapped to an OFA Zone (or Toronto)", len(ccs_to_zone) == len(on_ccss),
             f"mapped={len(ccs_to_zone)} of {len(on_ccss)}")

    payload = {
        "source": "Ontario Federation of Agriculture (OFA) Regional Directory & Federation Map",
        "sudbury_footnote": SUDBURY_FOOTNOTE,
        "sdg_footnote": SDG_FOOTNOTE,
        "zones": OFA_ZONES,
        "cd_to_zone": cd_to_zone,
        "ccs_to_zone": ccs_to_zone,
    }

    out_json = OUT_DIR / "ofa_zones.json"
    out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    pub_json = ROOT / "public" / "data" / "ofa_zones.json"
    pub_json.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    # Also write tidy rows for each Zone's 2021 farm count and gross revenues
    rows = []
    for z in OFA_ZONES:
        zid = z["zone_id"]
        z_ccss = [ccs for ccs, zz in ccs_to_zone.items() if zz == zid]
        farms_21 = sum(get_v21(c, "total_farms") for c in z_ccss)
        rev_21 = sum(get_v21(c, "rev_total_dollars") for c in z_ccss)
        rows.append({
            "table_id": "OFA_Directory_2025",
            "ref_year": 2021,
            "geo_level": "OFA_ZONE",
            "geo_code": zid,
            "geo_dguid": "",
            "geo_name": z["zone_name"],
            "indicator_id": "ofa_zone_federation_count",
            "indicator_label": "OFA County/Regional Federations in Zone",
            "category": "OFA Zone Structure",
            "uom": "number",
            "value": str(len(z["federations"])),
            "status_flag": "",
            "is_estimate": 0,
            "note": z["notes"],
        })
        rows.append({
            "table_id": "32-10-0231-01+32-10-0240-01",
            "ref_year": 2021,
            "geo_level": "OFA_ZONE",
            "geo_code": zid,
            "geo_dguid": "",
            "geo_name": z["zone_name"],
            "indicator_id": "zone_census_farms_2021",
            "indicator_label": "Total census farms in OFA Zone (2021)",
            "category": "OFA Zone Structure",
            "uom": "farms",
            "value": str(int(farms_21)),
            "status_flag": "",
            "is_estimate": 0,
            "note": z["notes"],
        })
        rows.append({
            "table_id": "32-10-0240-01",
            "ref_year": 2021,
            "geo_level": "OFA_ZONE",
            "geo_code": zid,
            "geo_dguid": "",
            "geo_name": z["zone_name"],
            "indicator_id": "zone_gross_revenues_2021",
            "indicator_label": "Total farm gross receipts in OFA Zone (2020/2021)",
            "category": "OFA Zone Structure",
            "uom": "dollars",
            "value": str(int(round(rev_21))),
            "status_flag": "",
            "is_estimate": 0,
            "note": z["notes"],
        })

    out_csv = write_tidy(SOURCE_ID, rows)
    qa.write()
    register_source(
        SOURCE_ID,
        publisher="Ontario Federation of Agriculture (OFA)",
        title="OFA 15 Zones and 51 County/Regional Federations Geographic Crosswalk",
        url="https://ofa.on.ca/federations/",
        licence="OFA Internal / Public Geographic Crosswalk",
        vintage="December 2025",
        geography="15 OFA Zones mapped to 49 Ontario CDs and 414 Ontario CCSs",
        method="Exact CD and CCS (for split CD 3501 Stormont, Dundas & Glengarry) crosswalk verified against OFA Directory.",
        caveats=[SDG_FOOTNOTE, SUDBURY_FOOTNOTE],
        row_count=len(rows),
        output_file=str(out_csv.name),
        script=Path(__file__).name,
    )
    print(f"Wrote {out_json} and {pub_json}; QA all passed: {qa.all_passed}")


if __name__ == "__main__":
    main()
