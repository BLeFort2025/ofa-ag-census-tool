import json
import urllib.request
import os

os.makedirs("c:/Projects/Census Tool/data-pipeline/raw", exist_ok=True)

# Let's check a range of StatCan 32-10-xxxx product IDs used for the 2021 Census of Agriculture
# Note: StatCan 2021 Census of Agriculture tables are primarily in the 32-10-0230 to 32-10-0405 and 32-10-0150 to 32-10-0170 ranges
candidate_pids = (
    list(range(32100150, 32100170)) +
    list(range(32100230, 32100255)) +
    list(range(32100305, 32100390))
)

url = "https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata"

found_cubes = []
# Batch in chunks of 25
for i in range(0, len(candidate_pids), 25):
    batch = [{"productId": pid} for pid in candidate_pids[i:i+25]]
    req = urllib.request.Request(
        url,
        data=json.dumps(batch).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            results = json.loads(resp.read().decode("utf-8"))
            for r in results:
                if r.get("status") == "SUCCESS":
                    obj = r["object"]
                    pid = obj.get("productId")
                    title = obj.get("cubeTitleEn")
                    start_date = obj.get("cubeStartDate")
                    end_date = obj.get("cubeEndDate")
                    dims = [d.get("dimensionNameEn") for d in obj.get("dimension", [])]
                    found_cubes.append({
                        "productId": pid,
                        "title": title,
                        "start": start_date,
                        "end": end_date,
                        "dimensions": dims
                    })
                    print(f"{pid}: {title} ({start_date} to {end_date}) | Dims: {dims}")
    except Exception as e:
        print(f"Batch error at {i}: {e}")

with open("c:/Projects/Census Tool/data-pipeline/raw/discovered_cubes.json", "w", encoding="utf-8") as f:
    json.dump(found_cubes, f, indent=2)

print(f"\nTotal found cubes: {len(found_cubes)}")
