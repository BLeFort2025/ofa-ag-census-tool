import csv
import io
import json
import os
import urllib.request
import zipfile
from collections import defaultdict

CUBES_DIR = "c:/Projects/Census Tool/data-pipeline/raw/cubes"
os.makedirs(CUBES_DIR, exist_ok=True)

# 1. Ensure all 2021 Census of Agriculture commodity cubes (plus annual fruit/veg survey cubes) are in raw/cubes/
extra_commodity_pids = [
    32100357,  # Nursery and sod, Census of Agriculture, 2021
    32100361,  # Mushrooms, Census of Agriculture, 2021
    32100373,  # Other livestock inventories on farms, Census of Agriculture, 2021
    32100375,  # Poultry production, Census of Agriculture, 2021
    32100376,  # Egg production, Census of Agriculture, 2021
    32100377,  # Commercial poultry hatcheries, Census of Agriculture, 2021
    32100384,  # Licensed cannabis production, Census of Agriculture, 2021
    32100364,  # Area, production and farm gate value of marketed fruits
    32100365,  # Area, production and farm gate value of marketed vegetables
]

for pid in extra_commodity_pids:
    csv_path = f"{CUBES_DIR}/{pid}.csv"
    if os.path.exists(csv_path):
        print(f"Already present: {pid}.csv")
        continue
    try:
        info_url = f"https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/{pid}/en"
        req = urllib.request.Request(info_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            info = json.loads(resp.read().decode("utf-8"))
        zip_url = info.get("object")
        print(f"Downloading {pid} from {zip_url} ...")
        req_zip = urllib.request.Request(zip_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req_zip, timeout=60) as zresp:
            zbytes = zresp.read()
        with zipfile.ZipFile(io.BytesIO(zbytes)) as zf:
            for name in zf.namelist():
                if name.endswith(".csv") and "MetaData" not in name:
                    with zf.open(name) as src, open(csv_path, "wb") as dst:
                        dst.write(src.read())
                elif name.endswith("MetaData.csv"):
                    meta_path = f"{CUBES_DIR}/{pid}_MetaData.csv"
                    with zf.open(name) as src, open(meta_path, "wb") as dst:
                        dst.write(src.read())
        print(f"  Saved {csv_path} ({os.path.getsize(csv_path) // 1024} KB)")
    except Exception as e:
        print(f"  Failed {pid}: {e}")

# 2. Inspect Ontario rows across all commodity cubes
commodity_cubes = [
    ("32100309", "Field crops and hay, Census of Agriculture, 2021"),
    ("32100315", "Fruits, berries and nuts, Census of Agriculture, 2021"),
    ("32100355", "Field vegetables, Census of Agriculture, 2021"),
    ("32100360", "Greenhouse products, Census of Agriculture, 2021"),
    ("32100357", "Nursery and sod, Census of Agriculture, 2021"),
    ("32100361", "Mushrooms, Census of Agriculture, 2021"),
    ("32100362", "Maple taps, Census of Agriculture, 2021"),
    ("32100384", "Licensed cannabis production, Census of Agriculture, 2021"),
    ("32100249", "Land use (Christmas trees, etc.), Census of Agriculture, 2021"),
    ("32100363", "Organic products, Census of Agriculture, 2021"),
    ("32100370", "Cattle inventory on farms, Census of Agriculture, 2021"),
    ("32100371", "Sheep inventory on farms, Census of Agriculture, 2021"),
    ("32100372", "Pig inventory on farms, Census of Agriculture, 2021"),
    ("32100373", "Other livestock inventories on farms, Census of Agriculture, 2021"),
    ("32100374", "Poultry inventories on farms, Census of Agriculture, 2021"),
    ("32100375", "Poultry production, Census of Agriculture, 2021"),
    ("32100376", "Egg production, Census of Agriculture, 2021"),
    ("32100377", "Commercial poultry hatcheries, Census of Agriculture, 2021"),
    ("32100378", "Bees, Census of Agriculture, 2021"),
    ("32100231", "Farms classified by farm type (NAICS), Census of Agriculture, 2021"),
    ("32100364", "Area, production and farm gate value of marketed fruits (Annual Survey)"),
    ("32100365", "Area, production and farm gate value of marketed vegetables (Annual Survey)"),
]

summary_out = {}

for pid, title in commodity_cubes:
    path = f"{CUBES_DIR}/{pid}.csv"
    if not os.path.exists(path):
        continue
    ontario_rows = []
    canada_rows = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        # identify dimension columns
        skip_cols = {
            "REF_DATE", "GEO", "DGUID", "UOM", "UOM_ID", "SCALAR_FACTOR",
            "SCALAR_ID", "VECTOR", "COORDINATE", "VALUE", "STATUS",
            "SYMBOL", "TERMINATED", "DECIMALS"
        }
        dim_cols = [c for c in fieldnames if c not in skip_cols]
        for row in reader:
            ref = row.get("REF_DATE", "")
            # For annual surveys (32100364, 32100365), take 2021 and latest year (e.g. 2024/2025)
            if pid in ("32100364", "32100365") and ref not in ("2021", "2023", "2024", "2025"):
                continue
            geo = row.get("GEO", "")
            dguid = row.get("DGUID", "")
            if "Ontario" in geo or dguid == "2021A000235":
                # Only provincial Ontario row, not sub-Ontario
                if geo.startswith("Ontario"):
                    ontario_rows.append({
                        "ref": ref,
                        "dims": {c: row[c] for c in dim_cols},
                        "uom": row.get("UOM", ""),
                        "scalar": row.get("SCALAR_FACTOR", ""),
                        "val": row.get("VALUE", ""),
                        "status": row.get("STATUS", "")
                    })
            elif geo.startswith("Canada"):
                canada_rows.append({
                    "ref": ref,
                    "dims": {c: row[c] for c in dim_cols},
                    "uom": row.get("UOM", ""),
                    "scalar": row.get("SCALAR_FACTOR", ""),
                    "val": row.get("VALUE", ""),
                    "status": row.get("STATUS", "")
                })
    summary_out[pid] = {
        "title": title,
        "dim_cols": dim_cols,
        "ontario_count": len(ontario_rows),
        "ontario_rows": ontario_rows,
        "canada_rows": canada_rows
    }
    print(f"Cube {pid} ({title}): {len(ontario_rows)} Ontario rows")

with open("c:/Projects/Census Tool/data-pipeline/raw/ontario_all_commodities_raw.json", "w", encoding="utf-8") as f:
    json.dump(summary_out, f, indent=2)
print("Saved c:/Projects/Census Tool/data-pipeline/raw/ontario_all_commodities_raw.json")
