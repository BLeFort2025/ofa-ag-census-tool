"""p05_broadband_and_land.py — ISED Broadband (50/10 Mbps), Greenbelt, and CLI Prime Agricultural Soil Data.

Acquires and processes three empirical spatial/infrastructure datasets for Ontario
Counties (CDs), Townships (CCSs), OFA Zones, and the Province:

1. Innovation, Science and Economic Development Canada (ISED) National Broadband Data:
   - Joins Pseudo-Household Demographic Distribution (PHH_2021_CSV/PHH-ON.csv) with
     Current & Government-Supported Broadband Speeds (NBD_PHH_Speeds.zip).
   - Maps PHH points to CDs via DBUID[:4] and to Townships (CCSs) via spatial
     point-in-polygon lookup against Statistics Canada 2021 boundary polygons.
   - Computes % of households with 50/10 Mbps (combined wired/wireless), 50/10 Mbps
     wired (fibre/cable/DSL), 50/10 Mbps with government-supported projects, and
     LTE mobile wireless coverage.

2. Ontario Greenbelt Outer Boundary & Specialty Crop Areas (Land Information Ontario LIO_Open06):
   - Queries official Greenbelt Outer Boundary (Layer 17) and Specialty Crop Areas
     (Layer 19: Niagara Peninsula Tender Fruit & Grape Area, Holland Marsh).
   - Projects to EPSG:3161 (NAD83 / Ontario MNR Lambert) and computes exact intersection
     acres with every Ontario CD, CCS, and OFA Zone.

3. Ontario Soil Survey Complex — Canada Land Inventory (CLI) Capability for Agriculture (LIO_Open05/9):
   - Queries component-weighted soil survey polygons (Components 1, 2, 3 weighted by
     PERCENT1, PERCENT2, PERCENT3) from Land Information Ontario.
   - Computes CLI Class 1, Class 2, Class 3, Total Prime Agricultural Soil (Class 1–3),
     Class 4–7, and Organic (Class O) acres and % share for each surveyed county.
"""
from __future__ import annotations

import csv
import json
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from pyproj import Transformer
import shapely
from shapely.geometry import Point, shape
from shapely.ops import transform as shp_transform, unary_union
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (
    PROCESSED_DIR,
    PROJECT_DIR,
    QAReport,
    RAW_PROFILES_DIR,
    USER_AGENT,
    download_file,
    fmt_num,
    register_source,
    write_tidy,
)

SOURCE_ID = "broadband_and_land"
SQM_PER_ACRE = 4046.8564224

# Map LIO Soil Survey Complex SURVEY1 names to Statistics Canada 4-digit CD codes
SURVEY_TO_CD = {
    "BRANT": "3529",
    "BRUCE": "3541",
    "COCHRANE": "3556",
    "DUFFERIN": "3522",
    "DURHAM": "3518",
    "ELGIN": "3534",
    "ESSEX": "3537",
    "FORT FRANCES - RAINY RIVER": "3559",
    "FRONTENAC": "3510",
    "GOGAMA": "3552",
    "GREY": "3542",
    "HALDIMAND - NORFOLK": "3528",
    "HALTON": "3524",
    "HAMILTON": "3525",
    "HASTINGS": "3512",
    "HURON": "3540",
    "KAPUSKASING": "3556",
    "KAWARTHA LAKES": "3516",
    "KENORA-DRYDEN-POINTE DU BOIS": "3560",
    "KENT": "3536",
    "LAMBTON": "3538",
    "LANARK": "3509",
    "LEEDS AND GRENVILLE": "3507",
    "LENNOX AND ADDINGTON": "3511",
    "MANITOULIN ISLAND": "3551",
    "MIDDLESEX": "3539",
    "NIAGARA": "3526",
    "NORTH BAY": "3548",
    "NORTHUMBERLAND": "3514",
    "OTTAWA CARLETON": "3506",
    "OXFORD": "3532",
    "PARRY SOUND": "3549",
    "PEEL": "3521",
    "PERTH": "3531",
    "PETERBOROUGH": "3515",
    "PRESCOTT AND RUSSELL": "3502",
    "PRINCE EDWARD": "3513",
    "RENFREW": "3547",
    "SAULT STE MARIE - BLIND RIVER": "3557",
    "SIMCOE": "3543",
    "STORMONT, DUNDAS AND GLENGARRY": "3501",
    # Note: "SUDBURY" spans both Greater Sudbury (3553) and Sudbury District (3552)
    # and is spatially clipped in EPSG:3161 in Part 3 below.
    "THUNDER BAY": "3558",
    "TIMMINS - NORANDA - ROUYN": "3556",
    "VILLE-MARIE": "3554",
    "WATERLOO": "3530",
    "WELLINGTON": "3523",
    "YORK": "3519",
}


def fetch_json(url: str, cache_path: Path) -> dict:
    if cache_path.exists() and cache_path.stat().st_size > 0:
        return json.loads(cache_path.read_text(encoding="utf-8"))
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=45) as r:
        data = r.read().decode("utf-8")
    cache_path.write_text(data, encoding="utf-8")
    return json.loads(data)


def main() -> None:
    qa = QAReport(SOURCE_ID, "ISED Broadband (50/10 Mbps), Ontario Greenbelt, and CLI Soil Capability")
    ag = json.loads((PROJECT_DIR / "public" / "data" / "ag_census_data.json").read_text(encoding="utf-8"))
    zones_data = json.loads((PROCESSED_DIR / "ofa_zones.json").read_text(encoding="utf-8"))
    geo_bounds = json.loads((PROJECT_DIR / "public" / "data" / "ag_boundaries.geojson").read_text(encoding="utf-8"))

    cd_names = {
        g["id"][-4:]: g["cleanName"]
        for g in ag["geographies"]
        if g["level"] == "Counties / Census Divisions (CD)" and g["provinceCode"] == "35"
    }
    ccs_names = {
        g["id"][-7:]: g["cleanName"]
        for g in ag["geographies"]
        if g["level"] == "Townships / Subdivisions (CCS)" and g["provinceCode"] == "35"
    }
    ccs_to_zone = zones_data["ccs_to_zone"]
    cd_to_zone = zones_data["cd_to_zone"]

    # Fetch high-precision (0.002 deg offset) 2021 Ontario CD and CCS polygons from StatCan GeoServer
    dig_base = "https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Digital_boundary_files/MapServer"
    ont_cd_geojson = fetch_json(
        f"{dig_base}/4/query?where=PRUID%3D%2735%27&outFields=CDUID,CDNAME,LANDAREA&maxAllowableOffset=0.002&geometryPrecision=4&outSR=4326&resultRecordCount=100&f=geojson",
        RAW_PROFILES_DIR / "land_lio" / "ontario_cd_2021.geojson",
    )
    ont_ccs_geojson = fetch_json(
        f"{dig_base}/5/query?where=PRUID%3D%2735%27&outFields=CCSUID,CCSNAME,LANDAREA&maxAllowableOffset=0.002&geometryPrecision=4&outSR=4326&resultRecordCount=500&f=geojson",
        RAW_PROFILES_DIR / "land_lio" / "ontario_ccs_2021.geojson",
    )

    # Build WGS84 and projected (EPSG:3161) polygons for Ontario CDs and CCSs
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:3161", always_xy=True)
    cd_polys_4326: dict[str, shapely.Geometry] = {}
    cd_polys_3161: dict[str, shapely.Geometry] = {}
    ccs_polys_4326: dict[str, shapely.Geometry] = {}
    ccs_polys_3161: dict[str, shapely.Geometry] = {}

    for feat in ont_cd_geojson.get("features", []):
        code = str(feat["properties"].get("CDUID", "")).strip()
        if len(code) == 4 and code.startswith("35"):
            geom4326 = shape(feat["geometry"])
            if not geom4326.is_valid:
                geom4326 = shapely.make_valid(geom4326)
            cd_polys_4326[code] = geom4326
            cd_polys_3161[code] = shapely.make_valid(shp_transform(transformer.transform, geom4326))

    for feat in ont_ccs_geojson.get("features", []):
        code = str(feat["properties"].get("CCSUID", "")).strip()
        if len(code) == 7 and code.startswith("35"):
            geom4326 = shape(feat["geometry"])
            if not geom4326.is_valid:
                geom4326 = shapely.make_valid(geom4326)
            ccs_polys_4326[code] = geom4326
            ccs_polys_3161[code] = shapely.make_valid(shp_transform(transformer.transform, geom4326))

    qa.check("Ontario CD polygons loaded", len(cd_polys_3161) == 49, f"count={len(cd_polys_3161)}")
    qa.check("Ontario CCS polygons loaded", len(ccs_polys_3161) == 273, f"count={len(ccs_polys_3161)}")

    rows: list[dict] = []

    # =========================================================================
    # PART 1: ISED NATIONAL BROADBAND DATA (50/10 Mbps & LTE)
    # =========================================================================
    phh_zip = download_file(
        "https://ised-isde.canada.ca/app/scr/sittibc/web/api/openData/PHH_2021_CSV.zip",
        RAW_PROFILES_DIR / "broadband_ised" / "PHH_2021_CSV.zip",
    )
    speeds_zip = download_file(
        "https://ised-isde.canada.ca/app/scr/sittibc/web/api/openData/NBD_PHH_Speeds.zip",
        RAW_PROFILES_DIR / "broadband_ised" / "NBD_PHH_Speeds.zip",
    )

    # Read current and gov-supported speeds for Ontario
    cur_speeds: dict[str, tuple[int, int, int, int]] = {}
    gov_speeds: dict[str, int] = {}
    with zipfile.ZipFile(speeds_zip) as z:
        with z.open("PHH_Speeds_Current-PHH_Vitesses_Actuelles_ON.csv") as f:
            rd = csv.DictReader(line.decode("utf-8-sig") for line in f)
            for r in rd:
                pid = r["PHH_ID"]
                c50 = 1 if r.get("Combined_50_10_Combine") == "1" else 0
                w50 = 1 if r.get("Wired_50_10_Filaire") == "1" else 0
                wl50 = 1 if r.get("Wireless_50_10_Sans_fil") == "1" else 0
                lte = 1 if r.get("Avail_LTE_Mobile_Dispo") == "1" else 0
                cur_speeds[pid] = (c50, w50, wl50, lte)
        with z.open("PHH_Speeds_Government_Support-PHH_Vitesses_Appui_Gouvernement_ON.csv") as f:
            rd = csv.DictReader(line.decode("utf-8-sig") for line in f)
            for r in rd:
                pid = r["PHH_ID"]
                if r.get("Combined_50_10_Combine") == "1":
                    gov_speeds[pid] = 1

    # Build per-CD STRtree of CCS polygons so we only test the ~6 CCS polygons inside that CD!
    cd_ccs_trees: dict[str, tuple[list[str], STRtree]] = {}
    for ccs_code, poly in ccs_polys_4326.items():
        cd_code = ccs_code[:4]
        cd_ccs_trees.setdefault(cd_code, ([], []))[0].append(ccs_code)
        cd_ccs_trees[cd_code][1].append(poly)
    cd_ccs_lookup = {
        cd: (codes, STRtree(polys), polys)
        for cd, (codes, polys) in cd_ccs_trees.items()
    }

    bb_cd: dict[str, list[float]] = {}
    bb_ccs: dict[str, list[float]] = {}
    bb_zone: dict[str, list[float]] = {}
    bb_prov = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]  # [hh, c50_hh, w50_hh, gov50_hh, lte_hh, pop]

    def add_bb(target: list[float], hh: float, c50: int, w50: int, g50: int, lte: int, pop: float) -> None:
        target[0] += hh
        target[1] += hh * c50
        target[2] += hh * w50
        target[3] += hh * g50
        target[4] += hh * lte
        target[5] += pop

    with zipfile.ZipFile(phh_zip) as z:
        with z.open("PHH_2021_CSV/PHH-ON.csv") as f:
            rd = csv.DictReader(line.decode("utf-8-sig") for line in f)
            for r in rd:
                pid = r["PHH_ID"]
                hh = float(r.get("URDwell2021_RH2021") or 0.0)
                pop = float(r.get("Pop2021") or 0.0)
                if hh <= 0 and pop <= 0:
                    continue
                dbuid = r.get("DBUID_Ididu", "")
                cd = dbuid[:4]
                if len(cd) != 4 or not cd.startswith("35"):
                    continue
                c50, w50, _wl50, lte = cur_speeds.get(pid, (0, 0, 0, 0))
                g50 = 1 if (c50 == 1 or pid in gov_speeds) else 0

                add_bb(bb_prov, hh, c50, w50, g50, lte, pop)
                add_bb(bb_cd.setdefault(cd, [0.0] * 6), hh, c50, w50, g50, lte, pop)

                # Assign to CCS if CD has multiple CCSs or is split CD 3501
                matched_ccs = None
                if cd in cd_ccs_lookup:
                    codes, tree, polys = cd_ccs_lookup[cd]
                    if len(codes) == 1:
                        matched_ccs = codes[0]
                    else:
                        pt = Point(float(r["Longitude"]), float(r["Latitude"]))
                        for idx in tree.query(pt):
                            if polys[idx].contains(pt):
                                matched_ccs = codes[idx]
                                break
                        if matched_ccs is None:
                            # Fallback to nearest CCS within the CD
                            best_idx = min(range(len(polys)), key=lambda i: polys[i].distance(pt))
                            matched_ccs = codes[best_idx]

                if matched_ccs:
                    add_bb(bb_ccs.setdefault(matched_ccs, [0.0] * 6), hh, c50, w50, g50, lte, pop)
                    zid = ccs_to_zone.get(matched_ccs)
                else:
                    zid = cd_to_zone.get(cd, {}).get("zone_id")

                if zid and zid.startswith("OFA_Z"):
                    add_bb(bb_zone.setdefault(zid, [0.0] * 6), hh, c50, w50, g50, lte, pop)

    def emit_bb_rows(level: str, code: str, dguid: str, name: str, vec: list[float]) -> None:
        hh, c50_hh, w50_hh, g50_hh, lte_hh, _pop = vec
        if hh <= 0:
            return
        underserved_hh = max(0.0, hh - c50_hh)
        items = [
            ("broadband_total_households", "Total Usual Resident Households Evaluated (ISED PHH 2021)", "households", round(hh)),
            ("broadband_50_10_pct", "Households with 50/10 Mbps Broadband Availability (Combined Wired & Fixed Wireless %)", "percent", round(c50_hh / hh * 100.0, 2)),
            ("broadband_50_10_wired_pct", "Households with 50/10 Mbps Wired Broadband Availability (Fibre/Cable/DSL %)", "percent", round(w50_hh / hh * 100.0, 2)),
            ("broadband_50_10_with_gov_pct", "Households Reaching 50/10 Mbps Including Government-Supported Projects (%)", "percent", round(g50_hh / hh * 100.0, 2)),
            ("broadband_underserved_households", "Households Currently Underserved (<50/10 Mbps)", "households", round(underserved_hh)),
            ("broadband_lte_mobile_pct", "Households with LTE Mobile Wireless Availability (%)", "percent", round(lte_hh / hh * 100.0, 2)),
        ]
        for ind_id, label, uom, val in items:
            rows.append({
                "table_id": "ISED_NBD_PHH_2021",
                "ref_year": 2024,
                "geo_level": level,
                "geo_code": code,
                "geo_dguid": dguid,
                "geo_name": name,
                "indicator_id": ind_id,
                "indicator_label": label,
                "category": "Broadband & Rural Connectivity (ISED)",
                "uom": uom,
                "value": fmt_num(val),
                "status_flag": "",
                "is_estimate": 0,
                "note": "ISED National Broadband Data (PHH 2021 demographic distribution joined with Current & Government-Supported PHH Speeds)",
            })

    emit_bb_rows("PROVINCE", "35", "2021A000235", "Ontario", bb_prov)
    for cd, vec in sorted(bb_cd.items()):
        emit_bb_rows("CD", cd, f"2021A0003{cd}", cd_names.get(cd, cd), vec)
    for z in zones_data["zones"]:
        zid = z["zone_id"]
        if zid in bb_zone:
            emit_bb_rows("OFA_ZONE", zid, "", z["zone_name"], bb_zone[zid])
    for ccs, vec in sorted(bb_ccs.items()):
        emit_bb_rows("CCS", ccs, f"2021S0502{ccs}", ccs_names.get(ccs, ccs), vec)

    qa.check("ISED Broadband: all 49 Ontario CDs covered", len(bb_cd) == 49, f"CDs={len(bb_cd)}")
    qa.check("ISED Broadband: Ontario 50/10 Mbps availability between 85% and 99%",
             85.0 <= (bb_prov[1] / bb_prov[0] * 100.0) <= 99.0,
             f"Ontario 50/10={bb_prov[1] / bb_prov[0] * 100.0:.2f}%")

    # =========================================================================
    # PART 2: ONTARIO GREENBELT OUTER BOUNDARY & SPECIALTY CROP AREAS (LIO)
    # =========================================================================
    gb_outer_json = fetch_json(
        "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open06/MapServer/17/query?where=1%3D1&outFields=*&f=geojson",
        RAW_PROFILES_DIR / "land_lio" / "greenbelt_outer.geojson",
    )
    gb_spec_json = fetch_json(
        "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open06/MapServer/19/query?where=1%3D1&outFields=*&f=geojson",
        RAW_PROFILES_DIR / "land_lio" / "greenbelt_specialty_crop.geojson",
    )

    gb_outer_3161 = unary_union([
        shp_transform(transformer.transform, shapely.make_valid(shape(f["geometry"])))
        for f in gb_outer_json.get("features", [])
    ])
    gb_spec_3161 = unary_union([
        shp_transform(transformer.transform, shapely.make_valid(shape(f["geometry"])))
        for f in gb_spec_json.get("features", [])
    ])

    def emit_gb_rows(level: str, code: str, dguid: str, name: str, poly_3161: shapely.Geometry) -> tuple[float, float, float]:
        land_acres = poly_3161.area / SQM_PER_ACRE
        gb_acres = poly_3161.intersection(gb_outer_3161).area / SQM_PER_ACRE if poly_3161.intersects(gb_outer_3161) else 0.0
        sp_acres = poly_3161.intersection(gb_spec_3161).area / SQM_PER_ACRE if poly_3161.intersects(gb_spec_3161) else 0.0
        gb_pct = (gb_acres / land_acres * 100.0) if land_acres > 0 else 0.0
        for ind_id, label, uom, val in [
            ("greenbelt_acres", "Area within Ontario Greenbelt Outer Boundary", "acres", round(gb_acres)),
            ("greenbelt_share_land_pct", "Share of Total Land Area within Ontario Greenbelt (%)", "percent", round(gb_pct, 2)),
            ("greenbelt_specialty_crop_acres", "Greenbelt Specialty Crop Area (Niagara Peninsula Tender Fruit/Grape & Holland Marsh)", "acres", round(sp_acres)),
        ]:
            rows.append({
                "table_id": "LIO_Open06_Greenbelt",
                "ref_year": 2024,
                "geo_level": level,
                "geo_code": code,
                "geo_dguid": dguid,
                "geo_name": name,
                "indicator_id": ind_id,
                "indicator_label": label,
                "category": "Farmland Protection & Soil Capability (LIO / CLI)",
                "uom": uom,
                "value": fmt_num(val),
                "status_flag": "",
                "is_estimate": 0,
                "note": "Land Information Ontario (LIO_Open06 Layers 17 & 19) intersected in EPSG:3161",
            })
        return land_acres, gb_acres, sp_acres

    prov_land, prov_gb, prov_sp = 0.0, 0.0, 0.0
    zone_gb: dict[str, list[float]] = {}

    for cd, poly in sorted(cd_polys_3161.items()):
        la, ga, sa = emit_gb_rows("CD", cd, f"2021A0003{cd}", cd_names.get(cd, cd), poly)
        prov_land += la
        prov_gb += ga
        prov_sp += sa

    for ccs, poly in sorted(ccs_polys_3161.items()):
        la, ga, sa = emit_gb_rows("CCS", ccs, f"2021S0502{ccs}", ccs_names.get(ccs, ccs), poly)
        zid = ccs_to_zone.get(ccs)
        if zid and zid.startswith("OFA_Z"):
            zvec = zone_gb.setdefault(zid, [0.0, 0.0, 0.0])
            zvec[0] += la
            zvec[1] += ga
            zvec[2] += sa

    for z in zones_data["zones"]:
        zid = z["zone_id"]
        if zid in zone_gb:
            la, ga, sa = zone_gb[zid]
            for ind_id, label, uom, val in [
                ("greenbelt_acres", "Area within Ontario Greenbelt Outer Boundary", "acres", round(ga)),
                ("greenbelt_share_land_pct", "Share of Total Land Area within Ontario Greenbelt (%)", "percent", round(ga / la * 100.0, 2) if la else 0.0),
                ("greenbelt_specialty_crop_acres", "Greenbelt Specialty Crop Area (Niagara Peninsula Tender Fruit/Grape & Holland Marsh)", "acres", round(sa)),
            ]:
                rows.append({
                    "table_id": "LIO_Open06_Greenbelt",
                    "ref_year": 2024,
                    "geo_level": "OFA_ZONE",
                    "geo_code": zid,
                    "geo_dguid": "",
                    "geo_name": z["zone_name"],
                    "indicator_id": ind_id,
                    "indicator_label": label,
                    "category": "Farmland Protection & Soil Capability (LIO / CLI)",
                    "uom": uom,
                    "value": fmt_num(val),
                    "status_flag": "",
                    "is_estimate": 0,
                    "note": "Land Information Ontario (LIO_Open06 Layers 17 & 19) intersected in EPSG:3161",
                })

    for ind_id, label, uom, val in [
        ("greenbelt_acres", "Area within Ontario Greenbelt Outer Boundary", "acres", round(prov_gb)),
        ("greenbelt_share_land_pct", "Share of Total Land Area within Ontario Greenbelt (%)", "percent", round(prov_gb / prov_land * 100.0, 2) if prov_land else 0.0),
        ("greenbelt_specialty_crop_acres", "Greenbelt Specialty Crop Area (Niagara Peninsula Tender Fruit/Grape & Holland Marsh)", "acres", round(prov_sp)),
    ]:
        rows.append({
            "table_id": "LIO_Open06_Greenbelt",
            "ref_year": 2024,
            "geo_level": "PROVINCE",
            "geo_code": "35",
            "geo_dguid": "2021A000235",
            "geo_name": "Ontario",
            "indicator_id": ind_id,
            "indicator_label": label,
            "category": "Farmland Protection & Soil Capability (LIO / CLI)",
            "uom": uom,
            "value": fmt_num(val),
            "status_flag": "",
            "is_estimate": 0,
            "note": "Land Information Ontario (LIO_Open06 Layers 17 & 19) intersected in EPSG:3161",
        })

    qa.check("Greenbelt total area in Ontario is ~2.0M acres (1.8M–2.2M)", 1_800_000 <= prov_gb <= 2_200_000, f"Greenbelt={prov_gb:,.0f} acres")

    # =========================================================================
    # PART 3: ONTARIO SOIL SURVEY COMPLEX — CLI CAPABILITY FOR AGRICULTURE
    # =========================================================================
    cli_cd: dict[str, dict[str, float]] = {}
    stats_param = urllib.parse.quote(json.dumps([{"statisticType": "sum", "onStatisticField": "ACRES", "outStatisticFieldName": "sum_acres"}]))

    for comp_idx in (1, 2, 3):
        url = (
            f"https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open05/MapServer/9/query"
            f"?where=PERCENT{comp_idx}%3E0&groupByFieldsForStatistics=SURVEY1,CLI{comp_idx},PERCENT{comp_idx}"
            f"&outStatistics={stats_param}&f=json"
        )
        res = fetch_json(url, RAW_PROFILES_DIR / "land_lio" / f"cli_comp{comp_idx}.json")
        for feat in res.get("features", []):
            att = feat.get("attributes", {})
            surv = (att.get("SURVEY1") or "").strip().upper()
            cd = SURVEY_TO_CD.get(surv)
            if not cd:
                continue
            cli_cls = str(att.get(f"CLI{comp_idx}") or "").strip().upper()
            pct = float(att.get(f"PERCENT{comp_idx}") or 0.0) / 100.0
            ac = float(att.get("SUM_ACRES") or 0.0) * pct
            if ac <= 0:
                continue
            d = cli_cd.setdefault(cd, {})
            d["surveyed_total"] = d.get("surveyed_total", 0.0) + ac
            if cli_cls == "1":
                d["c1"] = d.get("c1", 0.0) + ac
            elif cli_cls == "2":
                d["c2"] = d.get("c2", 0.0) + ac
            elif cli_cls == "3":
                d["c3"] = d.get("c3", 0.0) + ac
            elif cli_cls in ("4", "5", "6", "7"):
                d["c4_7"] = d.get("c4_7", 0.0) + ac
            elif cli_cls == "O":
                d["organic"] = d.get("organic", 0.0) + ac

    # Spatially partition SURVEY1='SUDBURY' (3,367 polygons) in EPSG:3161 between
    # Greater Sudbury (CD 3553, incl. Valley East / Chelmsford basin) and Sudbury District (CD 3552)
    sudbury_features: list[dict] = []
    for page_idx, offset in enumerate((0, 2000)):
        sud_url = (
            "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open05/MapServer/9/query"
            f"?where=SURVEY1%3D%27SUDBURY%27&outFields=CLI1,PERCENT1,CLI2,PERCENT2,CLI3,PERCENT3"
            f"&outSR=4326&resultOffset={offset}&resultRecordCount=2000&f=geojson"
        )
        sud_page = fetch_json(sud_url, RAW_PROFILES_DIR / "land_lio" / f"cli_sudbury_page{page_idx}.geojson")
        sudbury_features.extend(sud_page.get("features", []))

    for feat in sudbury_features:
        geom_raw = feat.get("geometry")
        if not geom_raw:
            continue
        props = feat.get("properties", {})
        g4326 = shape(geom_raw)
        if not g4326.is_valid:
            g4326 = shapely.make_valid(g4326)
        g3161 = shapely.make_valid(shp_transform(transformer.transform, g4326))
        for target_cd in ("3553", "3552"):
            cd_poly = cd_polys_3161.get(target_cd)
            if cd_poly is None or not cd_poly.intersects(g3161):
                continue
            inter_ac = cd_poly.intersection(g3161).area / SQM_PER_ACRE
            if inter_ac <= 0:
                continue
            d = cli_cd.setdefault(target_cd, {})
            for comp_idx in (1, 2, 3):
                pct = float(props.get(f"PERCENT{comp_idx}") or 0.0) / 100.0
                if pct <= 0:
                    continue
                ac = inter_ac * pct
                cli_cls = str(props.get(f"CLI{comp_idx}") or "").strip().upper()
                d["surveyed_total"] = d.get("surveyed_total", 0.0) + ac
                if cli_cls == "1":
                    d["c1"] = d.get("c1", 0.0) + ac
                elif cli_cls == "2":
                    d["c2"] = d.get("c2", 0.0) + ac
                elif cli_cls == "3":
                    d["c3"] = d.get("c3", 0.0) + ac
                elif cli_cls in ("4", "5", "6", "7"):
                    d["c4_7"] = d.get("c4_7", 0.0) + ac
                elif cli_cls == "O":
                    d["organic"] = d.get("organic", 0.0) + ac

    def emit_cli_rows(level: str, code: str, dguid: str, name: str, d: dict[str, float], note: str = "") -> None:
        c1 = d.get("c1", 0.0)
        c2 = d.get("c2", 0.0)
        c3 = d.get("c3", 0.0)
        prime = c1 + c2 + c3
        c4_7 = d.get("c4_7", 0.0)
        org = d.get("organic", 0.0)
        tot = d.get("surveyed_total", 0.0)
        if tot <= 0:
            return
        prime_pct = prime / tot * 100.0
        for ind_id, label, uom, val in [
            ("cli_prime_1_to_3_acres", "Prime Agricultural Land (CLI Class 1–3 Soil Area)", "acres", round(prime)),
            ("cli_prime_share_surveyed_pct", "Prime Agricultural Share of Mapped Soil Area (CLI Class 1–3 %)", "percent", round(prime_pct, 2)),
            ("cli_class1_acres", "CLI Class 1 Soil Area (No Significant Limitations)", "acres", round(c1)),
            ("cli_class2_acres", "CLI Class 2 Soil Area (Moderate Limitations)", "acres", round(c2)),
            ("cli_class3_acres", "CLI Class 3 Soil Area (Moderately Severe Limitations)", "acres", round(c3)),
            ("cli_class4_to_7_acres", "CLI Class 4–7 Soil Area (Marginal / Non-Agricultural Mineral Soils)", "acres", round(c4_7)),
            ("cli_organic_acres", "CLI Class O Soil Area (Organic / Muck Soils)", "acres", round(org)),
        ]:
            rows.append({
                "table_id": "LIO_Open05_SoilSurveyComplex",
                "ref_year": 2024,
                "geo_level": level,
                "geo_code": code,
                "geo_dguid": dguid,
                "geo_name": name,
                "indicator_id": ind_id,
                "indicator_label": label,
                "category": "Farmland Protection & Soil Capability (LIO / CLI)",
                "uom": uom,
                "value": fmt_num(val),
                "status_flag": "",
                "is_estimate": 0,
                "note": note or "Ontario Soil Survey Complex (Land Information Ontario LIO_Open05 Layer 9), component-weighted CLI capability",
            })

    cli_prov: dict[str, float] = {}
    cli_zone: dict[str, dict[str, float]] = {}
    sdg_shares = zones_data["cd_to_zone"]["3501"]["sdg_2021_shares"]

    for cd, d in sorted(cli_cd.items()):
        emit_cli_rows("CD", cd, f"2021A0003{cd}", cd_names.get(cd, cd), d)
        for k, v in d.items():
            cli_prov[k] = cli_prov.get(k, 0.0) + v
        if cd == "3501":
            # Allocate SD&G surveyed soil area to Zone 11 and Zone 14 by township land area share
            z11_land = sum(ccs_polys_3161[c].area for c in sdg_shares["OFA_Z11"]["ccs_codes"])
            z14_land = sum(ccs_polys_3161[c].area for c in sdg_shares["OFA_Z14"]["ccs_codes"])
            tot_sdg_land = z11_land + z14_land
            for zid, lshare in [("OFA_Z11", z11_land / tot_sdg_land), ("OFA_Z14", z14_land / tot_sdg_land)]:
                zd = cli_zone.setdefault(zid, {})
                for k, v in d.items():
                    zd[k] = zd.get(k, 0.0) + v * lshare
        else:
            zid = cd_to_zone.get(cd, {}).get("zone_id")
            if zid and zid.startswith("OFA_Z"):
                zd = cli_zone.setdefault(zid, {})
                for k, v in d.items():
                    zd[k] = zd.get(k, 0.0) + v

    for z in zones_data["zones"]:
        zid = z["zone_id"]
        if zid in cli_zone:
            emit_cli_rows("OFA_ZONE", zid, "", z["zone_name"], cli_zone[zid])
    emit_cli_rows("PROVINCE", "35", "2021A000235", "Ontario", cli_prov)

    huron_prime = sum(cli_cd.get("3540", {}).get(k, 0.0) for k in ("c1", "c2", "c3"))
    qa.check("CLI Soil Survey: Huron (3540) Prime Class 1–3 > 600,000 acres", huron_prime > 600_000, f"Huron Prime={huron_prime:,.0f} acres")

    out = write_tidy(SOURCE_ID, rows)
    qa.write()
    register_source(
        SOURCE_ID,
        publisher="ISED Canada & Land Information Ontario (OMAFA / MNRF)",
        title="ISED National Broadband Data (50/10 Mbps), Ontario Greenbelt, and CLI Soil Capability for Agriculture",
        url="https://open.canada.ca/data/en/dataset/00a331db-121b-445d-b119-35dbbe3eedd9",
        licence="Open Government Licence – Canada & Open Government Licence – Ontario",
        vintage="2021–2024",
        geography="49 Ontario CDs, 273 Ontario CCSs, 15 OFA Zones, and Ontario",
        method=(
            "1. ISED PHH-ON.csv joined with Current & Gov-Supported PHH Speeds on PHH_ID; mapped to CDs via DBUID[:4] and CCSs via spatial point-in-polygon. "
            "2. Greenbelt Outer Boundary (LIO_Open06/17) & Specialty Crop Areas (LIO_Open06/19) intersected with StatCan 2021 boundaries in EPSG:3161. "
            "3. Ontario Soil Survey Complex (LIO_Open05/9) aggregated across Components 1–3 weighted by PERCENT1–3."
        ),
        caveats=[
            "Northern districts without completed county soil surveys (or unmapped urban cores like Toronto CD 3520) are only partially covered in LIO Soil Survey Complex."
        ],
        row_count=len(rows),
        output_file=str(out.name),
        script=Path(__file__).name,
    )
    print(f"Wrote {len(rows):,} rows -> {out}; QA all passed: {qa.all_passed}")


if __name__ == "__main__":
    main()
