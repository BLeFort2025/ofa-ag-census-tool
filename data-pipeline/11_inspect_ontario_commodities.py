import json

with open("c:/Projects/Census Tool/data-pipeline/raw/ontario_all_commodities_raw.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for pid, info in data.items():
    print(f"\n==================== {pid}: {info['title']} ====================")
    if pid in ("32100364", "32100365"):
        # For annual marketed fruit/veg surveys, group by commodity for 2021 and latest year
        by_comm = {}
        for r in info["ontario_rows"]:
            ref = r["ref"]
            comm = r["dims"].get("Commodity", "")
            est = r["dims"].get("Estimates", "")
            val = r["val"]
            status = r["status"]
            uom = r["uom"]
            scalar = r["scalar"]
            by_comm.setdefault(comm, {}).setdefault(ref, {})[est] = (val, uom, scalar, status)
        for comm, yrs in sorted(by_comm.items()):
            y21 = yrs.get("2021", {})
            y24 = yrs.get("2024", yrs.get("2025", yrs.get("2023", {})))
            print(f"  {comm}: 2021={y21} | Latest={y24}")
    else:
        for r in info["ontario_rows"]:
            dims_str = " | ".join(f"{k}: {v}" for k, v in r["dims"].items())
            print(f"  [{r['ref']}] {dims_str} => val={r['val']} (uom={r['uom']}, scalar={r['scalar']}, status={r['status']})")
