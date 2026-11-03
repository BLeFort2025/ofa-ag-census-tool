import json
import urllib.request
import zipfile
import io
import os

os.makedirs("c:/Projects/Census Tool/data-pipeline/raw/cubes", exist_ok=True)

# First check 32100390 to 32100450 for any additional 2016/2021 or Ag-Population linkage cubes
url_meta = "https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata"
extra_pids = list(range(32100390, 32100450))
for i in range(0, len(extra_pids), 25):
    batch = [{"productId": pid} for pid in extra_pids[i:i+25]]
    req = urllib.request.Request(
        url_meta,
        data=json.dumps(batch).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            results = json.loads(resp.read().decode("utf-8"))
            for r in results:
                if r.get("status") == "SUCCESS":
                    obj = r["object"]
                    print(f"{obj.get('productId')}: {obj.get('cubeTitleEn')} ({obj.get('cubeStartDate')} to {obj.get('cubeEndDate')})")
    except Exception as e:
        print(f"Extra batch error: {e}")

# Core 2021 & Historical Census of Agriculture tables to download
target_pids = [
    32100231, # Farms classified by farm type (NAICS), 2021
    32100232, # Farms classified by total farm area, 2021
    32100233, # Farms classified by area in crops and summerfallow, 2021
    32100234, # Land tenure, 2021
    32100235, # Farms classified by operating arrangement, 2021
    32100236, # Farms classified by total farm capital, 2021
    32100237, # Farm capital ($ value), 2021
    32100238, # Value of farm machinery and equipment, 2021
    32100239, # Farms classified by total operating revenues, 2021
    32100240, # Operating revenues ($ and farms), 2021
    32100241, # Operating expenses ($ and farms), 2021
    32100242, # Direct sales of agricultural products to consumers, 2021
    32100243, # Paid labour, 2021
    32100244, # Succession plan for the agricultural operation, 2021
    32100249, # Land use (total area, cropland, pasture, woodland, etc.), 2021
    32100309, # Field crops and hay, 2021
    32100315, # Fruits, berries and nuts, 2021
    32100355, # Field vegetables, 2021
    32100360, # Greenhouse products, 2021
    32100362, # Maple taps, 2021
    32100363, # Organic products, 2021
    32100367, # Tillage and seeding practices, 2021
    32100368, # Land inputs, manure and irrigation, 2021
    32100369, # Land practices and land features, 2021
    32100370, # Cattle inventory on farms, 2021
    32100371, # Sheep inventory on farms, 2021
    32100372, # Pig inventory on farms, 2021
    32100374, # Poultry inventories on farms, 2021
    32100378, # Bees, 2021
    32100379, # Technologies used on the operation, 2021
    32100380, # Renewable energy production, 2021
    32100381, # Characteristics of farm operators: Age, sex and number of operators, 2021
    32100382, # Characteristics of farm operators: farm work and other paid work, 2021
    # Historical multi-census series (1976-2021) for time-series & 2016 deltas
    32100153, # Land use historical (1921-2021)
    32100156, # Farms classified by total farm area historical (1976-2021)
    32100164, # Farm capital, operating revenues and operating expenses historical (1976-2021)
    32100166, # Farms classified by farm type (NAICS) historical (2001-2021)
    32100230, # Characteristics of farm operators historical (1991-2021)
]

for pid in target_pids:
    csv_path = f"c:/Projects/Census Tool/data-pipeline/raw/cubes/{pid}.csv"
    if os.path.exists(csv_path):
        print(f"Already downloaded {pid}.csv")
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
                    meta_path = f"c:/Projects/Census Tool/data-pipeline/raw/cubes/{pid}_MetaData.csv"
                    with zf.open(name) as src, open(meta_path, "wb") as dst:
                        dst.write(src.read())
        print(f"  Saved {csv_path} ({os.path.getsize(csv_path) // 1024} KB)")
    except Exception as e:
        print(f"  Failed {pid}: {e}")

print("All cube downloads complete!")
