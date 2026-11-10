"""p07_compile_county_profiles_2_0.py — Compile Unified OFA County & Zone Profiles 2.0 Dataset.

Combines all empirical and reconciled datasets from `p01`–`p06` + `public/data/ag_census_data.json`
into `public/data/ofa_county_profiles_2_0.json` (and `.json.gz`) to power:
  1. The OFA County & Zone Profiles 2.0 Excel Generator (`15_generate_ofa_county_profiles_2_0.py`)
  2. The interactive "County & Zone Profiles 2.0" module in AgCensus IQ (`AgCountyProfilesModule.tsx`)
"""
from __future__ import annotations

import csv
import gzip
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (
    PROCESSED_DIR,
    PROJECT_DIR,
    QAReport,
    now_iso,
    register_source,
    to_num,
)

SOURCE_ID = "ofa_county_profiles_2_0_master"


def load_tidy_csv(filename: str) -> list[dict[str, str]]:
    path = PROCESSED_DIR / filename
    with path.open("r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def get_ag_val(values_map: dict, dguid: str, char_id: str, idx: int = 0) -> float | None:
    obs = values_map.get(dguid, {}).get(char_id)
    if not obs or idx >= len(obs):
        return None
    v = obs[idx]
    if isinstance(v, (int, float)):
        return float(v)
    return None


def safe_pct(num: float | None, den: float | None, decimals: int = 2) -> float | None:
    if num is None or den is None or den == 0:
        return None
    return round(num / den * 100.0, decimals)


def safe_chg_pct(v_new: float | None, v_old: float | None, decimals: int = 2) -> float | None:
    if v_new is None or v_old is None or v_old == 0:
        return None
    return round((v_new - v_old) / v_old * 100.0, decimals)


def main() -> None:
    qa = QAReport(SOURCE_ID, "Unified OFA County & Zone Profiles 2.0 Master Dataset")

    ag = json.loads((PROJECT_DIR / "public" / "data" / "ag_census_data.json").read_text(encoding="utf-8"))
    zones_data = json.loads((PROCESSED_DIR / "ofa_zones.json").read_text(encoding="utf-8"))
    values_map = ag["values"]

    print("Loading tidy CSV outputs from p01..p06...")
    fcr_rows = load_tidy_csv("omafa_fcr_county.csv")
    crops_rows = load_tidy_csv("omafa_field_crops_county.csv")
    fir_rows = load_tidy_csv("fir_farmland_tax.csv")
    bb_land_rows = load_tidy_csv("broadband_and_land.csv")
    cp_rows = load_tidy_csv("omafa_community_profile.csv")
    biz_rows = load_tidy_csv("omafa_business_counts.csv")
    aco_rows = load_tidy_csv("omafa_ag_census_over_time.csv")
    food_rows = load_tidy_csv("omafa_food_estimates.csv")

    # Build geography metadata lookups
    cd_nodes: dict[str, dict] = {}
    ccs_nodes: dict[str, dict] = {}
    for g in ag["geographies"]:
        if g["provinceCode"] != "35":
            continue
        if g["level"] == "Counties / Census Divisions (CD)":
            code = g["id"][-4:]
            cd_nodes[code] = g
        elif g["level"] == "Townships / Subdivisions (CCS)":
            code = g["id"][-7:]
            ccs_nodes[code] = g

    cd_to_zone = zones_data["cd_to_zone"]
    ccs_to_zone = zones_data["ccs_to_zone"]
    zone_meta = {z["zone_id"]: z for z in zones_data["zones"]}
    sdg_shares = cd_to_zone["3501"]["sdg_2021_shares"]
    sdg_z11_rev_share = sdg_shares["OFA_Z11"]["gross_revenues_share"]
    sdg_z14_rev_share = sdg_shares["OFA_Z14"]["gross_revenues_share"]
    # Compute exact 2021 Census cropland acre shares across SD&G CCSs (North/South Dundas vs Stormont & Glengarry)
    z11_crop_ac = sum(get_ag_val(values_map, ccs_nodes[c]["id"], "land_crops_acres", 0) or 0.0 for c in sdg_shares["OFA_Z11"]["ccs_codes"] if c in ccs_nodes)
    z14_crop_ac = sum(get_ag_val(values_map, ccs_nodes[c]["id"], "land_crops_acres", 0) or 0.0 for c in sdg_shares["OFA_Z14"]["ccs_codes"] if c in ccs_nodes)
    tot_sdg_crop_ac = z11_crop_ac + z14_crop_ac
    sdg_z11_acre_share = (z11_crop_ac / tot_sdg_crop_ac) if tot_sdg_crop_ac > 0 else sdg_shares["OFA_Z11"]["farms_share"]
    sdg_z14_acre_share = (z14_crop_ac / tot_sdg_crop_ac) if tot_sdg_crop_ac > 0 else sdg_shares["OFA_Z14"]["farms_share"]

    # -------------------------------------------------------------------------
    # Index p01: OMAFA Farm Cash Receipts (2011..2025)
    # -------------------------------------------------------------------------
    # fcr_idx[(geo_level, geo_code)][indicator_id][year] = (val_dollars, label)
    fcr_idx: dict[tuple[str, str], dict[str, dict[int, float]]] = {}
    fcr_labels: dict[str, str] = {}
    for r in fcr_rows:
        glevel = r["geo_level"]
        gcode = r["geo_code"]
        if glevel not in ("PROVINCE", "CD"):
            continue
        ind_id = r["indicator_id"]
        fcr_labels[ind_id] = r["indicator_label"]
        yr = int(r["ref_year"])
        val = to_num(r["value"])
        if val is None:
            continue
        # Convert $ millions / $ thousands to exact dollars
        uom = r["uom"].lower()
        val_dollars = val * 1_000_000.0 if "million" in uom else (val * 1000.0 if "thousand" in uom else val)
        fcr_idx.setdefault((glevel, gcode), {}).setdefault(ind_id, {})[yr] = val_dollars
        # Aggregate to OFA Zone (splitting CD 3501 by 2021 Census gross farm revenue share)
        if glevel == "CD":
            if gcode == "3501":
                for zid, sh in (("OFA_Z11", sdg_z11_rev_share), ("OFA_Z14", sdg_z14_rev_share)):
                    zmap = fcr_idx.setdefault(("OFA_ZONE", zid), {}).setdefault(ind_id, {})
                    zmap[yr] = zmap.get(yr, 0.0) + val_dollars * sh
            else:
                zid = cd_to_zone.get(gcode, {}).get("zone_id")
                if zid and zid.startswith("OFA_Z"):
                    zmap = fcr_idx.setdefault(("OFA_ZONE", zid), {}).setdefault(ind_id, {})
                    zmap[yr] = zmap.get(yr, 0.0) + val_dollars

    # -------------------------------------------------------------------------
    # Index p03: OMAFA Field Crops (2011..2025)
    # -------------------------------------------------------------------------
    # crops_idx[(geo_level, geo_code)][indicator_id][year] = val
    crops_idx: dict[tuple[str, str], dict[str, dict[int, float]]] = {}
    crops_meta: dict[str, tuple[str, str]] = {}
    for r in crops_rows:
        glevel = r["geo_level"]
        gcode = r["geo_code"]
        if glevel not in ("PROVINCE", "CD"):
            continue
        ind_id = r["indicator_id"]
        crops_meta[ind_id] = (r["indicator_label"], r["uom"])
        yr = int(r["ref_year"])
        val = to_num(r["value"])
        if val is None:
            continue
        crops_idx.setdefault((glevel, gcode), {}).setdefault(ind_id, {})[yr] = val
        # Aggregate additive area/production metrics to OFA Zone
        if glevel == "CD" and any(k in ind_id for k in ("_acres", "_prod_")):
            if gcode == "3501":
                for zid, sh in (("OFA_Z11", sdg_z11_acre_share), ("OFA_Z14", sdg_z14_acre_share)):
                    zmap = crops_idx.setdefault(("OFA_ZONE", zid), {}).setdefault(ind_id, {})
                    zmap[yr] = zmap.get(yr, 0.0) + val * sh
            else:
                zid = cd_to_zone.get(gcode, {}).get("zone_id")
                if zid and zid.startswith("OFA_Z"):
                    zmap = crops_idx.setdefault(("OFA_ZONE", zid), {}).setdefault(ind_id, {})
                    zmap[yr] = zmap.get(yr, 0.0) + val

    # Compute derived yield for OFA Zones = prod_imp / harvested_acres
    for (glevel, gcode), cmap in list(crops_idx.items()):
        if glevel != "OFA_ZONE":
            continue
        prefixes = {
            k.replace("_harvested_acres", "")
             .replace("_seeded_acres", "")
             .replace("_prod_tonnes", "")
             .replace("_prod_imp", "")
            for k in cmap
        }
        for cpfx in prefixes:
            h_map = cmap.get(f"{cpfx}_harvested_acres", {})
            pi_map = cmap.get(f"{cpfx}_prod_imp", {})
            y_map = cmap.setdefault(f"{cpfx}_yield", {})
            for yr, harv in h_map.items():
                pi = pi_map.get(yr)
                if harv and harv > 0 and pi is not None:
                    y_map[yr] = round((pi * 1000.0) / harv, 1)

    # -------------------------------------------------------------------------
    # Index p04: FIR Farmland Assessment & Property Taxes (2021, 2023, 2024)
    # -------------------------------------------------------------------------
    fir_idx: dict[tuple[str, str, int], dict[str, float]] = {}
    fir_csds_by_cd: dict[str, list[tuple[str, str]]] = {}
    for r in fir_rows:
        glevel = r["geo_level"]
        gcode = r["geo_code"]
        yr = int(r["ref_year"])
        val = to_num(r["value"])
        if val is None:
            continue
        fir_idx.setdefault((glevel, gcode, yr), {})[r["indicator_id"]] = val
        if glevel == "CSD" and yr == 2024:
            cd_part = gcode[:4]
            pair = (gcode, r["geo_name"])
            if pair not in fir_csds_by_cd.setdefault(cd_part, []):
                fir_csds_by_cd[cd_part].append(pair)

    # -------------------------------------------------------------------------
    # Index p05: Broadband, Greenbelt & CLI Soil
    # -------------------------------------------------------------------------
    bb_land_idx: dict[tuple[str, str], dict[str, float]] = {}
    for r in bb_land_rows:
        val = to_num(r["value"])
        if val is not None:
            bb_land_idx.setdefault((r["geo_level"], r["geo_code"]), {})[r["indicator_id"]] = val

    # -------------------------------------------------------------------------
    # Index p06: Community Profile, Business Counts, Ag Census Over Time, Food Est
    # -------------------------------------------------------------------------
    cp_idx: dict[tuple[str, str, int], dict[str, float]] = {}
    cp_meta: dict[str, tuple[str, str, str]] = {}
    csds_by_cd: dict[str, list[tuple[str, str]]] = {}
    for r in cp_rows:
        glevel, gcode, yr = r["geo_level"], r["geo_code"], int(r["ref_year"])
        ind_id = r["indicator_id"]
        cp_meta[ind_id] = (r["indicator_label"], r["category"], r["uom"])
        val = to_num(r["value"])
        if val is not None:
            cp_idx.setdefault((glevel, gcode, yr), {})[ind_id] = val
        if glevel == "CSD" and len(gcode) == 7:
            cd_part = gcode[:4]
            pair = (gcode, r["geo_name"])
            if pair not in csds_by_cd.setdefault(cd_part, []):
                csds_by_cd[cd_part].append(pair)

    biz_idx: dict[tuple[str, str, int], dict[str, float]] = {}
    biz_labels: dict[str, str] = {}
    for r in biz_rows:
        glevel, gcode, yr = r["geo_level"], r["geo_code"], int(r["ref_year"])
        ind_id = r["indicator_id"]
        biz_labels[ind_id] = r["indicator_label"]
        val = to_num(r["value"])
        if val is not None:
            biz_idx.setdefault((glevel, gcode, yr), {})[ind_id] = val

    aco_idx: dict[tuple[str, str], dict[str, dict[int, tuple[float | None, str]]]] = {}
    aco_meta: dict[str, tuple[str, str]] = {}
    for r in aco_rows:
        glevel, gcode, yr = r["geo_level"], r["geo_code"], int(r["ref_year"])
        ind_id = r["indicator_id"]
        aco_meta[ind_id] = (r["indicator_label"], r["uom"])
        val = to_num(r["value"])
        flag = r["status_flag"]
        aco_idx.setdefault((glevel, gcode), {}).setdefault(ind_id, {})[yr] = (val, flag)

    # Compute exact 2021 Census population shares across SD&G CSDs for demand-side food consumption splits
    z11_pop21 = sum(cp_idx.get(("CSD", c, 2021), {}).get("pop_age_distribution_2021_census_total_age", 0.0) for c in ("3501020", "3501030"))
    z14_pop21 = sum(
        v.get("pop_age_distribution_2021_census_total_age", 0.0)
        for (gl, gc, gy), v in cp_idx.items()
        if gl == "CSD" and gy == 2021 and gc.startswith("3501") and gc not in ("3501020", "3501030")
    )
    tot_sdg_pop21 = z11_pop21 + z14_pop21
    sdg_z11_pop_share = (z11_pop21 / tot_sdg_pop21) if tot_sdg_pop21 > 0 else sdg_z11_acre_share
    sdg_z14_pop_share = (z14_pop21 / tot_sdg_pop21) if tot_sdg_pop21 > 0 else sdg_z14_acre_share

    food_idx: dict[tuple[str, str, int], dict[str, tuple[float | None, str, str, str]]] = {}
    food_zone_sum: dict[tuple[str, str, int, str], list[Any]] = {}
    for r in food_rows:
        glevel, gcode, yr = r["geo_level"], r["geo_code"], int(r["ref_year"])
        val = to_num(r["value"])
        ind_id = r["indicator_id"]
        food_idx.setdefault((glevel, gcode, yr), {})[ind_id] = (
            val,
            r["status_flag"],
            r["indicator_label"],
            r["uom"],
        )
        # Aggregate additive food_cons_ metrics across CDs to PROVINCE and OFA_ZONE
        if glevel == "CD" and val is not None and ind_id.startswith("food_cons_") and not ind_id.endswith("_self_sufficiency_pct"):
            p_entry = food_zone_sum.setdefault(("PROVINCE", "35", yr, ind_id), [0.0, r["indicator_label"], r["uom"]])
            p_entry[0] += val
            if gcode == "3501":
                is_demand = any(ind_id.endswith(suf) for suf in ("_est_consumption_kg", "_req_acres", "_req_head"))
                z11_sh = sdg_z11_pop_share if is_demand else (sdg_z11_acre_share if ind_id.endswith("_local_acres") else sdg_z11_rev_share)
                z14_sh = sdg_z14_pop_share if is_demand else (sdg_z14_acre_share if ind_id.endswith("_local_acres") else sdg_z14_rev_share)
                for zid, sh in (("OFA_Z11", z11_sh), ("OFA_Z14", z14_sh)):
                    z_entry = food_zone_sum.setdefault(("OFA_ZONE", zid, yr, ind_id), [0.0, r["indicator_label"], r["uom"]])
                    z_entry[0] += val * sh
            else:
                zid = cd_to_zone.get(gcode, {}).get("zone_id")
                if zid and zid.startswith("OFA_Z"):
                    z_entry = food_zone_sum.setdefault(("OFA_ZONE", zid, yr, ind_id), [0.0, r["indicator_label"], r["uom"]])
                    z_entry[0] += val

    for (glevel, gcode, yr, ind_id), (tot_val, lbl, uom) in food_zone_sum.items():
        food_idx.setdefault((glevel, gcode, yr), {})[ind_id] = (round(tot_val, 2), "", lbl, uom)
    # Recompute self_sufficiency_pct for PROVINCE and OFA_ZONE
    for (glevel, gcode, yr), fmap in list(food_idx.items()):
        if glevel not in ("PROVINCE", "OFA_ZONE"):
            continue
        items = [k[len("food_cons_"):-len("_est_consumption_kg")] for k in fmap if k.startswith("food_cons_") and k.endswith("_est_consumption_kg")]
        for b_item in items:
            req_ac = fmap.get(f"food_cons_{b_item}_req_acres")
            req_hd = fmap.get(f"food_cons_{b_item}_req_head")
            loc_ac = fmap.get(f"food_cons_{b_item}_local_acres")
            loc_hd = fmap.get(f"food_cons_{b_item}_local_head")
            req_v = req_ac[0] if req_ac else (req_hd[0] if req_hd else None)
            loc_v = loc_ac[0] if loc_ac else (loc_hd[0] if loc_hd else None)
            ss = safe_pct(loc_v, req_v, 1)
            fmap[f"food_cons_{b_item}_self_sufficiency_pct"] = (ss, "", f"{b_item} — Self-Sufficiency (%)", "percent")

    # -------------------------------------------------------------------------
    # Compute Provincial Totals & CD / Zone Rankings
    # -------------------------------------------------------------------------
    ont_dguid = "2021A000235"
    ont_farms_2021 = get_ag_val(values_map, ont_dguid, "total_farms", 0) or 48346.0
    ont_rev_2020 = get_ag_val(values_map, ont_dguid, "rev_total_dollars", 0) or 18061442498.0

    # Find Total FCR indicator ID
    total_fcr_id = "fcr_total_farm_cash_receipts"
    for k in fcr_labels:
        if "total_farm_cash" in k or k.endswith("_total_receipts"):
            total_fcr_id = k
            break

    ont_fcr_2024 = fcr_idx.get(("PROVINCE", "35"), {}).get(total_fcr_id, {}).get(2024, 0.0)

    cd_farms_rank_list = sorted(
        [(cd, get_ag_val(values_map, f"2021A0003{cd}", "total_farms", 0) or 0.0) for cd in cd_nodes],
        key=lambda x: x[1],
        reverse=True,
    )
    cd_farms_rank = {cd: i + 1 for i, (cd, _) in enumerate(cd_farms_rank_list)}

    cd_rev_rank_list = sorted(
        [(cd, get_ag_val(values_map, f"2021A0003{cd}", "rev_total_dollars", 0) or 0.0) for cd in cd_nodes],
        key=lambda x: x[1],
        reverse=True,
    )
    cd_rev_rank = {cd: i + 1 for i, (cd, _) in enumerate(cd_rev_rank_list)}

    cd_fcr_rank_list = sorted(
        [(cd, fcr_idx.get(("CD", cd), {}).get(total_fcr_id, {}).get(2024, 0.0)) for cd in cd_nodes],
        key=lambda x: x[1],
        reverse=True,
    )
    cd_fcr_rank = {cd: i + 1 for i, (cd, _) in enumerate(cd_fcr_rank_list)}

    # Key Ag Census characteristics to aggregate for OFA Zones from AgCensus IQ
    SUM_CHARS = [
        "total_farms", "land_total_acres", "land_crops_acres", "land_tame_pasture_acres",
        "land_natural_pasture_acres", "land_woodland_wetland_acres", "land_other_acres",
        "tenure_owned_acres", "tenure_rented_acres", "tenure_govt_leased_acres", "tenure_cropshare_acres",
        "op_sole_prop", "op_partnership", "op_family_corp", "op_nonfamily_corp",
        "cap_total_dollars", "cap_land_bldg_total", "cap_land_bldg_owned", "cap_land_bldg_rented",
        "cap_machinery", "cap_livestock", "rev_total_dollars", "exp_total_dollars",
        "op_total_operators", "op_age_under_35", "op_age_35_54", "op_age_55_plus",
        "op_sex_male", "op_sex_female", "succ_written", "succ_family", "succ_nonfamily",
        "succ_verbal", "succ_none", "ds_total_farms", "ds_farm_gate", "ds_farmers_market",
        "ds_csa", "ds_value_added", "energy_total_farms", "energy_solar_farms",
        "energy_wind_farms", "energy_bioenergy_farms", "energy_geothermal_farms",
        "tech_autosteer", "tech_gis", "tech_vra", "tech_soil_test", "tech_slow_fert",
        "tech_drones", "tech_robotic_milker", "tech_robotic_gh", "till_notill_acres",
        "till_conservation_acres", "till_conventional_acres", "tillage_prepared_acres",
        "bmp_cover_crops_farms", "bmp_windbreaks_farms", "bmp_rotational_grazing_farms",
        "inp_fertilizer_farms", "inp_herbicides_farms", "inp_manure_farms", "inp_lime_farms",
        "lab_farms_reporting", "labour_total_workers", "lab_fulltime_workers", "lab_parttime_workers", "lab_seasonal_workers",
        "naics_oilseed_grain", "naics_cattle_total", "naics_beef", "naics_dairy", "naics_hog",
        "naics_poultry_egg", "naics_sheep_goat", "naics_fruit_nut", "naics_vegetable",
        "naics_greenhouse", "naics_other_crop", "naics_other_animal",
        "crop_soybeans_acres", "crop_corn_grain_acres", "crop_corn_silage_acres",
        "crop_wheat_total_acres", "crop_winter_wheat_acres", "crop_alfalfa_acres",
        "crop_other_hay_acres", "crop_barley_acres", "crop_oats_acres", "crop_canola_acres",
        "crop_white_beans_acres", "crop_potatoes_acres", "fruit_total_acres", "veg_total_acres",
        "gh_total_sqft", "maple_total_taps", "cattle_dairy_cows_head", "cattle_beef_cows_head",
        "cattle_steers_head", "cattle_calves_head", "poultry_hens_chickens_birds", "bees_colonies",
    ]

    # Pre-aggregate SUM_CHARS and operator age weighted sum for each OFA Zone
    zone_ag_2021: dict[str, dict[str, float]] = {}
    zone_ag_2016: dict[str, dict[str, float]] = {}
    zone_age_num: dict[str, float] = {}
    for cd in cd_nodes:
        if cd == "3501":
            continue
        zid = cd_to_zone.get(cd, {}).get("zone_id")
        if not zid or not zid.startswith("OFA_Z"):
            continue
        dguid = f"2021A0003{cd}"
        for ch in SUM_CHARS:
            v21 = get_ag_val(values_map, dguid, ch, 0)
            v16 = get_ag_val(values_map, dguid, ch, 1)
            if v21 is not None:
                zone_ag_2021.setdefault(zid, {})[ch] = zone_ag_2021.get(zid, {}).get(ch, 0.0) + v21
            if v16 is not None:
                zone_ag_2016.setdefault(zid, {})[ch] = zone_ag_2016.get(zid, {}).get(ch, 0.0) + v16
        ops = get_ag_val(values_map, dguid, "op_total_operators", 0)
        age = get_ag_val(values_map, dguid, "op_avg_age", 0)
        if ops and age:
            zone_age_num[zid] = zone_age_num.get(zid, 0.0) + ops * age

    # Add SD&G (3501) CCS split into Zone 11 and Zone 14
    for ccs_code, g in ccs_nodes.items():
        if not ccs_code.startswith("3501"):
            continue
        zid = ccs_to_zone.get(ccs_code)
        if not zid:
            continue
        dguid = g["id"]
        for ch in SUM_CHARS:
            v21 = get_ag_val(values_map, dguid, ch, 0)
            v16 = get_ag_val(values_map, dguid, ch, 1)
            if v21 is not None:
                zone_ag_2021.setdefault(zid, {})[ch] = zone_ag_2021.get(zid, {}).get(ch, 0.0) + v21
            if v16 is not None:
                zone_ag_2016.setdefault(zid, {})[ch] = zone_ag_2016.get(zid, {}).get(ch, 0.0) + v16
        ops = get_ag_val(values_map, dguid, "op_total_operators", 0)
        age = get_ag_val(values_map, dguid, "op_avg_age", 0)
        if ops and age:
            zone_age_num[zid] = zone_age_num.get(zid, 0.0) + ops * age

    zone_farms_rank_list = sorted(
        [(zid, zone_ag_2021.get(zid, {}).get("total_farms", 0.0)) for zid in zone_meta],
        key=lambda x: x[1],
        reverse=True,
    )
    zone_farms_rank = {zid: i + 1 for i, (zid, _) in enumerate(zone_farms_rank_list)}

    zone_rev_rank_list = sorted(
        [(zid, zone_ag_2021.get(zid, {}).get("rev_total_dollars", 0.0)) for zid in zone_meta],
        key=lambda x: x[1],
        reverse=True,
    )
    zone_rev_rank = {zid: i + 1 for i, (zid, _) in enumerate(zone_rev_rank_list)}

    zone_fcr_rank_list = sorted(
        [(zid, fcr_idx.get(("OFA_ZONE", zid), {}).get(total_fcr_id, {}).get(2024, 0.0)) for zid in zone_meta],
        key=lambda x: x[1],
        reverse=True,
    )
    zone_fcr_rank = {zid: i + 1 for i, (zid, _) in enumerate(zone_fcr_rank_list)}

    aco_catalog_list = [[ind_id, lbl, uom] for ind_id, (lbl, uom) in sorted(aco_meta.items())]

    # -------------------------------------------------------------------------
    # Helper to build a single Profile object (for a CD, an OFA_ZONE, or PROVINCE)
    # -------------------------------------------------------------------------
    def build_profile(glevel: str, gcode: str, name: str, dguid: str, zone_id: str, zone_name: str, federations: list[str], footnote: str | None) -> dict[str, Any]:
        def val21(ch: str) -> float | None:
            if glevel in ("CD", "PROVINCE"):
                return get_ag_val(values_map, dguid, ch, 0)
            return zone_ag_2021.get(gcode, {}).get(ch)

        def val16(ch: str) -> float | None:
            if glevel in ("CD", "PROVINCE"):
                return get_ag_val(values_map, dguid, ch, 1)
            return zone_ag_2016.get(gcode, {}).get(ch)

        farms21 = val21("total_farms")
        farms16 = val16("total_farms")
        acres21 = val21("land_total_acres")
        acres16 = val16("land_total_acres")
        crops21 = val21("land_crops_acres")
        rev20 = val21("rev_total_dollars")
        rev15 = val16("rev_total_dollars")
        exp20 = val21("exp_total_dollars")
        exp15 = val16("exp_total_dollars")
        cap21 = val21("cap_total_dollars")
        cap16 = val16("cap_total_dollars")
        ops21 = val21("op_total_operators")
        if glevel in ("CD", "PROVINCE"):
            avg_age21 = get_ag_val(values_map, dguid, "op_avg_age", 0)
        else:
            avg_age21 = round(zone_age_num.get(gcode, 0.0) / ops21, 1) if ops21 else None

        fcr_map = fcr_idx.get((glevel, gcode), {})
        fcr24 = fcr_map.get(total_fcr_id, {}).get(2024)
        fcr25 = fcr_map.get(total_fcr_id, {}).get(2025)
        fcr21 = fcr_map.get(total_fcr_id, {}).get(2021)

        # Top 8 commodities by 2024 OMAFA Farm Cash Receipts
        comm_rows = []
        fcr_years = list(range(2016, 2026))
        ont_fcr_map = fcr_idx.get(("PROVINCE", "35"), {})
        for cid, ymap in sorted(fcr_map.items()):
            lbl = fcr_labels.get(cid, cid)
            v24 = ymap.get(2024, 0.0)
            v25 = ymap.get(2025, 0.0)
            ont24 = ont_fcr_map.get(cid, {}).get(2024, 0.0)
            comm_rows.append({
                "id": cid,
                "label": lbl,
                "isTotal": cid == total_fcr_id or "total" in cid,
                "val2021": round(ymap.get(2021, 0.0)),
                "val2023": round(ymap.get(2023, 0.0)),
                "val2024": round(v24),
                "val2025": round(v25),
                "shareOfGeo2024Pct": safe_pct(v24, fcr24),
                "ontShare2024Pct": safe_pct(v24, ont24),
                "series": {str(y): round(ymap[y]) for y in fcr_years if y in ymap},
            })
        top_commodities = sorted(
            [c for c in comm_rows if not c["isTotal"] and c["val2024"] > 0],
            key=lambda x: x["val2024"],
            reverse=True,
        )[:8]

        # Field crops summary (2024 / 2025 + 5-yr average)
        crop_map = crops_idx.get((glevel, gcode), {})
        ont_crop_map = crops_idx.get(("PROVINCE", "35"), {})
        crop_prefixes = sorted({
            k.replace("_harvested_acres", "")
             .replace("_seeded_acres", "")
             .replace("_yield", "")
             .replace("_prod_tonnes", "")
             .replace("_prod_imp", "")
            for k in crop_map
        })
        field_crops_summary = []
        for cpfx in crop_prefixes:
            harv_k = f"{cpfx}_harvested_acres"
            seed_k = f"{cpfx}_seeded_acres"
            yld_k = f"{cpfx}_yield"
            prod_t_k = f"{cpfx}_prod_tonnes"
            prod_i_k = f"{cpfx}_prod_imp"

            h_map = crop_map.get(harv_k, {}) if harv_k else {}
            s_map = crop_map.get(seed_k, {}) if seed_k else {}
            y_map = crop_map.get(yld_k, {}) if yld_k else {}
            pt_map = crop_map.get(prod_t_k, {}) if prod_t_k else {}
            pi_map = crop_map.get(prod_i_k, {}) if prod_i_k else {}

            # Pick latest year with harvested area (2024 or 2025)
            latest_yr = 2024 if 2024 in h_map else (max(h_map.keys()) if h_map else 2024)
            harv_latest = h_map.get(latest_yr)
            seed_latest = s_map.get(latest_yr)
            yld_latest = y_map.get(latest_yr)
            pt_latest = pt_map.get(latest_yr)
            ont_pt_latest = ont_crop_map.get(prod_t_k, {}).get(latest_yr) if prod_t_k else None

            if not harv_latest and not seed_latest and not pt_latest:
                continue

            raw_lbl = crops_meta.get(harv_k, crops_meta.get(seed_k, crops_meta.get(prod_t_k, (cpfx, ""))))[0]
            clean_crop_lbl = raw_lbl.split(":")[0].split("—")[0].replace("Field Crop", "").strip()
            yld_uom = crops_meta.get(yld_k, ("", "bu/acre"))[1] if yld_k else ""
            recent_ylds = [y_map[y] for y in range(latest_yr - 4, latest_yr + 1) if y in y_map and y_map[y] > 0]
            avg_yld_5yr = round(sum(recent_ylds) / len(recent_ylds), 1) if recent_ylds else None
            pi_latest = pi_map.get(latest_yr)

            field_crops_summary.append({
                "cropId": cpfx,
                "cropName": clean_crop_lbl,
                "latestYear": latest_yr,
                "seededAcres": round(seed_latest) if seed_latest is not None else None,
                "harvestedAcres": round(harv_latest) if harv_latest is not None else None,
                "yield": round(yld_latest, 1) if yld_latest is not None else None,
                "yield5YrAvg": avg_yld_5yr,
                "yieldUom": yld_uom,
                "productionTonnes": round(pt_latest * 1000.0) if pt_latest is not None else None,
                "productionImperial": round(pi_latest * 1000.0) if pi_latest is not None else None,
                "ontProductionSharePct": safe_pct(pt_latest, ont_pt_latest),
                "harvestedSeries": {str(y): round(h_map[y]) for y in range(2016, 2026) if y in h_map},
                "yieldSeries": {str(y): round(y_map[y], 1) for y in range(2016, 2026) if y in y_map},
            })
        field_crops_summary.sort(key=lambda x: x["harvestedAcres"] or 0, reverse=True)

        # FIR Farmland Tax & Assessment (2021, 2023, 2024)
        fir_24 = fir_idx.get((glevel, gcode, 2024), {})
        fir_23 = fir_idx.get((glevel, gcode, 2023), {})
        fir_21 = fir_idx.get((glevel, gcode, 2021), {})
        # Fallback to 2023 if 2024 FIR not yet filed for a single-tier CD
        fir_cur = fir_24 if fir_24.get("fir_farmland_cva") else fir_23
        fir_cur_yr = 2024 if fir_24.get("fir_farmland_cva") else 2023

        # Broadband, Greenbelt & Soil
        bbl = bb_land_idx.get((glevel, gcode), {})

        # Community Profile & Workforce (Day vs Night)
        cp21 = cp_idx.get((glevel, gcode, 2021), {})
        cp16 = cp_idx.get((glevel, gcode, 2016), {})
        cp11 = cp_idx.get((glevel, gcode, 2011), {})

        pop21 = cp21.get("pop_age_distribution_2021_census_total_age")
        pop16 = cp16.get("pop_age_distribution_2016_census_total_age")
        pop11 = cp11.get("pop_age_distribution_2011_census_total_age")

        ag_jobs_day21 = cp21.get("pop_agri_food_workforce_day_agri_food_employment_2021_census_of_population_day")
        ag_jobs_night21 = cp21.get("pop_agri_food_workforce_night_agri_food_employment_2021_census_of_population_night")
        ag_jobs_day16 = cp16.get("pop_agri_food_workforce_day_agri_food_employment_2016_census_of_population_day")
        ag_jobs_night16 = cp16.get("pop_agri_food_workforce_night_agri_food_employment_2016_census_of_population_night")
        tot_jobs_day21 = cp21.get("pop_employment_by_industry_day_total_industry_north_american_industry_classification_system_naics_2012")
        tot_jobs_night21 = cp21.get("pop_employment_by_industry_night_total_industry_north_american_industry_classification_system_naics_2012")

        # Business Counts (2016, 2021, 2022, 2023)
        b23 = biz_idx.get((glevel, gcode, 2023), {})
        b22 = biz_idx.get((glevel, gcode, 2022), {})
        b21 = biz_idx.get((glevel, gcode, 2021), {})
        b16 = biz_idx.get((glevel, gcode, 2016), {})

        biz_table = []
        BIZ_ORDER = [
            ("biz_total_all", "Total All Industries"),
            ("biz_rollup_total_agrifood", "Total Agri-Food Value Chain"),
            ("biz_rollup_primary_ag", "Total Primary Agriculture (111 + 112)"),
            ("biz_rollup_food_bev_mfg", "Food, Beverage & Tobacco Manufacturing (311 + 312)"),
            ("biz_naics_111", "111 — Crop Production"),
            ("biz_naics_112", "112 — Animal Production & Aquaculture"),
            ("biz_naics_1151", "1151 — Support Activities for Crop Production"),
            ("biz_naics_1152", "1152 — Support Activities for Animal Production"),
            ("biz_naics_311", "311 — Food Manufacturing (Total)"),
            ("biz_naics_3111", "3111 — Animal Food Manufacturing (Feed Mills)"),
            ("biz_naics_3112", "3112 — Grain and Oilseed Milling"),
            ("biz_naics_3114", "3114 — Fruit & Vegetable Preserving and Specialty Food"),
            ("biz_naics_3115", "3115 — Dairy Product Manufacturing"),
            ("biz_naics_3116", "3116 — Meat Product Manufacturing"),
            ("biz_naics_3118", "3118 — Bakeries and Tortilla Manufacturing"),
            ("biz_naics_3119", "3119 — Other Food Manufacturing"),
            ("biz_naics_312", "312 — Beverage & Tobacco Manufacturing (Total)"),
            ("biz_naics_312120", "312120 — Breweries"),
            ("biz_naics_312130", "312130 — Wineries"),
            ("biz_naics_312140", "312140 — Distilleries"),
            ("biz_naics_411", "411 — Farm Product Merchant Wholesalers"),
            ("biz_naics_413", "413 — Food, Beverage & Tobacco Merchant Wholesalers"),
            ("biz_naics_4183", "4183 — Agricultural Supplies Merchant Wholesalers"),
            ("biz_naics_445", "445 — Food and Beverage Stores (Retail)"),
            ("biz_naics_722", "722 — Food Services and Drinking Places"),
        ]
        for b_id, b_lbl in BIZ_ORDER:
            n16 = b16.get(f"{b_id}_total_locations")
            n21 = b21.get(f"{b_id}_total_locations")
            n22 = b22.get(f"{b_id}_total_locations")
            n23 = b23.get(f"{b_id}_total_locations")
            wo23 = b23.get(f"{b_id}_without_employees")
            wi23 = b23.get(f"{b_id}_with_employees")
            if any(x is not None for x in (n16, n21, n22, n23)):
                biz_table.append({
                    "id": b_id,
                    "label": b_lbl,
                    "isRollup": b_id.startswith("biz_rollup_") or b_id == "biz_total_all",
                    "net2016": round(n16) if n16 is not None else None,
                    "net2021": round(n21) if n21 is not None else None,
                    "net2022": round(n22) if n22 is not None else None,
                    "net2023": round(n23) if n23 is not None else None,
                    "withoutEmp2023": round(wo23) if wo23 is not None else None,
                    "withEmp2023": round(wi23) if wi23 is not None else None,
                    "change2016To2023Pct": safe_chg_pct(n23, n16),
                })

        # Day vs Night Agri-Food Workforce table
        WORKFORCE_SECTORS = [
            ("Total Economy (All NAICS Industries)",
             "pop_employment_by_industry_day_total_industry_north_american_industry_classification_system_naics_2012",
             "pop_employment_by_industry_night_total_industry_north_american_industry_classification_system_naics_2012"),
            ("Total Agri-Food Value Chain",
             "pop_agri_food_workforce_day_agri_food_employment_2021_census_of_population_day",
             "pop_agri_food_workforce_night_agri_food_employment_2021_census_of_population_night",
             "pop_agri_food_workforce_day_agri_food_employment_2016_census_of_population_day",
             "pop_agri_food_workforce_night_agri_food_employment_2016_census_of_population_night"),
            ("Crop & Animal Production (Farms + Support, 111–112, 1151–1152)",
             "pop_agri_food_workforce_day_crop_and_animal_production_111_112_1151_1152",
             "pop_agri_food_workforce_night_crop_and_animal_production_111_112_1151_1152"),
            ("  111–112 Farms",
             "pop_agri_food_workforce_day_111_112_farms_111_to_112",
             "pop_agri_food_workforce_night_111_112_farms_111_and_112"),
            ("  1151–1152 Support Activities for Farms",
             "pop_agri_food_workforce_day_1150_support_activities_for_farms_1151_and_1152",
             "pop_agri_food_workforce_night_1150_support_activities_for_farms_1151_and_1152"),
            ("Food & Beverage Manufacturing (311–312)",
             "pop_agri_food_workforce_day_food_and_beverage_311_312",
             "pop_agri_food_workforce_night_food_and_beverage_311_312"),
            ("  311 Food Manufacturing",
             "pop_agri_food_workforce_day_311_food_manufacturing",
             "pop_agri_food_workforce_night_311_food_manufacturing"),
            ("  312 Beverage & Tobacco Manufacturing",
             "pop_agri_food_workforce_day_312_beverage_and_tobacco_product_manufacturing",
             "pop_agri_food_workforce_night_312_beverage_and_tobacco_product_manufacturing"),
            ("411 Farm Product Merchant Wholesalers",
             "pop_agri_food_workforce_day_411_farm_product_merchant_wholesalers",
             "pop_agri_food_workforce_night_411_farm_product_merchant_wholesalers"),
            ("413 Food, Beverage & Tobacco Wholesalers",
             "pop_agri_food_workforce_day_413_food_beverage_and_tobacco_merchant_wholesalers",
             "pop_agri_food_workforce_night_413_food_beverage_and_tobacco_merchant_wholesalers"),
            ("4183 Agricultural Supplies Wholesalers",
             "pop_agri_food_workforce_day_4183_agricultural_supplies_merchant_wholesalers",
             "pop_agri_food_workforce_night_4183_agricultural_supplies_merchant_wholesalers"),
            ("445 Food and Beverage Stores (Retail)",
             "pop_agri_food_workforce_day_445_food_and_beverage_stores",
             "pop_agri_food_workforce_night_445_food_and_beverage_stores"),
            ("722 Food Services and Drinking Places",
             "pop_agri_food_workforce_day_722_food_services_and_drinking_places",
             "pop_agri_food_workforce_night_722_food_services_and_drinking_places"),
        ]
        workforce_table = []
        for item in WORKFORCE_SECTORS:
            lbl = item[0]
            k_d21, k_n21 = item[1], item[2]
            k_d16 = item[3] if len(item) > 3 else k_d21
            k_n16 = item[4] if len(item) > 4 else k_n21
            d21 = cp21.get(k_d21)
            n21 = cp21.get(k_n21)
            d16 = cp16.get(k_d16)
            n16 = cp16.get(k_n16)
            if any(x is not None for x in (d21, n21, d16, n16)):
                workforce_table.append({
                    "label": lbl,
                    "day2016": round(d16) if d16 is not None else None,
                    "night2016": round(n16) if n16 is not None else None,
                    "day2021": round(d21) if d21 is not None else None,
                    "night2021": round(n21) if n21 is not None else None,
                    "netInflow2021": round(d21 - n21) if (d21 is not None and n21 is not None) else None,
                    "changeDayPct": safe_chg_pct(d21, d16),
                })

        # Townships (CCSs) side-by-side inside this CD or OFA Zone
        township_list = []
        for ccs_code, g in sorted(ccs_nodes.items()):
            belongs = (ccs_code[:4] == gcode) if glevel == "CD" else (ccs_to_zone.get(ccs_code) == gcode if glevel == "OFA_ZONE" else False)
            if not belongs:
                continue
            tdguid = g["id"]
            tf21 = get_ag_val(values_map, tdguid, "total_farms", 0)
            tf16 = get_ag_val(values_map, tdguid, "total_farms", 1)
            tac21 = get_ag_val(values_map, tdguid, "land_total_acres", 0)
            tcr21 = get_ag_val(values_map, tdguid, "land_crops_acres", 0)
            trev20 = get_ag_val(values_map, tdguid, "rev_total_dollars", 0)
            texp20 = get_ag_val(values_map, tdguid, "exp_total_dollars", 0)
            tcap21 = get_ag_val(values_map, tdguid, "cap_total_dollars", 0)
            tops21 = get_ag_val(values_map, tdguid, "op_total_operators", 0)
            tage21 = get_ag_val(values_map, tdguid, "op_avg_age", 0)
            tsucc21 = get_ag_val(values_map, tdguid, "succ_written", 0)
            tds21 = get_ag_val(values_map, tdguid, "ds_total_farms", 0)

            tbbl = bb_land_idx.get(("CCS", ccs_code), {})
            tfir = fir_idx.get(("CSD", ccs_code, 2024), {}) or fir_idx.get(("CSD", ccs_code, 2023), {})
            tcp21 = cp_idx.get(("CSD", ccs_code, 2021), {})
            tbiz23 = biz_idx.get(("CSD", ccs_code, 2023), {})

            township_list.append({
                "code": ccs_code,
                "name": g["cleanName"],
                "cdCode": ccs_code[:4],
                "zoneId": ccs_to_zone.get(ccs_code, ""),
                "farms2021": round(tf21) if tf21 is not None else None,
                "farms2016": round(tf16) if tf16 is not None else None,
                "farmsChangePct": safe_chg_pct(tf21, tf16),
                "farmlandAcres2021": round(tac21) if tac21 is not None else None,
                "croplandAcres2021": round(tcr21) if tcr21 is not None else None,
                "grossReceipts2020": round(trev20) if trev20 is not None else None,
                "operatingExpenses2020": round(texp20) if texp20 is not None else None,
                "netMarginPct2020": safe_pct((trev20 - texp20) if (trev20 and texp20) else None, trev20),
                "totalCapital2021": round(tcap21) if tcap21 is not None else None,
                "operators2021": round(tops21) if tops21 is not None else None,
                "avgOperatorAge2021": round(tage21, 1) if tage21 is not None else None,
                "successionPct2021": safe_pct(tsucc21, tf21),
                "directSalesPct2021": safe_pct(tds21, tf21),
                "broadband50_10Pct": tbbl.get("broadband_50_10_pct"),
                "broadbandWired50_10Pct": tbbl.get("broadband_50_10_wired_pct"),
                "greenbeltAcres": round(tbbl["greenbelt_acres"]) if "greenbelt_acres" in tbbl else None,
                "farmlandCva2024": round(tfir["fir_farmland_cva"]) if "fir_farmland_cva" in tfir else None,
                "farmlandTax2024": round(tfir["fir_farmland_tax_total"]) if "fir_farmland_tax_total" in tfir else None,
                "population2021": round(tcp21["pop_age_distribution_2021_census_total_age"]) if "pop_age_distribution_2021_census_total_age" in tcp21 else None,
                "agrifoodJobsDay2021": round(tcp21["pop_agri_food_workforce_day_agri_food_employment_2021_census_of_population_day"]) if "pop_agri_food_workforce_day_agri_food_employment_2021_census_of_population_day" in tcp21 else None,
                "agrifoodBiz2023": round(tbiz23["biz_rollup_total_agrifood_total_locations"]) if "biz_rollup_total_agrifood_total_locations" in tbiz23 else None,
            })

        # Historical 4-Census Series (2006, 2011, 2016, 2021) — compact tuple indexed into top-level acoCatalog
        aco_map = aco_idx.get((glevel, gcode), {})
        ont_aco_map = aco_idx.get(("PROVINCE", "35"), {})
        ag_census_series = []
        for cat_idx, (ind_id, _lbl, uom) in enumerate(aco_catalog_list):
            ymap = aco_map.get(ind_id, {})
            if not ymap:
                continue
            v06, f06 = ymap.get(2006, (None, ""))
            v11, f11 = ymap.get(2011, (None, ""))
            v16_a, f16_a = ymap.get(2016, (None, ""))
            v21_a, f21_a = ymap.get(2021, (None, ""))
            ont21_a, _ = ont_aco_map.get(ind_id, {}).get(2021, (None, ""))
            ag_census_series.append([
                cat_idx,
                v06,
                f06,
                v11,
                f11,
                v16_a,
                f16_a,
                v21_a,
                f21_a,
                safe_chg_pct(v21_a, v16_a),
                safe_chg_pct(v21_a, v06),
                safe_pct(v21_a, ont21_a) if uom != "years" else None,
            ])

        # Local Food & Household Expenditure Estimates (2021)
        food_map21 = food_idx.get((glevel, gcode, 2021), {})
        hh_exp_est = []
        local_food_est = []
        seen_food_items = []
        for fid, (fval, fflag, flbl, fuom) in sorted(food_map21.items()):
            if fid.startswith("food_exp_"):
                hh_exp_est.append({
                    "id": fid,
                    "label": flbl.replace("Estimated Per-Household Expenditure: ", ""),
                    "dollarsPerHousehold2021": fval,
                })
            elif fid.startswith("food_cons_") and fid.endswith("_est_consumption_kg"):
                base_item = fid[len("food_cons_"):-len("_est_consumption_kg")]
                seen_food_items.append(base_item)

        for b_item in seen_food_items:
            c_kg, _, c_lbl, _ = food_map21.get(f"food_cons_{b_item}_est_consumption_kg", (None, "", b_item, "kg"))
            item_title = c_lbl.split("—")[0].strip()
            req_ac = food_map21.get(f"food_cons_{b_item}_req_acres")
            req_hd = food_map21.get(f"food_cons_{b_item}_req_head")
            loc_ac = food_map21.get(f"food_cons_{b_item}_local_acres")
            loc_hd = food_map21.get(f"food_cons_{b_item}_local_head")
            ss_pct = food_map21.get(f"food_cons_{b_item}_self_sufficiency_pct")
            u_type = "acres" if req_ac is not None else "head"
            req_v = req_ac[0] if req_ac else (req_hd[0] if req_hd else None)
            loc_v = loc_ac[0] if loc_ac else (loc_hd[0] if loc_hd else None)
            loc_f = loc_ac[1] if loc_ac else (loc_hd[1] if loc_hd else "")
            local_food_est.append({
                "id": b_item,
                "item": item_title,
                "unit": u_type,
                "estConsumptionKg2021": round(c_kg) if c_kg is not None else None,
                "requiredBase2021": round(req_v, 1) if req_v is not None else None,
                "actualLocalBase2021": round(loc_v, 1) if loc_v is not None else None,
                "localFlag": loc_f,
                "selfSufficiencyPct2021": ss_pct[0] if ss_pct else None,
            })

        safe_slug = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")
        pid = f"{glevel}_{gcode}"
        excel_filename = f"OFA_Profile_2_0_{pid}_{safe_slug}.xlsx"

        return {
            "id": pid,
            "type": glevel,
            "code": gcode,
            "dguid": dguid,
            "name": name,
            "zoneId": zone_id,
            "zoneName": zone_name,
            "federations": federations,
            "footnote": footnote,
            "excelFilename": excel_filename,
            "excelDownloadUrl": f"downloads/county_profiles_2_0/{excel_filename}",
            "executiveSummary": {
                "farms2021": round(farms21) if farms21 is not None else None,
                "farms2016": round(farms16) if farms16 is not None else None,
                "farmsChangePct": safe_chg_pct(farms21, farms16),
                "farmsRank": cd_farms_rank.get(gcode) if glevel == "CD" else (zone_farms_rank.get(gcode) if glevel == "OFA_ZONE" else None),
                "farmsRankOutOf": 49 if glevel == "CD" else (15 if glevel == "OFA_ZONE" else None),
                "farmsOntSharePct": safe_pct(farms21, ont_farms_2021),
                "farmlandAcres2021": round(acres21) if acres21 is not None else None,
                "farmlandAcres2016": round(acres16) if acres16 is not None else None,
                "farmlandChangePct": safe_chg_pct(acres21, acres16),
                "croplandAcres2021": round(crops21) if crops21 is not None else None,
                "croplandShareOfFarmlandPct": safe_pct(crops21, acres21),
                "avgFarmSizeAcres2021": round(acres21 / farms21, 1) if (acres21 and farms21) else None,
                "ownedAcres2021": round(val21("tenure_owned_acres")) if val21("tenure_owned_acres") is not None else None,
                "rentedAcres2021": round(val21("tenure_rented_acres")) if val21("tenure_rented_acres") is not None else None,
                "ownedSharePct2021": safe_pct(val21("tenure_owned_acres"), acres21),
                "censusGrossReceipts2020": round(rev20) if rev20 is not None else None,
                "censusGrossReceipts2015": round(rev15) if rev15 is not None else None,
                "censusReceiptsChangePct": safe_chg_pct(rev20, rev15),
                "censusReceiptsRank": cd_rev_rank.get(gcode) if glevel == "CD" else (zone_rev_rank.get(gcode) if glevel == "OFA_ZONE" else None),
                "censusReceiptsOntSharePct": safe_pct(rev20, ont_rev_2020),
                "censusOperatingExpenses2020": round(exp20) if exp20 is not None else None,
                "censusOperatingExpenses2015": round(exp15) if exp15 is not None else None,
                "censusNetCashIncome2020": round(rev20 - exp20) if (rev20 is not None and exp20 is not None) else None,
                "censusNetMarginPct2020": safe_pct((rev20 - exp20) if (rev20 is not None and exp20 is not None) else None, rev20),
                "censusExpenseToRevenueRatioPct": safe_pct(exp20, rev20),
                "avgReceiptsPerFarm2020": round(rev20 / farms21) if (rev20 and farms21) else None,
                "omafaFcr2021": round(fcr21) if fcr21 is not None else None,
                "omafaFcr2024": round(fcr24) if fcr24 is not None else None,
                "omafaFcr2025": round(fcr25) if fcr25 is not None else None,
                "omafaFcrRank2024": cd_fcr_rank.get(gcode) if glevel == "CD" else (zone_fcr_rank.get(gcode) if glevel == "OFA_ZONE" else None),
                "omafaFcrOntSharePct2024": safe_pct(fcr24, ont_fcr_2024),
                "totalFarmCapital2021": round(cap21) if cap21 is not None else None,
                "totalFarmCapital2016": round(cap16) if cap16 is not None else None,
                "capitalPerFarm2021": round(cap21 / farms21) if (cap21 and farms21) else None,
                "capitalPerAcre2021": round(cap21 / acres21) if (cap21 and acres21) else None,
                "totalOperators2021": round(ops21) if ops21 is not None else None,
                "avgOperatorAge2021": avg_age21,
                "operatorsUnder35Pct2021": safe_pct(val21("op_age_under_35"), ops21),
                "operators55PlusPct2021": safe_pct(val21("op_age_55_plus"), ops21),
                "femaleOperatorsPct2021": safe_pct(val21("op_sex_female"), ops21),
                "writtenSuccessionPlanFarms2021": round(val21("succ_written") or 0),
                "writtenSuccessionPlanPct2021": safe_pct(val21("succ_written"), farms21),
                "directSalesFarms2021": round(val21("ds_total_farms") or 0),
                "directSalesPct2021": safe_pct(val21("ds_total_farms"), farms21),
                "renewableEnergyFarms2021": round(val21("energy_total_farms") or 0),
                "renewableEnergyPct2021": safe_pct(val21("energy_total_farms"), farms21),
                "solarFarms2021": round(val21("energy_solar_farms") or 0),
                "windFarms2021": round(val21("energy_wind_farms") or 0),
                "bioenergyFarms2021": round(val21("energy_bioenergy_farms") or 0),
                "autosteerFarms2021": round(val21("tech_autosteer") or 0),
                "roboticMilkerFarms2021": round(val21("tech_robotic_milker") or 0),
                "paidLabourFarms2021": round(val21("lab_farms_reporting") or 0),
                "paidWorkersTotal2021": round(val21("labour_total_workers") or 0),
                "noTillSharePct2021": safe_pct(val21("till_notill_acres"), val21("tillage_prepared_acres")),
                "coverCropsFarms2021": round(val21("bmp_cover_crops_farms") or 0),
                "population2021": round(pop21) if pop21 is not None else None,
                "population2016": round(pop16) if pop16 is not None else None,
                "population2011": round(pop11) if pop11 is not None else None,
                "populationChange2016To2021Pct": safe_chg_pct(pop21, pop16),
                "avgHouseholdIncome2021": round(cp21["pop_household_income_average_total_income_of_household"]) if "pop_household_income_average_total_income_of_household" in cp21 else None,
                "agrifoodJobsDay2021": round(ag_jobs_day21) if ag_jobs_day21 is not None else None,
                "agrifoodJobsNight2021": round(ag_jobs_night21) if ag_jobs_night21 is not None else None,
                "agrifoodShareOfDayJobsPct2021": safe_pct(ag_jobs_day21, tot_jobs_day21),
                "agrifoodShareOfNightJobsPct2021": safe_pct(ag_jobs_night21, tot_jobs_night21),
                "agrifoodBizLocations2023": round(b23["biz_rollup_total_agrifood_total_locations"]) if "biz_rollup_total_agrifood_total_locations" in b23 else None,
                "primaryAgBizLocations2023": round(b23["biz_rollup_primary_ag_total_locations"]) if "biz_rollup_primary_ag_total_locations" in b23 else None,
                "foodBevMfgBizLocations2023": round(b23["biz_rollup_food_bev_mfg_total_locations"]) if "biz_rollup_food_bev_mfg_total_locations" in b23 else None,
                "firYear": fir_cur_yr,
                "farmlandCvaDollars": round(fir_cur["fir_farmland_cva"]) if "fir_farmland_cva" in fir_cur else None,
                "farmlandTotalTaxDollars": round(fir_cur["fir_farmland_tax_total"]) if "fir_farmland_tax_total" in fir_cur else None,
                "farmlandMunicipalTaxDollars": round(fir_cur.get("fir_farmland_tax_lt", 0.0) + fir_cur.get("fir_farmland_tax_ut", 0.0)) if "fir_farmland_tax_total" in fir_cur else None,
                "farmlandEducationTaxDollars": round(fir_cur["fir_farmland_tax_edu"]) if "fir_farmland_tax_edu" in fir_cur else None,
                "farmlandShareOfTotalCvaPct": fir_cur.get("fir_farmland_share_cva_pct"),
                "farmlandShareOfTotalTaxPct": fir_cur.get("fir_farmland_share_tax_pct"),
                "effectiveFarmlandTaxRatePer1000Cva": round(fir_cur["fir_farmland_tax_total"] / fir_cur["fir_farmland_cva"] * 1000.0, 2) if fir_cur.get("fir_farmland_cva") else None,
                "primeSoilClass1To3Acres": round(bbl["cli_prime_1_to_3_acres"]) if "cli_prime_1_to_3_acres" in bbl else None,
                "primeSoilSharePct": bbl.get("cli_prime_share_surveyed_pct"),
                "cliClass1Acres": round(bbl["cli_class1_acres"]) if "cli_class1_acres" in bbl else None,
                "cliClass2Acres": round(bbl["cli_class2_acres"]) if "cli_class2_acres" in bbl else None,
                "cliClass3Acres": round(bbl["cli_class3_acres"]) if "cli_class3_acres" in bbl else None,
                "cliClass4To7Acres": round(bbl["cli_class4_to_7_acres"]) if "cli_class4_to_7_acres" in bbl else None,
                "cliOrganicAcres": round(bbl["cli_organic_acres"]) if "cli_organic_acres" in bbl else None,
                "greenbeltAcres": round(bbl.get("greenbelt_acres", 0.0)),
                "greenbeltShareLandPct": bbl.get("greenbelt_share_land_pct", 0.0),
                "greenbeltSpecialtyCropAcres": round(bbl.get("greenbelt_specialty_crop_acres", 0.0)),
                "broadbandEvaluatedHouseholds": round(bbl["broadband_total_households"]) if "broadband_total_households" in bbl else None,
                "broadband50_10Pct": bbl.get("broadband_50_10_pct"),
                "broadbandWired50_10Pct": bbl.get("broadband_50_10_wired_pct"),
                "broadbandWithGovProjects50_10Pct": bbl.get("broadband_50_10_with_gov_pct"),
                "broadbandUnderservedHouseholds": round(bbl["broadband_underserved_households"]) if "broadband_underserved_households" in bbl else None,
                "broadbandLteMobilePct": bbl.get("broadband_lte_mobile_pct"),
                "topCommoditiesFcr2024": top_commodities,
            },
            "townships": township_list,
            "agCensusOverTime": ag_census_series,
            "fcrCommodities": comm_rows,
            "fieldCrops": field_crops_summary,
            "businessCounts": biz_table,
            "workforceDayNight": workforce_table,
            "firHistory": {
                "2021": {k: round(v, 2) for k, v in fir_21.items()},
                "2023": {k: round(v, 2) for k, v in fir_23.items()},
                "2024": {k: round(v, 2) for k, v in fir_24.items()},
            },
            "localFoodAndSpendingEst": {
                "householdFoodExp2021": hh_exp_est,
                "localFoodSelfSufficiency2021": local_food_est,
            },
        }

    profiles: dict[str, dict[str, Any]] = {}

    # 1. Province of Ontario
    profiles["PROVINCE_35"] = build_profile(
        "PROVINCE", "35", "Ontario", "2021A000235", "ONTARIO", "Province of Ontario", ["Ontario Federation of Agriculture (Provincial)"], None
    )

    # 2. All 49 Ontario CDs
    for cd_code, g in sorted(cd_nodes.items()):
        zinfo = cd_to_zone.get(cd_code, {})
        zid = zinfo.get("zone_id", "")
        zname = zone_meta.get(zid, {}).get("zone_name", "Split Zone (Zone 11 & Zone 14)" if cd_code == "3501" else zid)
        feds = zinfo.get("federations", [g["cleanName"]])
        fnote = zinfo.get("footnote")
        profiles[f"CD_{cd_code}"] = build_profile(
            "CD", cd_code, g["cleanName"], g["id"], zid, zname, feds, fnote
        )

    # 3. All 15 OFA Zones
    for z in zones_data["zones"]:
        zid = z["zone_id"]
        z_note = z.get("notes") or z.get("footnote") or None
        if zid in ("OFA_Z11", "OFA_Z14") and not z_note:
            z_note = zones_data.get("sdg_footnote")
        profiles[f"OFA_ZONE_{zid}"] = build_profile(
            "OFA_ZONE", zid, z["zone_name"], "", zid, z["zone_name"], z["federations"], z_note
        )

    qa.check("All 49 Ontario CDs compiled into profiles", sum(1 for k in profiles if k.startswith("CD_")) == 49, f"CDs={sum(1 for k in profiles if k.startswith('CD_'))}")
    qa.check("All 15 OFA Zones compiled into profiles", sum(1 for k in profiles if k.startswith("OFA_ZONE_")) == 15, f"Zones={sum(1 for k in profiles if k.startswith('OFA_ZONE_'))}")
    qa.check("Zone 15 includes Greater Sudbury footnote", bool(profiles["OFA_ZONE_OFA_Z15"].get("footnote")), str(profiles["OFA_ZONE_OFA_Z15"].get("footnote")))

    master_obj = {
        "generatedAt": now_iso(),
        "version": "2.0",
        "ontarioId": "PROVINCE_35",
        "cdOrder": [f"CD_{cd}" for cd in sorted(cd_nodes.keys(), key=lambda c: cd_nodes[c]["cleanName"])],
        "zoneOrder": [f"OFA_ZONE_{z['zone_id']}" for z in zones_data["zones"]],
        "acoCatalog": aco_catalog_list,
        "profiles": profiles,
    }

    out_json = PROJECT_DIR / "public" / "data" / "ofa_county_profiles_2_0.json"
    out_gz = PROJECT_DIR / "public" / "data" / "ofa_county_profiles_2_0.json.gz"
    json_bytes = json.dumps(master_obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    out_json.write_bytes(json_bytes)
    with gzip.open(out_gz, "wb", compresslevel=9) as gz:
        gz.write(json_bytes)

    qa.write()
    register_source(
        SOURCE_ID,
        publisher="Ontario Federation of Agriculture (OFA) — AgCensus IQ Pipeline",
        title="OFA County & Zone Profiles 2.0 Unified Master Dataset",
        url="https://ofa.on.ca",
        licence="OFA Internal / Open Government Licence – Canada & Ontario",
        vintage="2006–2025",
        geography="Ontario, 49 Census Divisions (CDs), 15 OFA Zones, and 273 Townships (CCSs)",
        method="Compiled from p01 (OMAFA FCR 2011–2025), p02 (OFA Zones), p03 (OMAFA Field Crops 2011–2025), p04 (MMAH FIR Farmland Tax 2021–2024), p05 (ISED Broadband, Greenbelt, CLI Soil), p06 (Reconciled OMAFA County Profiles), and StatCan 2021/2016 Census of Agriculture.",
        caveats=[],
        row_count=len(profiles),
        output_file=str(out_json.name),
        script=Path(__file__).name,
    )
    print(f"Wrote {out_json} ({len(json_bytes)/1024/1024:.2f} MB) and {out_gz} ({out_gz.stat().st_size/1024/1024:.2f} MB); QA all passed: {qa.all_passed}")


if __name__ == "__main__":
    main()
