import csv
import json
import os
import re
from collections import defaultdict
from pathlib import Path

print("Starting empirical Canadian Census of Agriculture dataset compilation...")

PROJECT_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = str(PROJECT_DIR / "data-pipeline" / "raw")
CUBES_DIR = f"{RAW_DIR}/cubes"
OUT_DIR = str(PROJECT_DIR / "public" / "data")
os.makedirs(OUT_DIR, exist_ok=True)

# 1. Load official StatCan 2021 centroids & land area
with open(f"{RAW_DIR}/statcan_geo_centroids.json", "r", encoding="utf-8") as f:
    centroid_db = json.load(f)
by_dguid = centroid_db["by_dguid"]
by_uid = centroid_db["by_uid"]

# Province code lookup
PROVINCE_NAMES = {
    "00": "Canada",
    "10": "Newfoundland and Labrador",
    "11": "Prince Edward Island",
    "12": "Nova Scotia",
    "13": "New Brunswick",
    "24": "Quebec",
    "35": "Ontario",
    "46": "Manitoba",
    "47": "Saskatchewan",
    "48": "Alberta",
    "59": "British Columbia",
    "60": "Yukon",
    "61": "Northwest Territories",
    "62": "Nunavut",
}

# OFA County & Regional Federation mapping for Ontario CDs (PR=35)
ONTARIO_OFA_FEDERATIONS = {
    "3501": ("Stormont, Dundas & Glengarry Federations", "Eastern Ontario"),
    "3502": ("Prescott & Russell Federations", "Eastern Ontario"),
    "3506": ("Ottawa Federation of Agriculture", "Eastern Ontario"),
    "3507": ("Leeds & Grenville Federations", "Eastern Ontario"),
    "3509": ("Lanark Federation of Agriculture", "Eastern Ontario"),
    "3510": ("Frontenac Federation of Agriculture", "Eastern Ontario"),
    "3511": ("Lennox & Addington Federation of Agriculture", "Eastern Ontario"),
    "3512": ("Hastings Federation of Agriculture", "Central Ontario"),
    "3513": ("Prince Edward Federation of Agriculture", "Central Ontario"),
    "3514": ("Northumberland Federation of Agriculture", "Central Ontario"),
    "3515": ("Peterborough County Federation of Agriculture", "Central Ontario"),
    "3516": ("Victoria (Kawartha Lakes) Federation of Agriculture", "Central Ontario"),
    "3518": ("Durham Region Federation of Agriculture", "Central Ontario"),
    "3519": ("York Region Federation of Agriculture", "Central Ontario"),
    "3520": ("Toronto / GTA Urban Agriculture", "Central Ontario"),
    "3521": ("Peel Federation of Agriculture", "Western Ontario"),
    "3522": ("Dufferin Federation of Agriculture", "Western Ontario"),
    "3523": ("Wellington Federation of Agriculture", "Western Ontario"),
    "3524": ("Halton Region Federation of Agriculture", "Western Ontario"),
    "3525": ("Hamilton-Wentworth Federation of Agriculture", "Southern Ontario"),
    "3526": ("Niagara Federation of Agriculture", "Southern Ontario"),
    "3528": ("Haldimand & Norfolk Federations of Agriculture", "Southern Ontario"),
    "3529": ("Brant County Federation of Agriculture", "Southern Ontario"),
    "3530": ("Waterloo Region Federation of Agriculture", "Western Ontario"),
    "3531": ("Perth County Federation of Agriculture", "Western Ontario"),
    "3532": ("Oxford County Federation of Agriculture", "Southern Ontario"),
    "3534": ("Elgin Federation of Agriculture", "Southern Ontario"),
    "3536": ("Kent Federation of Agriculture (Chatham-Kent)", "Southern Ontario"),
    "3537": ("Essex County Federation of Agriculture", "Southern Ontario"),
    "3538": ("Lambton County Federation of Agriculture", "Southern Ontario"),
    "3539": ("Middlesex Federation of Agriculture", "Southern Ontario"),
    "3540": ("Huron County Federation of Agriculture", "Western Ontario"),
    "3541": ("Bruce County Federation of Agriculture", "Western Ontario"),
    "3542": ("Grey County Federation of Agriculture", "Western Ontario"),
    "3543": ("Simcoe County Federation of Agriculture", "Western Ontario"),
    "3544": ("Muskoka Federation of Agriculture", "Central Ontario"),
    "3546": ("Haliburton Federation of Agriculture", "Central Ontario"),
    "3547": ("Renfrew County Federation of Agriculture", "Eastern Ontario"),
    "3548": ("East Nipissing-Parry Sound & West Nipissing-Sudbury East Federations (Nipissing)", "Northern Ontario"),
    "3549": ("East Nipissing-Parry Sound Federation of Agriculture (Parry Sound)", "Central Ontario"),
    "3551": ("Manitoulin Island Federation of Agriculture", "Northern Ontario"),
    "3552": ("West Nipissing-Sudbury East Federation of Agriculture (Sudbury District)", "Northern Ontario"),
    "3553": ("West Nipissing-Sudbury East / Greater Sudbury Federation of Agriculture", "Northern Ontario"),
    "3554": ("Temiskaming Federation of Agriculture (Timiskaming)", "Northern Ontario"),
    "3556": ("Cochrane District Federation of Agriculture", "Northern Ontario"),
    "3557": ("Algoma Federation of Agriculture", "Northern Ontario"),
    "3558": ("Thunder Bay Federation of Agriculture", "Northern Ontario"),
    "3559": ("Rainy River Federation of Agriculture", "Northern Ontario"),
    "3560": ("Kenora District Federation of Agriculture", "Northern Ontario"),
}

# 2. Parse all 2,113 geographies from 32100231.csv and build full hierarchy
geo_nodes = {}
dguid_suffix_to_geoid = {}  # e.g. "A00033540" -> "CD350240000" or dguid

bracket_re = re.compile(r"^(.*?)\s*\[([A-Z0-9]+)\]$")

raw_geos = []
with open(f"{CUBES_DIR}/32100231.csv", "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    seen = set()
    for row in reader:
        geo_str = row["GEO"]
        dguid = row["DGUID"]
        if dguid in seen:
            continue
        seen.add(dguid)
        raw_geos.append((geo_str, dguid))

# Map CAR codes and CD codes for parent resolution
car_id_by_code = {}  # e.g. "3502" -> dguid
cd_id_by_code = {}   # e.g. "3540" -> dguid
pr_id_by_code = {}   # e.g. "35" -> dguid
country_dguid = "2021A000011124"

for geo_str, dguid in raw_geos:
    m = bracket_re.match(geo_str)
    label = m.group(1).strip() if m else geo_str
    bcode = m.group(2).strip() if m else ""

    if bcode == "000000000":
        level = "Country"
        pr_code = "00"
        uid_key = "00"
    elif bcode.startswith("PR"):
        level = "Provinces & Territories"
        pr_code = bcode[2:4]
        uid_key = f"PR_{pr_code}"
        pr_id_by_code[pr_code] = dguid
    elif bcode.startswith("CAR"):
        level = "Census Agricultural Regions (CAR)"
        pr_code = bcode[3:5]
        car_code = bcode[3:7]
        uid_key = f"CAR_{car_code}"
        car_id_by_code[car_code] = dguid
    elif bcode.startswith("CD"):
        level = "Counties / Census Divisions (CD)"
        pr_code = bcode[2:4]
        car_code = bcode[2:6]
        cd_code = bcode[2:4] + bcode[6:8]
        uid_key = f"CD_{cd_code}"
        cd_id_by_code[cd_code] = dguid
    elif bcode.startswith("CCS"):
        level = "Townships / Subdivisions (CCS)"
        pr_code = bcode[3:5]
        car_code = bcode[3:7]
        cd_code = bcode[3:5] + bcode[7:9]
        ccs_code = cd_code + bcode[9:12]
        uid_key = f"CCS_{ccs_code}"
    else:
        level = "Townships / Subdivisions (CCS)"
        pr_code = "00"
        uid_key = ""

    # Clean display name (strip trailing ", Province" if desired for cleanName)
    prov_name = PROVINCE_NAMES.get(pr_code, "Canada")
    clean_name = label
    if clean_name.endswith(f", {prov_name}"):
        clean_name = clean_name[: -len(f", {prov_name}")].strip()

    # Lookup coordinates & land area
    c_info = by_dguid.get(dguid) or by_uid.get(uid_key) or {}
    lat = c_info.get("lat")
    lon = c_info.get("lon")
    land_area = c_info.get("landAreaSqKm")
    if dguid == country_dguid:
        lat, lon, land_area = 56.1304, -106.3468, 8965588.85

    geo_nodes[dguid] = {
        "id": dguid,
        "dguid": dguid,
        "bcode": bcode,
        "name": label,
        "cleanName": clean_name,
        "level": level,
        "provinceCode": pr_code,
        "provinceName": prov_name,
        "parentId": None,
        "hierarchyPath": label,
        "lat": lat,
        "lon": lon,
        "landAreaSqKm": land_area,
    }
    if len(dguid) > 4:
        dguid_suffix_to_geoid[dguid[4:]] = dguid

# Second pass: wire parentId, fallback coordinates to parent, OFA federation & hierarchyPath
for dguid, node in geo_nodes.items():
    bcode = node["bcode"]
    pr_code = node["provinceCode"]
    level = node["level"]

    if level == "Country":
        node["parentId"] = None
        node["hierarchyPath"] = "Canada"
    elif level == "Provinces & Territories":
        node["parentId"] = country_dguid
        node["hierarchyPath"] = f"Canada > {node['cleanName']}"
    elif level == "Census Agricultural Regions (CAR)":
        node["parentId"] = pr_id_by_code.get(pr_code, country_dguid)
        node["hierarchyPath"] = f"{node['provinceName']} > {node['cleanName']} (CAR)"
    elif level == "Counties / Census Divisions (CD)":
        car_code = bcode[2:6]
        cd_code = bcode[2:4] + bcode[6:8]
        parent_car = car_id_by_code.get(car_code) or pr_id_by_code.get(pr_code)
        node["parentId"] = parent_car
        car_name = geo_nodes[parent_car]["cleanName"] if parent_car in geo_nodes else ""
        node["hierarchyPath"] = f"{node['provinceName']} > {car_name} > {node['cleanName']} (CD)"
        if pr_code == "35" and cd_code in ONTARIO_OFA_FEDERATIONS:
            node["ofaFederation"] = ONTARIO_OFA_FEDERATIONS[cd_code][0]
            node["omafaRegion"] = ONTARIO_OFA_FEDERATIONS[cd_code][1]
    elif level == "Townships / Subdivisions (CCS)":
        car_code = bcode[3:7]
        cd_code = bcode[3:5] + bcode[7:9]
        parent_cd = cd_id_by_code.get(cd_code) or car_id_by_code.get(car_code) or pr_id_by_code.get(pr_code)
        node["parentId"] = parent_cd
        cd_name = geo_nodes[parent_cd]["cleanName"] if parent_cd in geo_nodes else ""
        car_id = car_id_by_code.get(car_code)
        car_name = geo_nodes[car_id]["cleanName"] if car_id in geo_nodes else ""
        node["hierarchyPath"] = f"{node['provinceName']} > {car_name} > {cd_name} (CD) > {node['cleanName']} (CCS)"
        if pr_code == "35" and cd_code in ONTARIO_OFA_FEDERATIONS:
            node["ofaFederation"] = ONTARIO_OFA_FEDERATIONS[cd_code][0]
            node["omafaRegion"] = ONTARIO_OFA_FEDERATIONS[cd_code][1]

# Fallback any missing lat/lon from parent
for dguid, node in geo_nodes.items():
    if node["lat"] is None or node["lon"] is None:
        p = node["parentId"]
        while p and p in geo_nodes:
            if geo_nodes[p]["lat"] is not None:
                node["lat"] = geo_nodes[p]["lat"]
                node["lon"] = geo_nodes[p]["lon"]
                break
            p = geo_nodes[p]["parentId"]
        if node["lat"] is None:
            node["lat"], node["lon"] = 50.0, -85.0
    del node["bcode"]

print(f"Built {len(geo_nodes)} hierarchical geography nodes.")

# 3. Define the Characteristic Catalog & Cube Extraction Rules
# Each entry maps a clean characteristic ID to its metadata and extraction rule
characteristics = []
char_by_id = {}
code_counter = 1

def add_char(cid, name, short_name, table_id, category, layer1, layer2, layer3, unit, base_id, base_desc, is_rc=True, is_ra=False, is_sc=True):
    global code_counter
    meta = {
        "id": cid,
        "codeId": code_counter,
        "name": name,
        "shortName": short_name,
        "statcanTable": table_id,
        "category": category,
        "layer1": layer1,
        "layer2": layer2,
        "layer3": layer3,
        "unit": unit,
        "baseId": base_id,
        "baseDescription": base_desc,
        "isRankerCount": is_rc,
        "isRankerAgg": is_ra,
        "isScoreCandidate": is_sc,
    }
    code_counter += 1
    characteristics.append(meta)
    char_by_id[cid] = meta

# Category 1: Farm Structure & Industry (NAICS) [32-10-0231-01 & 32-10-0403-01]
CAT_NAICS = "1. Farm Types & Industry (NAICS)"
add_char("total_farms", "Total number of census farms", "Total Farms", "32-10-0231-01", CAT_NAICS, "Aggregate Statistics", "Total Census Farms", "Total Farms", "FARMS", None, "Total census farms in geography", True, True, False)

NAICS_ITEMS = [
    ("naics_oilseed_grain", "Oilseed and grain farming [1111]", "Oilseed & Grain (Total)", "Major Farm Types (4-Digit NAICS)"),
    ("naics_soybean", "Soybean farming [111110]", "Soybean Farming", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_oilseed_other", "Oilseed (except soybean) farming [111120]", "Canola & Other Oilseed", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_corn", "Corn farming [111150]", "Corn Farming", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_wheat", "Wheat farming [111140]", "Wheat Farming", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_other_grain", "Other grain farming [111190]", "Other Grain Farming", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_cattle_total", "Cattle ranching and farming [1121]", "Cattle", "Major Farm Types (4-Digit NAICS)"),
    ("naics_beef", "Beef cattle ranching and farming, including feedlots [112110]", "Beef Cattle & Feedlots", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_dairy", "Dairy cattle and milk production [112120]", "Dairy Cattle & Milk", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_other_crop", "Other crop farming [1119]", "Other Crop Farming (Hay/Maple/Misc)", "Major Farm Types (4-Digit NAICS)"),
    ("naics_hay", "Hay farming [111940]", "Hay Farming", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_maple", "Maple syrup and products production [111994]", "Maple Syrup Production", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_other_animal", "Other animal production [1129]", "Other Animal Production (Equine/Bees/Mixed)", "Major Farm Types (4-Digit NAICS)"),
    ("naics_horse", "Horse and other equine production [112920]", "Horse & Equine Production", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_apiculture", "Apiculture [112910]", "Apiculture (Beekeeping)", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_fruit_nut", "Fruit and tree nut farming [1113]", "Fruit & Tree Nut Farming", "Major Farm Types (4-Digit NAICS)"),
    ("naics_greenhouse", "Greenhouse, nursery and floriculture production [1114]", "Greenhouse, Nursery & Floriculture", "Major Farm Types (4-Digit NAICS)"),
    ("naics_vegetable", "Vegetable and melon farming [1112]", "Vegetable & Melon Farming", "Major Farm Types (4-Digit NAICS)"),
    ("naics_potato", "Potato farming [111211]", "Potato Farming", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_poultry_egg", "Poultry and egg production [1123]", "Poultry & Egg Production", "Major Farm Types (4-Digit NAICS)"),
    ("naics_chicken_egg", "Chicken egg production [112310]", "Chicken Egg Production", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_broiler", "Broiler and other meat-type chicken production [112320]", "Broiler Chicken Production", "Detailed Farm Types (6-Digit NAICS)"),
    ("naics_hog", "Hog and pig farming [1122]", "Hog & Pig Farming", "Major Farm Types (4-Digit NAICS)"),
    ("naics_sheep_goat", "Sheep and goat farming [1124]", "Sheep & Goat Farming", "Major Farm Types (4-Digit NAICS)"),
]
for cid, raw_label, short_label, sublayer in NAICS_ITEMS:
    add_char(cid, raw_label, short_label, "32-10-0231-01", CAT_NAICS, "Characteristic Distribution", sublayer, "Farms by NAICS Industry", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")

# Category 2: Land Use & Farm Size Distribution [32-10-0249-01 & 32-10-0232-01]
CAT_LAND = "2. Land Use & Farm Area Size"
add_char("land_total_acres", "Total farm area (Acres)", "Total Farm Area (Acres)", "32-10-0249-01", CAT_LAND, "Aggregate Statistics", "Total & Average Land Area", "Land Area Totals", "ACRES", None, "Total agricultural land area (acres)", True, True, False)
add_char("avg_farm_size_acres", "Average farm size (Acres per farm)", "Avg Farm Size (Acres)", "32-10-0249-01", CAT_LAND, "Aggregate Statistics", "Total & Average Land Area", "Land Area Averages", "ACRES", None, "Total farm area divided by total census farms", False, True, True)
add_char("avg_cropland_per_farm", "Average cropland area per farm (Acres)", "Avg Cropland / Farm (Acres)", "32-10-0249-01", CAT_LAND, "Aggregate Statistics", "Total & Average Land Area", "Land Area Averages", "ACRES", None, "Total land in crops divided by total census farms", False, True, True)

LAND_USE_ACRES = [
    ("land_crops_acres", "Land in crops (excluding Christmas tree area)", "Land in Crops (Acres)"),
    ("land_tame_pasture_acres", "Tame or seeded pasture", "Tame / Seeded Pasture (Acres)"),
    ("land_natural_pasture_acres", "Natural land for pasture", "Natural Pasture Land (Acres)"),
    ("land_woodland_wetland_acres", "Woodlands and wetlands", "Woodlands & Wetlands (Acres)"),
    ("land_summerfallow_acres", "Summerfallow land", "Summerfallow Land (Acres)"),
    ("land_christmas_trees_acres", "Christmas trees grown for sale", "Christmas Tree Area (Acres)"),
    ("land_other_acres", "All other land", "All Other Farm Land (Acres)"),
]
for cid, raw_label, short_label in LAND_USE_ACRES:
    add_char(cid, f"{raw_label} (Acres)", short_label, "32-10-0249-01", CAT_LAND, "Characteristic Distribution", "Land Use Breakdown (Acres)", "Acres by Land Use Category", "ACRES", "land_total_acres", "Total farm area in acres (32-10-0249-01)")

FARM_SIZE_CLASSES = [
    ("size_under_10", "Under 10.00 acres", "Under 10 acres"),
    ("size_10_69", "10.00 to 69.99 acres", "10 to 69 acres"),
    ("size_70_129", "70.00 to 129.99 acres", "70 to 129 acres"),
    ("size_130_179", "130.00 to 179.99 acres", "130 to 179 acres"),
    ("size_180_239", "180.00 to 239.99 acres", "180 to 239 acres"),
    ("size_240_399", "240.00 to 399.99 acres", "240 to 399 acres"),
    ("size_400_559", "400.00 to 559.99 acres", "400 to 559 acres"),
    ("size_560_759", "560.00 to 759.99 acres", "560 to 759 acres"),
    ("size_760_1119", "760.00 to 1,119.99 acres", "760 to 1,119 acres"),
    ("size_1120_1599", "1,120.00 to 1,599.99 acres", "1,120 to 1,599 acres"),
    ("size_1600_2239", "1,600.00 to 2,239.99 acres", "1,600 to 2,239 acres"),
    ("size_2240_2879", "2,240.00 to 2,879.99 acres", "2,240 to 2,879 acres"),
    ("size_2880_3519", "2,880.00 to 3,519.99 acres", "2,880 to 3,519 acres"),
    ("size_3520_plus", "3,520.00 acres and over", "3,520+ acres"),
]
for cid, raw_label, short_label in FARM_SIZE_CLASSES:
    add_char(cid, f"Farm Size: {raw_label}", short_label, "32-10-0232-01", CAT_LAND, "Characteristic Distribution", "Farms by Total Area Class", "Farm Size Class (Farms)", "FARMS", "total_farms", "Total number of census farms (32-10-0232-01)")

# Category 3: Land Tenure & Operating Structure [32-10-0234-01 & 32-10-0235-01]
CAT_TENURE = "3. Land Tenure & Operating Structure"
TENURE_ACRES = [
    ("tenure_owned_acres", "Area owned", "Area Owned (Acres)"),
    ("tenure_rented_acres", "Area rented or leased from others", "Rented / Leased from Others (Acres)"),
    ("tenure_govt_leased_acres", "Area leased from governments", "Leased from Governments (Acres)"),
    ("tenure_cropshare_acres", "Crop-shared land used by the operation", "Crop-Shared Land (Acres)"),
    ("tenure_other_acres", "Other land area used by the operation", "Other Tenure Area (Acres)"),
]
for cid, raw_label, short_label in TENURE_ACRES:
    add_char(cid, f"Tenure: {raw_label} (Acres)", short_label, "32-10-0234-01", CAT_TENURE, "Characteristic Distribution", "Land Tenure (Acres)", "Acres by Tenure Type", "ACRES", "land_total_acres", "Total farm area in acres (32-10-0234-01)")

OP_ARRANGEMENTS = [
    ("op_sole_prop", "Sole proprietorship", "Sole Proprietorship"),
    ("op_partnership", "Partnership", "Partnership"),
    ("op_family_corp", "Family corporation", "Family Corporation"),
    ("op_nonfamily_corp", "Non-family corporation", "Non-Family Corporation"),
    ("op_other", "Other operating arrangements", "Other Operating Arrangements"),
]
for cid, raw_label, short_label in OP_ARRANGEMENTS:
    add_char(cid, f"Operating Arrangement: {raw_label}", short_label, "32-10-0235-01", CAT_TENURE, "Characteristic Distribution", "Operating Arrangements (Farms)", "Farms by Legal Structure", "FARMS", "total_farms", "Total number of census farms (32-10-0235-01)")

# Category 4: Farm Capital, Revenues & Expenses [32-10-0236, 0237, 0239, 0240, 0241]
CAT_FIN = "4. Farm Capital, Revenues & Expenses"
add_char("cap_total_dollars", "Total farm capital ($)", "Total Farm Capital ($)", "32-10-0237-01", CAT_FIN, "Aggregate Statistics", "Financial Totals & Per-Farm Averages", "Capital & Asset Values", "DOLLARS", None, "Total market value of all farm capital ($)", True, True, False)
add_char("avg_capital_per_farm", "Average farm capital per farm ($)", "Avg Farm Capital / Farm ($)", "32-10-0237-01", CAT_FIN, "Aggregate Statistics", "Financial Totals & Per-Farm Averages", "Capital & Asset Values", "DOLLARS", None, "Total farm capital divided by total census farms", False, True, True)
add_char("land_bldg_value_per_acre", "Market value of land & buildings per acre ($/Acre)", "Land & Building Value ($/Acre)", "32-10-0237-01", CAT_FIN, "Aggregate Statistics", "Financial Totals & Per-Farm Averages", "Capital & Asset Values", "DOLLARS", None, "Total value of land & buildings divided by total farm area (acres)", False, True, True)
add_char("rev_total_dollars", "Total gross farm operating revenues ($)", "Total Operating Revenues ($)", "32-10-0240-01", CAT_FIN, "Aggregate Statistics", "Financial Totals & Per-Farm Averages", "Revenues, Expenses & Margin", "DOLLARS", None, "Total gross farm operating revenues excluding forest products ($)", True, True, False)
add_char("exp_total_dollars", "Total farm operating expenses ($)", "Total Operating Expenses ($)", "32-10-0241-01", CAT_FIN, "Aggregate Statistics", "Financial Totals & Per-Farm Averages", "Revenues, Expenses & Margin", "DOLLARS", None, "Total farm business operating expenses ($)", True, True, False)
add_char("avg_rev_per_farm", "Average gross operating revenue per farm ($)", "Avg Revenue / Farm ($)", "32-10-0240-01", CAT_FIN, "Aggregate Statistics", "Financial Totals & Per-Farm Averages", "Revenues, Expenses & Margin", "DOLLARS", None, "Total operating revenues divided by total census farms", False, True, True)
add_char("avg_exp_per_farm", "Average operating expenses per farm ($)", "Avg Expenses / Farm ($)", "32-10-0241-01", CAT_FIN, "Aggregate Statistics", "Financial Totals & Per-Farm Averages", "Revenues, Expenses & Margin", "DOLLARS", None, "Total operating expenses divided by total census farms", False, True, True)
add_char("avg_net_income_per_farm", "Average net operating income per farm ($)", "Avg Net Operating Income / Farm ($)", "32-10-0240-01", CAT_FIN, "Aggregate Statistics", "Financial Totals & Per-Farm Averages", "Revenues, Expenses & Margin", "DOLLARS", None, "Average operating revenue minus average operating expenses per farm", False, True, True)
add_char("net_operating_margin_pct", "Net operating margin (% of gross revenues)", "Net Operating Margin (%)", "32-10-0240-01", CAT_FIN, "Aggregate Statistics", "Financial Totals & Per-Farm Averages", "Revenues, Expenses & Margin", "PERCENT", None, "(Revenues - Expenses) / Revenues * 100", False, True, True)

CAP_BREAKDOWN = [
    ("cap_land_bldg_total", "Value of land and buildings, total", "Land & Buildings Total ($)"),
    ("cap_land_bldg_owned", "Value of land and buildings, owned", "Owned Land & Buildings ($)"),
    ("cap_land_bldg_rented", "Value of land and buildings, rented or leased from others", "Rented/Leased Land & Buildings ($)"),
    ("cap_machinery", "Value of farm machinery, equipment and vehicles", "Machinery & Equipment ($)"),
    ("cap_livestock", "Value of livestock and poultry", "Livestock & Poultry Capital ($)"),
]
for cid, raw_label, short_label in CAP_BREAKDOWN:
    add_char(cid, f"{raw_label} ($)", short_label, "32-10-0237-01", CAT_FIN, "Characteristic Distribution", "Farm Capital Breakdown ($)", "Capital Component Share ($)", "DOLLARS", "cap_total_dollars", "Total farm capital in dollars (32-10-0237-01)")

REV_CLASSES = [
    ("rev_under_10k", "$1 to $9,999", "$1 to $9,999"),
    ("rev_10k_25k", "$10,000 to $24,999", "$10,000 to $24,999"),
    ("rev_25k_50k", "$25,000 to $49,999", "$25,000 to $49,999"),
    ("rev_50k_100k", "$50,000 to $99,999", "$50,000 to $99,999"),
    ("rev_100k_250k", "$100,000 to $249,999", "$100,000 to $249,999"),
    ("rev_250k_500k", "$250,000 to $499,999", "$250,000 to $499,999"),
    ("rev_500k_1m", "$500,000 to $999,999", "$500,000 to $999,999"),
    ("rev_1m_2m", "$1,000,000 to $1,999,999", "$1,000,000 to $1,999,999"),
    ("rev_2m_plus", "$2,000,000 and over", "$2,000,000 and over"),
]
for cid, raw_label, short_label in REV_CLASSES:
    add_char(cid, f"Revenue Class: {raw_label}", short_label, "32-10-0239-01", CAT_FIN, "Characteristic Distribution", "Farms by Gross Revenue Class", "Gross Farm Receipts Distribution", "FARMS", "total_farms", "Total number of census farms (32-10-0239-01)")
add_char("rev_500k_plus", "Revenue Class: $500,000 and over (Commercial Scale)", "$500,000 and over", "32-10-0239-01", CAT_FIN, "Characteristic Distribution", "Farms by Gross Revenue Class", "Gross Farm Receipts Distribution", "FARMS", "total_farms", "Total number of census farms (32-10-0239-01)")

CAP_CLASSES = [
    ("cap_under_100k", "Under $100,000", "Under $100,000"),
    ("cap_100k_200k", "$100,000 to $199,999", "$100,000 to $199,999"),
    ("cap_200k_350k", "$200,000 to $349,999", "$200,000 to $349,999"),
    ("cap_350k_500k", "$350,000 to $499,999", "$350,000 to $499,999"),
    ("cap_500k_1m", "$500,000 to $999,999", "$500,000 to $999,999"),
    ("cap_1m_1_5m", "$1,000,000 to $1,499,999", "$1.0M to $1.49M"),
    ("cap_1_5m_2m", "$1,500,000 to $1,999,999", "$1.5M to $1.99M"),
    ("cap_2m_3_5m", "$2,000,000 to $3,499,999", "$2.0M to $3.49M"),
    ("cap_3_5m_plus", "$3,500,000 and over", "$3.5M and over"),
]
for cid, raw_label, short_label in CAP_CLASSES:
    add_char(cid, f"Capital Class: {raw_label}", short_label, "32-10-0236-01", CAT_FIN, "Characteristic Distribution", "Farms by Total Capital Class", "Farm Capital Distribution", "FARMS", "total_farms", "Total number of census farms (32-10-0236-01)")

# Category 5: Field Crops, Hay & Oilseeds [32-10-0309-01]
CAT_CROPS = "5. Field Crops, Grains & Oilseeds"
add_char("crop_total_acres", "Total area of field crops and hay (Acres)", "Total Field Crops & Hay (Acres)", "32-10-0309-01", CAT_CROPS, "Aggregate Statistics", "Field Crop Totals", "Total Field Crop Area", "ACRES", None, "Total area of field crops and hay (acres)", True, True, False)

FIELD_CROPS = [
    ("crop_soybeans", "Soybeans", "Soybeans"),
    ("crop_corn_grain", "Corn for grain", "Corn for Grain"),
    ("crop_corn_silage", "Corn for silage", "Corn for Silage"),
    ("crop_wheat_total", "Wheat, total", "Wheat (Total)"),
    ("crop_winter_wheat", "Winter wheat", "Winter Wheat"),
    ("crop_spring_wheat", "Spring wheat (excluding durum)", "Spring Wheat"),
    ("crop_canola", "Canola (rapeseed)", "Canola (Rapeseed)"),
    ("crop_alfalfa", "Alfalfa and alfalfa mixtures", "Alfalfa & Mixtures"),
    ("crop_other_hay", "All other tame hay and fodder crops", "Other Tame Hay & Fodder"),
    ("crop_barley", "Barley", "Barley"),
    ("crop_oats", "Oats", "Oats"),
    ("crop_mixed_grains", "Mixed grains", "Mixed Grains"),
    ("crop_dry_peas", "Dry field peas", "Dry Field Peas"),
    ("crop_lentils", "Lentils", "Lentils"),
    ("crop_white_beans", "Dry white beans", "Dry White Beans"),
    ("crop_other_beans", "Other dry beans", "Other Dry Beans"),
    ("crop_potatoes", "Potatoes", "Potatoes"),
    ("crop_rye", "Rye, total", "Rye (Total)"),
]
for cid, raw_label, short_label in FIELD_CROPS:
    add_char(f"{cid}_acres", f"{raw_label} (Acres)", f"{short_label} (Acres)", "32-10-0309-01", CAT_CROPS, "Characteristic Distribution", "Field Crops by Acreage (Acres)", "Crop Share of Total Field Crop Area", "ACRES", "crop_total_acres", "Total area of field crops and hay in acres (32-10-0309-01)")
    add_char(f"{cid}_farms", f"{raw_label} (Farms reporting)", f"{short_label} (Farms)", "32-10-0309-01", CAT_CROPS, "Characteristic Distribution", "Field Crops by Farms Reporting", "Farms Reporting Crop", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")

# Category 6: Fruits, Vegetables, Greenhouse, Maple & Organic [32-10-0315, 0355, 0360, 0362, 0363]
CAT_HORT = "6. Horticulture, Greenhouse, Maple & Organic"
add_char("fruit_total_acres", "Total area of fruits, berries and nuts (Acres)", "Total Fruit Area (Acres)", "32-10-0315-01", CAT_HORT, "Aggregate Statistics", "Horticulture & Specialty Totals", "Specialty Totals", "ACRES", None, "Total area of fruits, berries and nuts (acres)", True, True, False)
add_char("veg_total_acres", "Total area of field vegetables (Acres)", "Total Field Vegetable Area (Acres)", "32-10-0355-01", CAT_HORT, "Aggregate Statistics", "Horticulture & Specialty Totals", "Specialty Totals", "ACRES", None, "Total area of field vegetables (acres)", True, True, False)
add_char("gh_total_sqft", "Total greenhouse area in use (Sq. Ft.)", "Total Greenhouse Area (Sq. Ft.)", "32-10-0360-01", CAT_HORT, "Aggregate Statistics", "Horticulture & Specialty Totals", "Specialty Totals", "SQFT", None, "Total greenhouse area in use (square feet)", True, True, False)
add_char("maple_total_taps", "Total taps on maple trees", "Total Maple Taps", "32-10-0362-01", CAT_HORT, "Aggregate Statistics", "Horticulture & Specialty Totals", "Specialty Totals", "TAPS", None, "Total number of taps on maple trees", True, True, False)

FRUITS_LIST = [
    ("fruit_apples_acres", "Apples", "Apples (Acres)"),
    ("fruit_grapes_acres", "Grapes", "Grapes (Acres)"),
    ("fruit_blueberries_acres", "Blueberries, total", "Blueberries (Acres)"),
    ("fruit_peaches_acres", "Peaches", "Peaches (Acres)"),
    ("fruit_strawberries_acres", "Strawberries", "Strawberries (Acres)"),
    ("fruit_cherries_sour_acres", "Cherries (sour)", "Sour Cherries (Acres)"),
    ("fruit_cherries_sweet_acres", "Cherries (sweet)", "Sweet Cherries (Acres)"),
    ("fruit_pears_acres", "Pears", "Pears (Acres)"),
    ("fruit_raspberries_acres", "Raspberries", "Raspberries (Acres)"),
    ("fruit_cranberries_acres", "Cranberries", "Cranberries (Acres)"),
]
for cid, raw_label, short_label in FRUITS_LIST:
    add_char(cid, f"Fruit Area: {raw_label} (Acres)", short_label, "32-10-0315-01", CAT_HORT, "Characteristic Distribution", "Fruits, Berries & Nuts (Acres)", "Fruit Acreage Breakdown", "ACRES", "fruit_total_acres", "Total area of fruits, berries and nuts in acres (32-10-0315-01)")

VEG_LIST = [
    ("veg_sweet_corn_acres", "Sweet corn", "Sweet Corn (Acres)"),
    ("veg_tomatoes_acres", "Tomatoes", "Tomatoes (Acres)"),
    ("veg_green_peas_acres", "Green peas", "Green Peas (Acres)"),
    ("veg_green_beans_acres", "Green and wax beans", "Green & Wax Beans (Acres)"),
    ("veg_carrots_acres", "Carrots", "Carrots (Acres)"),
    ("veg_onions_acres", "Onions, dry", "Dry Onions (Acres)"),
    ("veg_pumpkins_acres", "Pumpkins", "Pumpkins (Acres)"),
    ("veg_squash_acres", "Squash and zucchini", "Squash & Zucchini (Acres)"),
    ("veg_peppers_acres", "Peppers", "Peppers (Acres)"),
    ("veg_cabbage_acres", "Cabbage, regular", "Cabbage (Acres)"),
]
for cid, raw_label, short_label in VEG_LIST:
    add_char(cid, f"Field Vegetable Area: {raw_label} (Acres)", short_label, "32-10-0355-01", CAT_HORT, "Characteristic Distribution", "Field Vegetables (Acres)", "Vegetable Acreage Breakdown", "ACRES", "veg_total_acres", "Total area of field vegetables in acres (32-10-0355-01)")

ORGANIC_LIST = [
    ("org_total_farms", "Organic products for sale", "Total Organic Farms"),
    ("org_certified_farms", "Certified organic products for sale", "Certified Organic Farms"),
    ("org_transitional_farms", "Transitional organic products for sale", "Transitional Organic Farms"),
]
for cid, raw_label, short_label in ORGANIC_LIST:
    add_char(cid, raw_label, short_label, "32-10-0363-01", CAT_HORT, "Characteristic Distribution", "Organic & Maple Operations (Farms)", "Organic & Specialty Farms", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")
add_char("maple_farms", "Maple taps (Farms reporting)", "Farms Reporting Maple Taps", "32-10-0362-01", CAT_HORT, "Characteristic Distribution", "Organic & Maple Operations (Farms)", "Organic & Specialty Farms", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")

# Category 7: Livestock, Poultry & Apiculture [32-10-0370, 0371, 0372, 0373, 0374, 0378]
CAT_LIVE = "7. Livestock, Poultry & Apiculture"
add_char("cattle_total_head", "Total cattle and calves (Head)", "Total Cattle & Calves (Head)", "32-10-0370-01", CAT_LIVE, "Aggregate Statistics", "Livestock & Poultry Herd Sizes", "Total Inventories & Herd Averages", "HEAD", None, "Total cattle and calves inventory on farms", True, True, False)
add_char("pigs_total_head", "Total pigs inventory (Head)", "Total Pigs (Head)", "32-10-0372-01", CAT_LIVE, "Aggregate Statistics", "Livestock & Poultry Herd Sizes", "Total Inventories & Herd Averages", "HEAD", None, "Total pigs inventory on farms", True, True, False)
add_char("sheep_total_head", "Total sheep and lambs (Head)", "Total Sheep & Lambs (Head)", "32-10-0371-01", CAT_LIVE, "Aggregate Statistics", "Livestock & Poultry Herd Sizes", "Total Inventories & Herd Averages", "HEAD", None, "Total sheep and lambs inventory on farms", True, True, False)
add_char("horses_ponies_head", "Total horses and ponies (Head)", "Horses & Ponies (Head)", "32-10-0373-01", CAT_LIVE, "Aggregate Statistics", "Livestock & Poultry Herd Sizes", "Total Inventories & Herd Averages", "HEAD", None, "Total horses and ponies inventory on farms", True, True, False)
add_char("poultry_hens_chickens_birds", "Total hens and chickens (Birds)", "Total Hens & Chickens (Birds)", "32-10-0374-01", CAT_LIVE, "Aggregate Statistics", "Livestock & Poultry Herd Sizes", "Total Inventories & Herd Averages", "HEAD", None, "Total hens and chickens inventory on farms", True, True, False)
add_char("poultry_turkeys_birds", "Total turkeys inventory (Birds)", "Total Turkeys (Birds)", "32-10-0374-01", CAT_LIVE, "Aggregate Statistics", "Livestock & Poultry Herd Sizes", "Total Inventories & Herd Averages", "HEAD", None, "Total turkeys inventory on farms", True, True, False)
add_char("bees_colonies", "Honeybees, live colonies", "Honeybee Colonies", "32-10-0378-01", CAT_LIVE, "Aggregate Statistics", "Livestock & Poultry Herd Sizes", "Total Inventories & Herd Averages", "COLONIES", None, "Total live honeybee colonies", True, True, False)
add_char("avg_cattle_per_farm", "Average cattle per reporting farm (Head)", "Avg Cattle / Reporting Farm", "32-10-0370-01", CAT_LIVE, "Aggregate Statistics", "Livestock & Poultry Herd Sizes", "Total Inventories & Herd Averages", "HEAD", None, "Total cattle divided by farms reporting cattle", False, True, True)
add_char("avg_dairy_cows_per_farm", "Average dairy cows per reporting farm (Head)", "Avg Dairy Cows / Farm", "32-10-0370-01", CAT_LIVE, "Aggregate Statistics", "Livestock & Poultry Herd Sizes", "Total Inventories & Herd Averages", "HEAD", None, "Total dairy cows divided by farms reporting dairy cows", False, True, True)
add_char("avg_pigs_per_farm", "Average pigs per reporting farm (Head)", "Avg Pigs / Reporting Farm", "32-10-0372-01", CAT_LIVE, "Aggregate Statistics", "Livestock & Poultry Herd Sizes", "Total Inventories & Herd Averages", "HEAD", None, "Total pigs divided by farms reporting pigs", False, True, True)

CATTLE_TYPES = [
    ("cattle_dairy_cows", "Cows, dairy", "Dairy Cows"),
    ("cattle_beef_cows", "Cows, beef", "Beef Cows"),
    ("cattle_heifers_dairy", "Heifers, for dairy herd replacement", "Dairy Replacement Heifers"),
    ("cattle_heifers_beef", "Heifers, for beef herd replacement", "Beef Replacement Heifers"),
    ("cattle_heifers_slaughter", "Heifers, for slaughter or feeding", "Feeder / Slaughter Heifers"),
    ("cattle_steers", "Steers", "Steers (1 year and over)"),
    ("cattle_calves", "Calves (under 1 year)", "Calves (Under 1 year)"),
    ("cattle_bulls", "Bulls", "Bulls (1 year and over)"),
]
for cid, raw_label, short_label in CATTLE_TYPES:
    add_char(f"{cid}_head", f"Cattle Inventory: {raw_label} (Head)", f"{short_label} (Head)", "32-10-0370-01", CAT_LIVE, "Characteristic Distribution", "Cattle Herd Breakdown (Head)", "Cattle Class Share of Herd", "HEAD", "cattle_total_head", "Total cattle and calves inventory (32-10-0370-01)")
    add_char(f"{cid}_farms", f"Cattle Farms: {raw_label} (Farms)", f"{short_label} (Farms)", "32-10-0370-01", CAT_LIVE, "Characteristic Distribution", "Livestock & Poultry Farms Reporting", "Farms Reporting Livestock", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")

add_char("cattle_total_farms", "Total cattle (Farms reporting)", "All Cattle Farms", "32-10-0370-01", CAT_LIVE, "Characteristic Distribution", "Livestock & Poultry Farms Reporting", "Farms Reporting Livestock", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")
add_char("pigs_total_farms", "Total pigs (Farms reporting)", "Pig Farms", "32-10-0372-01", CAT_LIVE, "Characteristic Distribution", "Livestock & Poultry Farms Reporting", "Farms Reporting Livestock", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")
add_char("sheep_total_farms", "Total sheep (Farms reporting)", "Sheep Farms", "32-10-0371-01", CAT_LIVE, "Characteristic Distribution", "Livestock & Poultry Farms Reporting", "Farms Reporting Livestock", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")
add_char("horses_ponies_farms", "Horses and ponies (Farms reporting)", "Horse & Pony Farms", "32-10-0373-01", CAT_LIVE, "Characteristic Distribution", "Livestock & Poultry Farms Reporting", "Farms Reporting Livestock", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")
add_char("poultry_hens_chickens_farms", "Total hens and chickens (Farms reporting)", "Chicken & Hen Farms", "32-10-0374-01", CAT_LIVE, "Characteristic Distribution", "Livestock & Poultry Farms Reporting", "Farms Reporting Livestock", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")
add_char("poultry_turkeys_farms", "Turkeys (Farms reporting)", "Turkey Farms", "32-10-0374-01", CAT_LIVE, "Characteristic Distribution", "Livestock & Poultry Farms Reporting", "Farms Reporting Livestock", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")
add_char("bees_farms", "Honeybees (Farms reporting)", "Beekeeping Farms", "32-10-0378-01", CAT_LIVE, "Characteristic Distribution", "Livestock & Poultry Farms Reporting", "Farms Reporting Livestock", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")

# Category 8: Tillage, Land Inputs & Soil Conservation [32-10-0367, 0368, 0369]
CAT_BMP = "8. Tillage, Inputs & Soil Conservation"
add_char("tillage_prepared_acres", "Total land prepared for seeding (Acres)", "Total Prepared Seedbed (Acres)", "32-10-0367-01", CAT_BMP, "Aggregate Statistics", "Tillage & Stewardship Totals", "Prepared Seedbed Area", "ACRES", None, "Total land prepared for seeding (acres)", True, True, False)

TILLAGE_ACRES = [
    ("till_notill_acres", "No-till seeding or zero-till seeding", "No-Till / Zero-Till Seeding (Acres)"),
    ("till_conservation_acres", "Tillage retaining most crop residue on the surface", "Conservation Tillage (Acres)"),
    ("till_conventional_acres", "Tillage incorporating most crop residue into soil", "Conventional Tillage (Acres)"),
]
for cid, raw_label, short_label in TILLAGE_ACRES:
    add_char(cid, f"Tillage: {raw_label} (Acres)", short_label, "32-10-0367-01", CAT_BMP, "Characteristic Distribution", "Tillage Practices (Acres)", "Share of Prepared Seedbed", "ACRES", "tillage_prepared_acres", "Total land prepared for seeding in acres (32-10-0367-01)")

BMP_FARMS = [
    ("bmp_cover_crops_farms", "Planting winter cover crops", "Winter Cover Crops (Farms)", "32-10-0369-01"),
    ("bmp_windbreaks_farms", "Shelterbelts or windbreaks (natural or planted)", "Shelterbelts / Windbreaks (Farms)", "32-10-0369-01"),
    ("bmp_rotational_grazing_farms", "Rotational grazing", "Rotational Grazing (Farms)", "32-10-0369-01"),
    ("bmp_green_manure_farms", "Plowing down green crops", "Plowing Down Green Crops (Farms)", "32-10-0369-01"),
    ("bmp_winter_grazing_farms", "In-field winter grazing or feeding", "In-Field Winter Grazing (Farms)", "32-10-0369-01"),
    ("inp_fertilizer_farms", "Commercial fertilizer", "Commercial Fertilizer (Farms)", "32-10-0368-01"),
    ("inp_herbicides_farms", "Herbicides", "Herbicides (Farms)", "32-10-0368-01"),
    ("inp_manure_farms", "Manure applied", "Manure Applied (Farms)", "32-10-0368-01"),
    ("inp_irrigation_farms", "Irrigation", "Irrigation (Farms)", "32-10-0368-01"),
    ("inp_lime_farms", "Lime", "Lime Applied (Farms)", "32-10-0368-01"),
]
for cid, raw_label, short_label, tbl in BMP_FARMS:
    add_char(cid, f"Land Practice: {raw_label} (Farms)", short_label, tbl, CAT_BMP, "Characteristic Distribution", "Soil Conservation & Input Practices (Farms)", "Farms Adopting Practice", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")

# Category 9: Precision Ag Technologies & Renewable Energy [32-10-0379 & 32-10-0380]
CAT_TECH = "9. Precision Ag Tech & Renewable Energy"
TECH_ITEMS = [
    ("tech_autosteer", "Automated guidance steering systems (auto-steer)", "Auto-Steer Guidance Systems"),
    ("tech_gis", "Geographic Information System (GIS) mapping", "GIS Mapping"),
    ("tech_vra", "Variable-rate input application", "Variable-Rate Input Application"),
    ("tech_soil_test", "Soil sample test", "Soil Sample Testing"),
    ("tech_slow_fert", "Slow-release fertilizer", "Slow-Release Fertilizer"),
    ("tech_drones", "Drones", "Drones / UAVs"),
    ("tech_robotic_milker", "Fully-robotic milkers", "Fully-Robotic Milkers"),
    ("tech_robotic_gh", "Robotic greenhouse equipment", "Robotic Greenhouse Equipment"),
]
for cid, raw_label, short_label in TECH_ITEMS:
    add_char(cid, f"Technology: {raw_label}", short_label, "32-10-0379-01", CAT_TECH, "Characteristic Distribution", "Precision Agriculture Technologies", "Farms Using Technology", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")

ENERGY_ITEMS = [
    ("energy_total_farms", "Renewable energy production, total", "Any Renewable Energy System"),
    ("energy_solar_farms", "Renewable energy type, solar", "Solar Energy Systems"),
    ("energy_wind_farms", "Renewable energy type, wind", "Wind Turbines"),
    ("energy_bioenergy_farms", "Renewable energy type, bioenergy, total", "Bioenergy / Biogas / Biomass"),
    ("energy_geothermal_farms", "Renewable energy type, geothermal", "Geothermal Systems"),
    ("energy_for_use_farms", "Renewable energy production, for use on the operation", "Produced for On-Farm Use"),
    ("energy_for_sale_farms", "Renewable energy production, for sale", "Produced for Sale"),
]
for cid, raw_label, short_label in ENERGY_ITEMS:
    add_char(cid, f"Renewable Energy: {raw_label}", short_label, "32-10-0380-01", CAT_TECH, "Characteristic Distribution", "Renewable Energy Production", "Farms Producing Renewable Energy", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")

# Category 10: Operators, Succession, Direct Sales & Labour [32-10-0381, 0382, 0244, 0242, 0243]
CAT_OP = "10. Farm Operators, Succession & Labour"
add_char("op_total_operators", "Total number of farm operators", "Total Farm Operators", "32-10-0381-01", CAT_OP, "Aggregate Statistics", "Operator Demographics & Labour Averages", "Operator Counts & Ages", "WORKERS", None, "Total number of farm operators on all farms", True, True, False)
add_char("op_avg_age", "Average age of farm operators (Years)", "Avg Operator Age (Years)", "32-10-0381-01", CAT_OP, "Aggregate Statistics", "Operator Demographics & Labour Averages", "Operator Counts & Ages", "AGE", None, "Average age of farm operators across all farms", False, True, True)
add_char("op_median_age", "Median age of farm operators (Years)", "Median Operator Age (Years)", "32-10-0381-01", CAT_OP, "Aggregate Statistics", "Operator Demographics & Labour Averages", "Operator Counts & Ages", "AGE", None, "Median age of farm operators across all farms", False, True, True)
add_char("labour_total_workers", "Total paid agricultural workers", "Total Paid Ag Workers", "32-10-0243-01", CAT_OP, "Aggregate Statistics", "Operator Demographics & Labour Averages", "Operator Counts & Ages", "WORKERS", None, "Total paid agricultural workers (year-round and seasonal)", True, True, False)

OP_DEMO = [
    ("op_age_under_35", "Age - under 35 years", "Operators Under 35 Years", "Operators by Age Group"),
    ("op_age_35_54", "Age - 35 to 54 years", "Operators 35 to 54 Years", "Operators by Age Group"),
    ("op_age_55_plus", "Age - 55 years and over", "Operators 55 Years & Over", "Operators by Age Group"),
    ("op_sex_male", "Sex - male", "Male Operators", "Operators by Sex"),
    ("op_sex_female", "Sex - female", "Female Operators", "Operators by Sex"),
]
for cid, raw_label, short_label, subl in OP_DEMO:
    add_char(cid, f"Operators: {raw_label}", short_label, "32-10-0381-01", CAT_OP, "Characteristic Distribution", subl, "Share of Total Farm Operators", "WORKERS", "op_total_operators", "Total number of farm operators (32-10-0381-01)")

SUCCESSION_ITEMS = [
    ("succ_written", "Written succession plan", "Written Succession Plan (Total)"),
    ("succ_family", "Includes 1 or more family members", "Written Plan: Family Successor"),
    ("succ_nonfamily", "Includes 1 or more non-family members", "Written Plan: Non-Family Successor"),
    ("succ_verbal", "Verbal succession plan only", "Verbal Succession Plan Only"),
    ("succ_none", "No succession plan", "No Succession Plan"),
]
for cid, raw_label, short_label in SUCCESSION_ITEMS:
    add_char(cid, f"Succession Planning: {raw_label}", short_label, "32-10-0244-01", CAT_OP, "Characteristic Distribution", "Succession Planning (Farms)", "Share of Total Census Farms", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")

DIRECT_SALES_ITEMS = [
    ("ds_total_farms", "Total number of farms reporting direct sales", "Any Direct-to-Consumer Sales"),
    ("ds_farm_gate", "Method - On-site farm stores, stands, kiosks, U-pick or farm gate sales", "Farm Gate, Stands, Kiosks & U-Pick"),
    ("ds_farmers_market", "Method - Farmers' markets", "Farmers' Markets"),
    ("ds_direct_delivery", "Method - Direct deliveries to consumers", "Direct Deliveries to Consumers"),
    ("ds_offsite_store", "Method - Off-site farm stores or stands", "Off-Site Farm Stores / Stands"),
    ("ds_csa", "Method - Community Supported Agriculture (CSA)", "Community Supported Agriculture (CSA)"),
    ("ds_value_added", "Type - Value-added products", "Direct Sales of Value-Added Products"),
]
for cid, raw_label, short_label in DIRECT_SALES_ITEMS:
    add_char(cid, f"Direct Sales: {raw_label}", short_label, "32-10-0242-01", CAT_OP, "Characteristic Distribution", "Direct Sales to Consumers (Farms)", "Share of Total Census Farms", "FARMS", "total_farms", "Total number of census farms (32-10-0231-01)")

LABOUR_ITEMS = [
    ("lab_farms_reporting", "Paid labour (Farms reporting)", "Farms Reporting Paid Labour", "total_farms", "FARMS"),
    ("lab_fulltime_workers", "Full-time workers (year-round)", "Full-Time Year-Round Workers", "labour_total_workers", "WORKERS"),
    ("lab_parttime_workers", "Part-time workers (year-round)", "Part-Time Year-Round Workers", "labour_total_workers", "WORKERS"),
    ("lab_seasonal_workers", "Seasonal or temporary workers", "Seasonal / Temporary Workers", "labour_total_workers", "WORKERS"),
]
for cid, raw_label, short_label, base_ref, u in LABOUR_ITEMS:
    add_char(cid, f"Paid Labour: {raw_label}", short_label, "32-10-0243-01", CAT_OP, "Characteristic Distribution", "Paid Agricultural Labour", "Paid Workers Breakdown", u, base_ref, "Reference total (32-10-0243-01)")

print(f"Configured {len(characteristics)} empirical Census of Agriculture characteristics.")

# 4. Initialize values dictionary: values[dguid][char_id] = [val2021, val2016, statusFlag]
values = defaultdict(dict)

def set_val(dguid, cid, val2021=None, val2016=None, status=None):
    if dguid not in geo_nodes:
        return
    cur = values[dguid].get(cid, [None, None, None])
    if val2021 is not None:
        cur[0] = val2021
    if val2016 is not None:
        cur[1] = val2016
    if status is not None and cur[0] is None:
        cur[2] = status
    values[dguid][cid] = cur

def parse_num(v_str, status_str):
    st = (status_str or "").strip()
    if v_str is None or v_str == "":
        if st in ("x", "F", "E"):
            return None, st
        if st in ("..", "...") or st == "":
            return None, "NA"
        return None, st
    try:
        v = float(v_str)
        if v.is_integer():
            v = int(v)
        else:
            v = round(v, 2)
        return v, None
    except ValueError:
        return None, st if st in ("x", "F", "E") else "NA"

# Helper to load a single-dimension 2021 cube
def load_1d_cube(pid, dim_col, mapping_dict, is_2016=False, filter_year="2021"):
    path = f"{CUBES_DIR}/{pid}.csv"
    if not os.path.exists(path):
        print(f"WARNING: Missing {path}")
        return
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["REF_DATE"] != filter_year:
                continue
            member = row[dim_col]
            if member not in mapping_dict:
                continue
            cid = mapping_dict[member]
            raw_dguid = row["DGUID"]
            dguid = raw_dguid if raw_dguid in geo_nodes else dguid_suffix_to_geoid.get(raw_dguid[4:])
            if not dguid:
                continue
            val, st = parse_num(row["VALUE"], row["STATUS"])
            if is_2016:
                set_val(dguid, cid, val2016=val)
            else:
                set_val(dguid, cid, val2021=val, status=st)

# Helper to load a 2-dimension cube (e.g. item + Unit of measure)
def load_2d_cube(pid, dim1_col, dim2_col, mapping_dict, is_2016=False, filter_year="2021"):
    path = f"{CUBES_DIR}/{pid}.csv"
    if not os.path.exists(path):
        print(f"WARNING: Missing {path}")
        return
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["REF_DATE"] != filter_year:
                continue
            key = (row[dim1_col], row[dim2_col])
            if key not in mapping_dict:
                continue
            cid = mapping_dict[key]
            raw_dguid = row["DGUID"]
            dguid = raw_dguid if raw_dguid in geo_nodes else dguid_suffix_to_geoid.get(raw_dguid[4:])
            if not dguid:
                continue
            val, st = parse_num(row["VALUE"], row["STATUS"])
            if is_2016:
                set_val(dguid, cid, val2016=val)
            else:
                set_val(dguid, cid, val2021=val, status=st)

# Load 32100231 (NAICS 2021) & 32100403 (NAICS 2016)
naics_map = {"Total number of farms": "total_farms"}
for cid, raw_label, _, _ in NAICS_ITEMS:
    naics_map[raw_label] = cid
print("Loading 32100231 (2021 NAICS) & 32100403 (2016 NAICS)...")
load_1d_cube(32100231, "North American Industry Classification System (NAICS)", naics_map)
load_1d_cube(32100403, "North American Industry Classification System (NAICS)", naics_map, is_2016=True, filter_year="2016")

# Load 32100249 (Land use 2021) & 32100406 (Land use 2016)
land_map = {("Total farm area", "Acres"): "land_total_acres"}
for cid, raw_label, _ in LAND_USE_ACRES:
    land_map[(raw_label, "Acres")] = cid
print("Loading 32100249 (2021 Land Use) & 32100406 (2016 Land Use)...")
load_2d_cube(32100249, "Land use", "Unit of measure", land_map)
load_2d_cube(32100406, "Land use", "Unit of measure", land_map, is_2016=True, filter_year="2016")

# Load 32100232 (Farm size classes 2021)
size_map = {raw_label: cid for cid, raw_label, _ in FARM_SIZE_CLASSES}
print("Loading 32100232 (Farm Size Classes)...")
load_1d_cube(32100232, "Total farm area distribution", size_map)

# Load 32100234 (Land tenure 2021) & 32100407 (Land tenure 2016)
tenure_map = {(raw_label, "Acres"): cid for cid, raw_label, _ in TENURE_ACRES}
tenure_map[("Total farm area", "Acres")] = "land_total_acres"
print("Loading 32100234 (2021 Tenure) & 32100407 (2016 Tenure)...")
load_2d_cube(32100234, "Land tenure", "Unit of measure", tenure_map)
load_2d_cube(32100407, "Land tenure", "Unit of measure", {
    ("Area owned", "Acres"): "tenure_owned_acres",
    ("Area rented or leased from others", "Acres"): "tenure_rented_acres",
    ("Area leased from governments", "Acres"): "tenure_govt_leased_acres",
    ("Area crop-shared from others", "Acres"): "tenure_cropshare_acres",
    ("Total farm area", "Acres"): "land_total_acres",
}, is_2016=True, filter_year="2016")

# Load 32100235 (Operating arrangements 2021)
op_arr_map = {raw_label: cid for cid, raw_label, _ in OP_ARRANGEMENTS}
print("Loading 32100235 (Operating Arrangements)...")
load_1d_cube(32100235, "Operating arrangement", op_arr_map)

# Load 32100237 (Farm capital $ 2021) & 32100437 (Farm capital $ 2016)
cap_map = {("Total farm capital", "Market value in dollars"): "cap_total_dollars"}
for cid, raw_label, _ in CAP_BREAKDOWN:
    cap_map[(raw_label, "Market value in dollars")] = cid
print("Loading 32100237 (2021 Farm Capital) & 32100437 (2016 Farm Capital)...")
load_2d_cube(32100237, "Farm capital", "Unit of measure", cap_map)
load_2d_cube(32100437, "Farm capital", "Unit of measure", {
    ("Total farm capital", "Market value in dollars"): "cap_total_dollars",
    ("Total value of land and buildings", "Market value in dollars"): "cap_land_bldg_total",
    ("Value of land and buildings, owned", "Market value in dollars"): "cap_land_bldg_owned",
    ("Value of land and buildings, rented or leased from others", "Market value in dollars"): "cap_land_bldg_rented",
    ("Value of all farm machinery and equipment", "Market value in dollars"): "cap_machinery",
    ("Value of livestock and poultry", "Market value in dollars"): "cap_livestock",
}, is_2016=True, filter_year="2016")

# Load 32100236 (Capital classes 2021) & 32100239 (Revenue classes 2021)
cap_cls_map = {raw_label: cid for cid, raw_label, _ in CAP_CLASSES}
rev_cls_map = {raw_label: cid for cid, raw_label, _ in REV_CLASSES}
print("Loading 32100236 (Capital Classes) & 32100239 (Revenue Classes)...")
load_1d_cube(32100236, "Total farm capital distribution", cap_cls_map)
load_1d_cube(32100239, "Total farm revenues distribution", rev_cls_map)

# Load 32100240 (Operating revenues 2021), 32100436 (Gross receipts 2016), 32100241 (Operating expenses 2021), 32100438 (Expenses 2016)
print("Loading 32100240/0241 (2021 Revenues & Expenses) & 32100436/0438 (2016 Revenues & Expenses)...")
load_1d_cube(32100240, "Total operating revenues, excluding forest products", {"Dollars": "rev_total_dollars"})
load_1d_cube(32100436, "Farms classified by total gross farm receipts", {"Total gross farm receipts (excluding forest products sold)": "rev_total_dollars"}, is_2016=True, filter_year="2016")
load_1d_cube(32100241, "Total farm operating expenses", {"Dollars": "exp_total_dollars"})
load_2d_cube(32100438, "Operating expenses", "Unit of measure", {("Total farm business operating expenses", "Dollars"): "exp_total_dollars"}, is_2016=True, filter_year="2016")

# Load 32100309 (Field crops and hay 2021)
crop_map = {("Total area of field crops and hay", "Acres"): "crop_total_acres"}
for cid, raw_label, _ in FIELD_CROPS:
    crop_map[(raw_label, "Acres")] = f"{cid}_acres"
    crop_map[(raw_label, "Number of farms reporting")] = f"{cid}_farms"
print("Loading 32100309 (Field Crops & Hay)...")
load_2d_cube(32100309, "Field crops and hay", "Unit of measure", crop_map)

# Load 32100315 (Fruits 2021), 32100355 (Vegetables 2021), 32100360 (Greenhouse 2021), 32100362 (Maple 2021), 32100363 (Organic 2021)
fruit_map = {("Total area of fruits", "Acres"): "fruit_total_acres"}
for cid, raw_label, _ in FRUITS_LIST:
    fruit_map[(raw_label, "Acres")] = cid
veg_map = {("Total area of field vegetables", "Acres"): "veg_total_acres"}
for cid, raw_label, _ in VEG_LIST:
    veg_map[(raw_label, "Acres")] = cid
print("Loading 32100315 (Fruits), 32100355 (Vegetables), 32100360 (Greenhouse), 32100362 (Maple), 32100363 (Organic)...")
load_2d_cube(32100315, "Fruits", "Unit of measure", fruit_map)
load_2d_cube(32100355, "Field vegetables", "Unit of measure", veg_map)
load_2d_cube(32100360, "Greenhouse products", "Unit of measure", {("Total greenhouse area in use", "Square feet"): "gh_total_sqft"})
load_1d_cube(32100362, "Taps on maple trees", {"Number of taps": "maple_total_taps", "Number of farms reporting": "maple_farms"})
load_1d_cube(32100363, "Organic products for sale", {raw_label: cid for cid, raw_label, _ in ORGANIC_LIST})

# Load 32100370 (Cattle), 32100371 (Sheep), 32100372 (Pigs), 32100373 (Equine), 32100374 (Poultry), 32100378 (Bees)
cattle_map = {
    ("Total cattle", "Number of animals"): "cattle_total_head",
    ("Total cattle", "Number of farms reporting"): "cattle_total_farms",
}
for cid, raw_label, _ in CATTLE_TYPES:
    cattle_map[(raw_label, "Number of animals")] = f"{cid}_head"
    cattle_map[(raw_label, "Number of farms reporting")] = f"{cid}_farms"
print("Loading 32100370 (Cattle), 32100371 (Sheep), 32100372 (Pigs), 32100373 (Equine), 32100374 (Poultry), 32100378 (Bees)...")
load_2d_cube(32100370, "Cattle", "Unit of measure", cattle_map)
load_2d_cube(32100371, "Sheep", "Unit of measure", {
    ("Total sheep", "Number of animals"): "sheep_total_head",
    ("Total sheep", "Number of farms reporting"): "sheep_total_farms",
})
load_2d_cube(32100372, "Pigs", "Unit of measure", {
    ("Total pigs", "Number of animals"): "pigs_total_head",
    ("Total pigs", "Number of farms reporting"): "pigs_total_farms",
})
load_2d_cube(32100373, "Other livestock", "Unit of measure", {
    ("Horses and ponies", "Number of animals"): "horses_ponies_head",
    ("Horses and ponies", "Number of farms reporting"): "horses_ponies_farms",
})
load_2d_cube(32100374, "Poultry inventory", "Unit of measure", {
    ("Total hens and chickens", "Number of birds"): "poultry_hens_chickens_birds",
    ("Total hens and chickens", "Number of farms reporting"): "poultry_hens_chickens_farms",
    ("Turkeys", "Number of birds"): "poultry_turkeys_birds",
    ("Turkeys", "Number of farms reporting"): "poultry_turkeys_farms",
})
load_2d_cube(32100378, "Bees", "Unit of measure", {
    ("Honeybees, live colonies", "Number"): "bees_colonies",
    ("Honeybees, live colonies", "Number of farms reporting"): "bees_farms",
})

# Load 32100367 (Tillage), 32100368 (Inputs/Irrigation), 32100369 (Land practices)
till_map = {("Total land prepared for seeding", "Acres"): "tillage_prepared_acres"}
for cid, raw_label, _ in TILLAGE_ACRES:
    till_map[(raw_label, "Acres")] = cid
print("Loading 32100367 (Tillage), 32100368 (Inputs), 32100369 (BMPs)...")
load_2d_cube(32100367, "Tillage practices", "Unit of measure", till_map)
load_2d_cube(32100368, "Land inputs, manure and irrigation", "Unit of measure", {
    ("Commercial fertilizer", "Number of farms reporting"): "inp_fertilizer_farms",
    ("Herbicides", "Number of farms reporting"): "inp_herbicides_farms",
    ("Manure applied", "Number of farms reporting"): "inp_manure_farms",
    ("Irrigation", "Number of farms reporting"): "inp_irrigation_farms",
    ("Lime", "Number of farms reporting"): "inp_lime_farms",
})
load_1d_cube(32100369, "Land practices and land features", {
    "Planting winter cover crops": "bmp_cover_crops_farms",
    "Shelterbelts or windbreaks (natural or planted)": "bmp_windbreaks_farms",
    "Rotational grazing": "bmp_rotational_grazing_farms",
    "Plowing down green crops": "bmp_green_manure_farms",
    "In-field winter grazing or feeding": "bmp_winter_grazing_farms",
})

# Load 32100379 (Technologies) & 32100380 (Renewable energy)
print("Loading 32100379 (Technologies) & 32100380 (Renewable Energy)...")
load_1d_cube(32100379, "Technologies", {raw_label: cid for cid, raw_label, _ in TECH_ITEMS})
load_1d_cube(32100380, "Renewable energy production", {raw_label: cid for cid, raw_label, _ in ENERGY_ITEMS})

# Load 32100381 (Operators 2021) & 32100440 (Operators 2016)
op_map = {
    ("All farms", "Total number of farm operators"): "op_total_operators",
    ("All farms", "Age - average"): "op_avg_age",
    ("All farms", "Age - median"): "op_median_age",
}
for cid, raw_label, _, _ in OP_DEMO:
    op_map[("All farms", raw_label)] = cid
print("Loading 32100381 (Operators 2021) & 32100440 (Operators 2016)...")
load_2d_cube(32100381, "Farms according to the number of operators reported", "Characteristics", op_map)
load_1d_cube(32100440, "Number of farms and operators", {"Farms": "total_farms", "Operators": "op_total_operators"}, is_2016=True, filter_year="2016")

# Load 32100244 (Succession), 32100242 (Direct sales), 32100243 (Paid labour)
print("Loading 32100244 (Succession), 32100242 (Direct Sales), 32100243 (Paid Labour)...")
load_1d_cube(32100244, "Succession plan", {raw_label: cid for cid, raw_label, _ in SUCCESSION_ITEMS})
load_1d_cube(32100242, "Direct sales", {raw_label: cid for cid, raw_label, _ in DIRECT_SALES_ITEMS})
load_2d_cube(32100243, "Paid agricultural workers", "Unit of measure", {
    ("Agricultural workers, total", "Number"): "labour_total_workers",
    ("Agricultural workers, total", "Number of farms reporting"): "lab_farms_reporting",
    ("Full-time workers (year-round)", "Number"): "lab_fulltime_workers",
    ("Part-time workers (year-round)", "Number"): "lab_parttime_workers",
    ("Seasonal or temporary workers", "Number"): "lab_seasonal_workers",
})

# 5. Compute Derived Aggregate Statistics (from exact StatCan numerators & denominators)
print("Computing derived Aggregate Statistics (averages, $/acre, margins, $500k+ commercial farms)...")
for dguid in geo_nodes:
    gvals = values[dguid]
    def g21(cid):
        return gvals.get(cid, [None, None, None])[0]
    def g16(cid):
        return gvals.get(cid, [None, None, None])[1]
    def gst(cid):
        return gvals.get(cid, [None, None, None])[2]

    farms21, farms16 = g21("total_farms"), g16("total_farms")
    area21, area16 = g21("land_total_acres"), g16("land_total_acres")
    crops21, crops16 = g21("land_crops_acres"), g16("land_crops_acres")
    cap21, cap16 = g21("cap_total_dollars"), g16("cap_total_dollars")
    lb21, lb16 = g21("cap_land_bldg_total"), g16("cap_land_bldg_total")
    rev21, rev16 = g21("rev_total_dollars"), g16("rev_total_dollars")
    exp21, exp16 = g21("exp_total_dollars"), g16("exp_total_dollars")

    # Derived commercial scale revenue class ($500,000 and over = $500k-$999k + $1M-$1.99M + $2M+)
    r500, r1m, r2m = g21("rev_500k_1m"), g21("rev_1m_2m"), g21("rev_2m_plus")
    if r500 is not None and r1m is not None and r2m is not None:
        set_val(dguid, "rev_500k_plus", r500 + r1m + r2m)
    elif farms21 and farms21 > 0:
        for rc_id in ("rev_500k_1m", "rev_1m_2m", "rev_2m_plus"):
            if gst(rc_id) in ("x", "F"):
                set_val(dguid, "rev_500k_plus", status=gst(rc_id))
                break

    # Avg farm size (acres)
    if farms21 and farms21 > 0:
        if area21 is not None:
            v21 = round(area21 / farms21, 1)
            v16 = round(area16 / farms16, 1) if (farms16 and area16 is not None and farms16 > 0) else None
            set_val(dguid, "avg_farm_size_acres", v21, v16)
        elif gst("land_total_acres") in ("x", "F"):
            v16 = round(area16 / farms16, 1) if (farms16 and area16 is not None and farms16 > 0) else None
            set_val(dguid, "avg_farm_size_acres", None, v16, status=gst("land_total_acres"))

    # Avg cropland per farm (acres)
    if farms21 and farms21 > 0:
        if crops21 is not None:
            v21 = round(crops21 / farms21, 1)
            v16 = round(crops16 / farms16, 1) if (farms16 and crops16 is not None and farms16 > 0) else None
            set_val(dguid, "avg_cropland_per_farm", v21, v16)
        elif gst("land_crops_acres") in ("x", "F"):
            v16 = round(crops16 / farms16, 1) if (farms16 and crops16 is not None and farms16 > 0) else None
            set_val(dguid, "avg_cropland_per_farm", None, v16, status=gst("land_crops_acres"))

    # Avg farm capital per farm ($)
    if farms21 and farms21 > 0:
        if cap21 is not None:
            v21 = round(cap21 / farms21)
            v16 = round(cap16 / farms16) if (farms16 and cap16 is not None and farms16 > 0) else None
            set_val(dguid, "avg_capital_per_farm", v21, v16)
        elif gst("cap_total_dollars") in ("x", "F"):
            v16 = round(cap16 / farms16) if (farms16 and cap16 is not None and farms16 > 0) else None
            set_val(dguid, "avg_capital_per_farm", None, v16, status=gst("cap_total_dollars"))

    # Land & Building value per acre ($/acre)
    if area21 and area21 > 0:
        if lb21 is not None:
            v21 = round(lb21 / area21)
            v16 = round(lb16 / area16) if (area16 and lb16 is not None and area16 > 0) else None
            set_val(dguid, "land_bldg_value_per_acre", v21, v16)
        elif gst("cap_land_bldg_total") in ("x", "F"):
            v16 = round(lb16 / area16) if (area16 and lb16 is not None and area16 > 0) else None
            set_val(dguid, "land_bldg_value_per_acre", None, v16, status=gst("cap_land_bldg_total"))

    # Avg revenue, expenses, net income, margin
    if farms21 and farms21 > 0:
        if rev21 is not None:
            r21 = round(rev21 / farms21)
            r16 = round(rev16 / farms16) if (farms16 and rev16 is not None and farms16 > 0) else None
            set_val(dguid, "avg_rev_per_farm", r21, r16)
        elif gst("rev_total_dollars") in ("x", "F"):
            r16 = round(rev16 / farms16) if (farms16 and rev16 is not None and farms16 > 0) else None
            set_val(dguid, "avg_rev_per_farm", None, r16, status=gst("rev_total_dollars"))

        if exp21 is not None:
            e21 = round(exp21 / farms21)
            e16 = round(exp16 / farms16) if (farms16 and exp16 is not None and farms16 > 0) else None
            set_val(dguid, "avg_exp_per_farm", e21, e16)
        elif gst("exp_total_dollars") in ("x", "F"):
            e16 = round(exp16 / farms16) if (farms16 and exp16 is not None and farms16 > 0) else None
            set_val(dguid, "avg_exp_per_farm", None, e16, status=gst("exp_total_dollars"))

        if rev21 is not None and exp21 is not None:
            net21 = round((rev21 - exp21) / farms21)
            net16 = round((rev16 - exp16) / farms16) if (farms16 and rev16 is not None and exp16 is not None and farms16 > 0) else None
            set_val(dguid, "avg_net_income_per_farm", net21, net16)
        else:
            fin_st = "x" if "x" in (gst("rev_total_dollars"), gst("exp_total_dollars")) else ("F" if "F" in (gst("rev_total_dollars"), gst("exp_total_dollars")) else None)
            if fin_st:
                net16 = round((rev16 - exp16) / farms16) if (farms16 and rev16 is not None and exp16 is not None and farms16 > 0) else None
                set_val(dguid, "avg_net_income_per_farm", None, net16, status=fin_st)

    if rev21 and exp21 is not None and rev21 > 0:
        m21 = round(((rev21 - exp21) / rev21) * 100.0, 1)
        m16 = round(((rev16 - exp16) / rev16) * 100.0, 1) if (rev16 and exp16 is not None and rev16 > 0) else None
        set_val(dguid, "net_operating_margin_pct", m21, m16)
    elif farms21 and farms21 > 0:
        fin_st = "x" if "x" in (gst("rev_total_dollars"), gst("exp_total_dollars")) else ("F" if "F" in (gst("rev_total_dollars"), gst("exp_total_dollars")) else None)
        if fin_st:
            m16 = round(((rev16 - exp16) / rev16) * 100.0, 1) if (rev16 and exp16 is not None and rev16 > 0) else None
            set_val(dguid, "net_operating_margin_pct", None, m16, status=fin_st)

    # Avg herd sizes (strictly undefined / NA when 0 farms report; inherit x/F only when >0 farms report)
    cattle_h, cattle_f = g21("cattle_total_head"), g21("cattle_total_farms")
    if cattle_f and cattle_f > 0:
        if cattle_h is not None:
            set_val(dguid, "avg_cattle_per_farm", round(cattle_h / cattle_f, 1))
        elif gst("cattle_total_head") in ("x", "F"):
            set_val(dguid, "avg_cattle_per_farm", status=gst("cattle_total_head"))

    dairy_h, dairy_f = g21("cattle_dairy_cows_head"), g21("cattle_dairy_cows_farms")
    if dairy_f and dairy_f > 0:
        if dairy_h is not None:
            set_val(dguid, "avg_dairy_cows_per_farm", round(dairy_h / dairy_f, 1))
        elif gst("cattle_dairy_cows_head") in ("x", "F"):
            set_val(dguid, "avg_dairy_cows_per_farm", status=gst("cattle_dairy_cows_head"))

    pigs_h, pigs_f = g21("pigs_total_head"), g21("pigs_total_farms")
    if pigs_f and pigs_f > 0:
        if pigs_h is not None:
            set_val(dguid, "avg_pigs_per_farm", round(pigs_h / pigs_f, 1))
        elif gst("pigs_total_head") in ("x", "F"):
            set_val(dguid, "avg_pigs_per_farm", status=gst("pigs_total_head"))

# 6. Build Multi-Census Historical Series (1976-2021) from 32100153, 32100164, 32100166, 32100230
print("Building historical multi-census time-series (1976-2021)...")
HIST_YEARS = ["1976", "1981", "1986", "1991", "1996", "2001", "2006", "2011", "2016", "2021"]
hist_by_geo_year = defaultdict(lambda: defaultdict(dict))

# 32100153: Land use historical (Total area of farms, Land in crops, Number of farms reporting, Average area in acres)
with open(f"{CUBES_DIR}/32100153.csv", "r", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        yr = row["REF_DATE"]
        if yr not in HIST_YEARS:
            continue
        raw_dguid = row["DGUID"]
        dguid = raw_dguid if raw_dguid in geo_nodes else dguid_suffix_to_geoid.get(raw_dguid[4:]) if raw_dguid else None
        if not dguid:
            continue
        val, _ = parse_num(row["VALUE"], row["STATUS"])
        if val is None:
            continue
        lu = row["Land use"]
        uom = row["Unit of measure"]
        if lu == "Total area of farms" and uom == "Number of farms reporting":
            hist_by_geo_year[dguid][int(yr)]["farms"] = val
        elif lu == "Total area of farms" and uom == "Acres":
            hist_by_geo_year[dguid][int(yr)]["areaAcres"] = val
        elif lu == "Total area of farms" and uom == "Average area in acres":
            hist_by_geo_year[dguid][int(yr)]["avgFarmAcres"] = val
        elif lu == "Land in crops" and uom == "Acres":
            hist_by_geo_year[dguid][int(yr)]["croplandAcres"] = val

# 32100164: Farm capital, operating revenues and expenses historical
with open(f"{CUBES_DIR}/32100164.csv", "r", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        yr = row["REF_DATE"]
        if yr not in HIST_YEARS or row["Unit of measure"] != "Dollars":
            continue
        raw_dguid = row["DGUID"]
        dguid = raw_dguid if raw_dguid in geo_nodes else dguid_suffix_to_geoid.get(raw_dguid[4:]) if raw_dguid else None
        if not dguid:
            continue
        val, _ = parse_num(row["VALUE"], row["STATUS"])
        if val is None:
            continue
        item = row["Farm capital, operating revenues and selected expenses"]
        if item == "Total farm capital":
            hist_by_geo_year[dguid][int(yr)]["capitalDollars"] = val
        elif item == "Total operating revenues, excluding forest products":
            hist_by_geo_year[dguid][int(yr)]["revenuesDollars"] = val
        elif item == "Total farm operating expenses":
            hist_by_geo_year[dguid][int(yr)]["expensesDollars"] = val

# 32100230: Characteristics of farm operators historical
with open(f"{CUBES_DIR}/32100230.csv", "r", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        yr = row["REF_DATE"]
        if yr not in HIST_YEARS:
            continue
        raw_dguid = row["DGUID"]
        dguid = raw_dguid if raw_dguid in geo_nodes else dguid_suffix_to_geoid.get(raw_dguid[4:]) if raw_dguid else None
        if not dguid:
            continue
        val, _ = parse_num(row["VALUE"], row["STATUS"])
        if val is not None and row["Characteristics of farm operators"] == "Average age of farm operators":
            hist_by_geo_year[dguid][int(yr)]["avgOperatorAge"] = val

# Also populate 2016 and 2021 points for all CAR, CD, and CCS geographies from values[dguid]
for dguid, gvals in values.items():
    for yr_idx, yr in [(1, 2016), (0, 2021)]:
        pt = hist_by_geo_year[dguid][yr]
        if "farms" not in pt and gvals.get("total_farms", [None, None])[yr_idx] is not None:
            pt["farms"] = gvals["total_farms"][yr_idx]
        if "areaAcres" not in pt and gvals.get("land_total_acres", [None, None])[yr_idx] is not None:
            pt["areaAcres"] = gvals["land_total_acres"][yr_idx]
        if "croplandAcres" not in pt and gvals.get("land_crops_acres", [None, None])[yr_idx] is not None:
            pt["croplandAcres"] = gvals["land_crops_acres"][yr_idx]
        if "capitalDollars" not in pt and gvals.get("cap_total_dollars", [None, None])[yr_idx] is not None:
            pt["capitalDollars"] = gvals["cap_total_dollars"][yr_idx]
        if "revenuesDollars" not in pt and gvals.get("rev_total_dollars", [None, None])[yr_idx] is not None:
            pt["revenuesDollars"] = gvals["rev_total_dollars"][yr_idx]
        if "expensesDollars" not in pt and gvals.get("exp_total_dollars", [None, None])[yr_idx] is not None:
            pt["expensesDollars"] = gvals["exp_total_dollars"][yr_idx]
        if "avgFarmAcres" not in pt and gvals.get("avg_farm_size_acres", [None, None])[yr_idx] is not None:
            pt["avgFarmAcres"] = gvals["avg_farm_size_acres"][yr_idx]

historical_out = {}
for dguid, yr_dict in hist_by_geo_year.items():
    pts = []
    for yr in sorted(yr_dict.keys()):
        d = yr_dict[yr]
        if d:
            pts.append({"year": yr, **d})
    if pts:
        historical_out[dguid] = pts

# 7. Extract Empirical Ag-Population Linkage Cross-Tabulations (32100401 & 32100399)
print("Loading empirical cross-tabulations (32100401 Farm Type x Household Income & 32100399 Farm Type x Education)...")
empirical_crosstabs = defaultdict(dict)
with open(f"{CUBES_DIR}/32100401.csv", "r", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        raw_dguid = row["DGUID"]
        dguid = raw_dguid if raw_dguid in geo_nodes else dguid_suffix_to_geoid.get(raw_dguid[4:]) if raw_dguid else None
        if not dguid:
            continue
        ft = row["Farm type"]
        inc = row["Household income"]
        val, _ = parse_num(row["VALUE"], row["STATUS"])
        if val is not None:
            empirical_crosstabs[dguid][f"INC|{ft}|{inc}"] = val

with open(f"{CUBES_DIR}/32100399.csv", "r", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        raw_dguid = row["DGUID"]
        dguid = raw_dguid if raw_dguid in geo_nodes else dguid_suffix_to_geoid.get(raw_dguid[4:]) if raw_dguid else None
        if not dguid:
            continue
        ft = row["Farm type"]
        edu = row["Educational attainment"]
        val, _ = parse_num(row["VALUE"], row["STATUS"])
        if val is not None:
            empirical_crosstabs[dguid][f"EDU|{ft}|{edu}"] = val

# Lossless compact reproducible serialization across all (dguid, char_id) pairs:
# - [v21] when v21 is present and v16 is None
# - [v21, v16] when v21 and v16 are present
# - omit when v21 is None, v16 is None, and status == 'F' (saves ~2.1 MB across 61k 'F' cells)
# - [None, v16] when v21 is None, v16 is present, and status == 'F'
# - [None, v16, 'x'] when v21 is None due to StatCan confidentiality suppression ('x')
# - [None, v16, 'NA'] when v21 is None due to 0-denominator / not-applicable (e.g., 0 reporting farms)
all_char_ids = [c["id"] for c in characteristics]
compact_values = {}
for dguid in geo_nodes:
    gvals = values.get(dguid, {})
    g_out = {}
    for cid in all_char_ids:
        tup = gvals.get(cid)
        if tup is None:
            # Never populated -> 0-denominator average or not applicable ('NA')
            g_out[cid] = [None, None, "NA"]
            continue
        v21, v16, st = tup[0], tup[1], tup[2]
        if v21 is not None:
            g_out[cid] = [v21, v16] if v16 is not None else [v21]
        elif st == "F":
            if v16 is not None:
                g_out[cid] = [None, v16]
            # else omit: omitted key decodes losslessly to [None, None, 'F']
        elif st in ("x", "E"):
            g_out[cid] = [None, v16, st]
        else:
            g_out[cid] = [None, v16, "NA"]
    if g_out:
        compact_values[dguid] = g_out

# Save final dataset
out_payload = {
    "generatedAt": "2026-11-10",
    "sourceCitation": "Source: Statistics Canada, Census of Agriculture 2021 & 2016 (Tables 32-10-0153 to 32-10-0445) & 2021 Digital Boundary Files.",
    "geographies": list(geo_nodes.values()),
    "characteristics": characteristics,
    "values": compact_values,
    "historical": historical_out,
    "empiricalCrosstabs": dict(empirical_crosstabs),
}

import gzip

out_path = f"{OUT_DIR}/ag_census_data.json"
raw_json_bytes = json.dumps(out_payload, separators=(",", ":")).encode("utf-8")
with open(out_path, "wb") as f:
    f.write(raw_json_bytes)
with open(f"{out_path}.gz", "wb") as f_gz:
    f_gz.write(gzip.compress(raw_json_bytes, compresslevel=6))

print(f"SUCCESS: Compiled {out_path} ({os.path.getsize(out_path) // 1024} KB) and {out_path}.gz")
# Quick verification print for Canada and Ontario and Huron County
for check_id, label in [("2021A000011124", "Canada"), ("2021A000235", "Ontario"), ("2021A00033540", "Huron County, ON")]:
    v = values.get(check_id, {})
    print(f"  Verify {label} ({check_id}):")
    print(f"    Total Farms 2021={v.get('total_farms', [None])[0]}, 2016={v.get('total_farms', [None, None])[1]}")
    print(f"    Total Area (Acres) 2021={v.get('land_total_acres', [None])[0]}, Avg Size={v.get('avg_farm_size_acres', [None])[0]}")
    print(f"    Total Capital ($)=${v.get('cap_total_dollars', [None])[0]}, $/Acre=${v.get('land_bldg_value_per_acre', [None])[0]}")
    print(f"    Operating Revenues ($)=${v.get('rev_total_dollars', [None])[0]}, Avg Rev/Farm=${v.get('avg_rev_per_farm', [None])[0]}")
