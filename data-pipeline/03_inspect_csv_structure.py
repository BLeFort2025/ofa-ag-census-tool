import csv
import json
import urllib.request
import zipfile
import io
import os

# Also download 2016 sub-provincial cubes for true 2016-2021 CAR/CD/CCS deltas + Ag-Population Linkage cubes
extra_2016_and_crosstab_pids = [
    32100401, # Farms classified by farm type and household income class, Ag-Pop Linkage 2021
    32100399, # Farm operators classified by farm type and educational attainment, Ag-Pop Linkage 2021
    32100403, # Farms classified by farm type (NAICS), 2011 and 2016 (CAR/CD/CCS)
    32100406, # Land use, 2011 and 2016 (CAR/CD/CCS)
    32100407, # Land tenure, 2011 and 2016 (CAR/CD/CCS)
]

# Also check metadata for 32100430 to 32100448 to find 2016 Farm Capital & Operating Revenues/Expenses PIDs
url_meta = "https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata"
batch = [{"productId": pid} for pid in range(32100430, 32100448)]
req = urllib.request.Request(
    url_meta,
    data=json.dumps(batch).encode("utf-8"),
    headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
)
with urllib.request.urlopen(req, timeout=20) as resp:
    for r in json.loads(resp.read().decode("utf-8")):
        if r.get("status") == "SUCCESS":
            obj = r["object"]
            pid = obj.get("productId")
            title = obj.get("cubeTitleEn")
            print(f"{pid}: {title}")
            if any(k in title.lower() for k in ["capital", "revenue", "expense", "receipt", "operator"]):
                extra_2016_and_crosstab_pids.append(pid)

for pid in extra_2016_and_crosstab_pids:
    csv_path = f"c:/Projects/Census Tool/data-pipeline/raw/cubes/{pid}.csv"
    if os.path.exists(csv_path):
        continue
    try:
        info_url = f"https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/{pid}/en"
        req = urllib.request.Request(info_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            info = json.loads(resp.read().decode("utf-8"))
        zip_url = info.get("object")
        print(f"Downloading {pid} ...")
        req_zip = urllib.request.Request(zip_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req_zip, timeout=60) as zresp:
            zbytes = zresp.read()
        with zipfile.ZipFile(io.BytesIO(zbytes)) as zf:
            for name in zf.namelist():
                if name.endswith(".csv") and "MetaData" not in name:
                    with zf.open(name) as src, open(csv_path, "wb") as dst:
                        dst.write(src.read())
        print(f"  Saved {csv_path} ({os.path.getsize(csv_path) // 1024} KB)")
    except Exception as e:
        print(f"  Failed {pid}: {e}")

# Now inspect the headers and sample GEO/DGUID rows of 32100231.csv (Farms by NAICS 2021)
print("\n--- Inspecting 32100231.csv ---")
with open("c:/Projects/Census Tool/data-pipeline/raw/cubes/32100231.csv", "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    print("Columns:", reader.fieldnames)
    geos = {}
    chars = set()
    for idx, row in enumerate(reader):
        g = row["GEO"]
        dguid = row["DGUID"]
        if g not in geos and len(geos) < 40:
            geos[g] = dguid
        chars.add(row["North American Industry Classification System (NAICS)"])
    print("Sample Geographies (GEO -> DGUID):")
    for g, d in list(geos.items())[:35]:
        print(f"  {g} -> {d}")
    print("Distinct NAICS Characteristics:", sorted(list(chars)))
