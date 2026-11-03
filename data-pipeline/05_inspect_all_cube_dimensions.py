import csv
import glob
import os
import json

cube_files = sorted(glob.glob("c:/Projects/Census Tool/data-pipeline/raw/cubes/*.csv"))
summary = {}

for path in cube_files:
    fname = os.path.basename(path)
    if "MetaData" in fname:
        continue
    pid = fname.replace(".csv", "")
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames
        # Dimension columns are everything between DGUID and UOM
        dguid_idx = cols.index("DGUID")
        uom_idx = cols.index("UOM")
        dim_cols = cols[dguid_idx+1:uom_idx]
        dim_vals = {d: set() for d in dim_cols}
        ref_dates = set()
        uoms = set()
        scalars = set()
        # Read rows for Canada [000000000] or Canada to quickly collect all dimension values
        for i, row in enumerate(reader):
            ref_dates.add(row["REF_DATE"])
            if "Canada" in row["GEO"] or i < 2000:
                for d in dim_cols:
                    dim_vals[d].add(row[d])
                uoms.add(row["UOM"])
                scalars.add(row["SCALAR_FACTOR"])
            if i > 25000 and len(ref_dates) >= 1:
                break
        summary[pid] = {
            "dim_cols": dim_cols,
            "ref_dates": sorted(list(ref_dates)),
            "uoms": sorted(list(uoms)),
            "scalars": sorted(list(scalars)),
            "members": {d: sorted(list(vals)) for d, vals in dim_vals.items()}
        }
        print(f"{pid}: dims={dim_cols} | dates={sorted(list(ref_dates))} | uoms={sorted(list(uoms))}")

with open("c:/Projects/Census Tool/data-pipeline/raw/cube_dimensions_summary.json", "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2)
print("Saved cube_dimensions_summary.json")
