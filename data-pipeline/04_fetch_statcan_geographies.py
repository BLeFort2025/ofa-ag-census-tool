import urllib.request
import urllib.parse
import json
import os
import time

os.makedirs("c:/Projects/Census Tool/data-pipeline/raw", exist_ok=True)
os.makedirs("c:/Projects/Census Tool/public/data", exist_ok=True)

# Digital_boundary_files is much faster than Cartographic_boundary_files because it doesn't trace coastal micro-islands
DIG_URL = "https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Digital_boundary_files/MapServer"
AG_URL = "https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Agricultural_ecumene_boundary_files/MapServer"

def compute_centroid_from_rings(rings):
    if not rings:
        return None, None
    best_ring = max(rings, key=lambda r: len(r))
    lons = [pt[0] for pt in best_ring]
    lats = [pt[1] for pt in best_ring]
    lon = round((min(lons) + max(lons)) / 2.0, 4)
    lat = round((min(lats) + max(lats)) / 2.0, 4)
    return lat, lon

def fetch_layer(base_url, layer_id, max_offset=0.03, batch_size=250):
    features_all = []
    offset = 0
    while True:
        params = urllib.parse.urlencode({
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "true",
            "maxAllowableOffset": str(max_offset),
            "geometryPrecision": "3",
            "outSR": "4326",
            "resultOffset": str(offset),
            "resultRecordCount": str(batch_size),
            "f": "json"
        })
        url = f"{base_url}/{layer_id}/query?{params}"
        t0 = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        feats = data.get("features", [])
        if not feats:
            break
        features_all.extend(feats)
        print(f"  Layer {layer_id}: fetched {len(features_all)} features ({time.time()-t0:.1f}s)...")
        if len(feats) < batch_size and not data.get("exceededTransferLimit"):
            break
        offset += len(feats)
    return features_all

# Check layer list in Digital_boundary_files
r = json.loads(urllib.request.urlopen(f"{DIG_URL}?f=json", timeout=15).read().decode())
print("Digital boundary layers:", [(l["id"], l["name"]) for l in r.get("layers", [])])

centroids_by_dguid = {}
centroids_by_uid = {}
geojson_features = []

# Fetch PR (0), CAR (1), CD (4) from Digital_boundary_files, and CCS from Digital_boundary_files (5)
for base_u, lid, level_code, uid_field, name_field, max_off, keep_poly, bsize in [
    (DIG_URL, 0, "PR", "PRUID", "PRENAME", 0.05, True, 50),
    (DIG_URL, 1, "CAR", "CARUID", "CARENAME", 0.03, True, 100),
    (DIG_URL, 4, "CD", "CDUID", "CDNAME", 0.02, True, 150),
    (DIG_URL, 5, "CCS", "CCSUID", "CCSNAME", 0.02, False, 300),
]:
    print(f"Fetching {level_code} (layer {lid})...")
    feats = fetch_layer(base_u, lid, max_offset=max_off, batch_size=bsize)
    for f in feats:
        attrs = f.get("attributes", {})
        geom = f.get("geometry", {})
        rings = geom.get("rings", [])
        lat, lon = compute_centroid_from_rings(rings)
        dguid = attrs.get("DGUID")
        uid = str(attrs.get(uid_field, ""))
        name = attrs.get(name_field, "")
        landarea = attrs.get("LANDAREA")
        info = {
            "dguid": dguid,
            "uid": uid,
            "level": level_code,
            "name": name,
            "landAreaSqKm": round(float(landarea), 2) if landarea is not None else None,
            "lat": lat,
            "lon": lon,
            "cdType": attrs.get("CDTYPE")
        }
        if dguid:
            centroids_by_dguid[dguid] = info
        if uid:
            centroids_by_uid[f"{level_code}_{uid}"] = info

        if keep_poly and rings and dguid:
            compact_rings = [
                [[round(pt[0], 3), round(pt[1], 3)] for pt in ring]
                for ring in rings if len(ring) >= 4
            ]
            if compact_rings:
                geojson_features.append({
                    "type": "Feature",
                    "properties": {
                        "dguid": dguid,
                        "uid": uid,
                        "level": level_code,
                        "name": name
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": compact_rings
                    }
                })

with open("c:/Projects/Census Tool/data-pipeline/raw/statcan_geo_centroids.json", "w", encoding="utf-8") as f:
    json.dump({"by_dguid": centroids_by_dguid, "by_uid": centroids_by_uid}, f, indent=2)

geojson_path = "c:/Projects/Census Tool/public/data/ag_boundaries.geojson"
with open(geojson_path, "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection", "features": geojson_features}, f, separators=(",", ":"))

print(f"SUCCESS: Saved {len(centroids_by_dguid)} official StatCan centroids and {len(geojson_features)} boundary polygons ({os.path.getsize(geojson_path)//1024} KB)!")
