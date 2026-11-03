import csv
import json
import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

with open("c:/Projects/Census Tool/data-pipeline/raw/ontario_all_commodities_raw.json", "r", encoding="utf-8") as f:
    raw = json.load(f)

def to_num(val):
    if val is None or val == "":
        return None
    try:
        return float(val)
    except Exception:
        return None

def fmt_num(val, status="", is_curr=False):
    n = to_num(val)
    if n is None:
        return f"x / {status}" if status else "x (Suppressed)"
    if is_curr:
        return f"${n:,.0f}"
    if abs(n - round(n)) < 1e-6:
        return f"{int(round(n)):,}"
    return f"{n:,.1f}"

def pct_share(on_val, ca_val):
    on_n = to_num(on_val)
    ca_n = to_num(ca_val)
    if on_n is None or ca_n is None or ca_n == 0:
        return "—"
    return f"{(on_n / ca_n) * 100:.1f}%"

# Helper to index a cube by (ref, dim_tuple) -> (val, status, uom, scalar)
def index_cube(pid):
    info = raw[pid]
    dim_cols = info["dim_cols"]
    on_map = {}
    ca_map = {}
    for r in info["ontario_rows"]:
        key = (r["ref"], tuple(r["dims"].get(c, "") for c in dim_cols))
        on_map[key] = (r["val"], r["status"], r["uom"], r["scalar"])
    for r in info["canada_rows"]:
        key = (r["ref"], tuple(r["dims"].get(c, "") for c in dim_cols))
        ca_map[key] = (r["val"], r["status"], r["uom"], r["scalar"])
    return dim_cols, on_map, ca_map

master_rows = []

# 1. FIELD CROPS, GRAINS, OILSEEDS, PULSES, FORAGES & SPECIALTY FIELD CROPS (32-10-0309-01)
_, on_309, ca_309 = index_cube("32100309")
field_crop_items = [
    ("Soybeans", "Oilseeds & Pulses"),
    ("Corn for grain", "Grains & Cereals"),
    ("Winter wheat", "Grains & Cereals"),
    ("Alfalfa and alfalfa mixtures", "Hay & Forage Crops"),
    ("All other tame hay and fodder crops", "Hay & Forage Crops"),
    ("Corn for silage", "Hay & Forage Crops"),
    ("Spring wheat (excluding durum)", "Grains & Cereals"),
    ("Oats", "Grains & Cereals"),
    ("Other dry beans", "Oilseeds & Pulses"),
    ("Barley", "Grains & Cereals"),
    ("Fall rye", "Grains & Cereals"),
    ("Mixed grains", "Grains & Cereals"),
    ("Dry white beans", "Oilseeds & Pulses"),
    ("Canola (rapeseed)", "Oilseeds & Pulses"),
    ("Potatoes", "Roots, Tubers & Specialty Field Crops"),
    ("Other field crops", "Roots, Tubers & Specialty Field Crops"),
    ("Forage seed to be harvested for seed", "Hay & Forage Crops"),
    ("Sugar beets", "Roots, Tubers & Specialty Field Crops"),
    ("Ginseng", "Roots, Tubers & Specialty Field Crops"),
    ("Dry field peas", "Oilseeds & Pulses"),
    ("Triticale", "Grains & Cereals"),
    ("Spring rye", "Grains & Cereals"),
    ("Durum wheat", "Grains & Cereals"),
    ("Buckwheat", "Grains & Cereals"),
    ("Sunflower seed", "Oilseeds & Pulses"),
    ("Faba beans", "Oilseeds & Pulses"),
    ("Hemp", "Roots, Tubers & Specialty Field Crops"),
    ("Flaxseed", "Oilseeds & Pulses"),
    ("Mustard seed", "Oilseeds & Pulses"),
    ("Lentils", "Oilseeds & Pulses"),
    ("Chick peas", "Oilseeds & Pulses"),
    ("Canary seed", "Grains & Cereals"),
    ("Wheat, total", "Sub-total / Aggregate"),
    ("Corn, total", "Sub-total / Aggregate"),
    ("Rye, total", "Sub-total / Aggregate"),
    ("Total area of field crops and hay", "Sector Total"),
]

for item, subcat in field_crop_items:
    on_f = on_309.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_309.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_a = on_309.get(("2021", (item, "Acres")), ("", "", "", ""))
    ca_a = ca_309.get(("2021", (item, "Acres")), ("", "", "", ""))
    master_rows.append({
        "sector": "1. Field Crops, Grains, Oilseeds, Pulses & Hay",
        "subsector": subcat,
        "commodity": item,
        "table": "32-10-0309-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_a[0], on_a[1]),
        "ca_vol": fmt_num(ca_a[0], ca_a[1]),
        "on_vol_pct": pct_share(on_a[0], ca_a[0]),
        "unit": "Acres",
        "extra_note": f"Quality status: Farms={on_f[1] or 'A'}, Area={on_a[1] or 'A'}"
    })

# Add Tobacco (from 32-10-0231-01) and Open-Field Licensed Cannabis (from 32-10-0384-01)
_, on_231, ca_231 = index_cube("32100231")
on_tob = on_231.get(("2021", ("Tobacco farming [111910]",)), ("", "", "", ""))
ca_tob = ca_231.get(("2021", ("Tobacco farming [111910]",)), ("", "", "", ""))
master_rows.append({
    "sector": "1. Field Crops, Grains, Oilseeds, Pulses & Hay",
    "subsector": "Roots, Tubers & Specialty Field Crops",
    "commodity": "Tobacco (Primary NAICS 111910 farms; acreage in 'Other field crops')",
    "table": "32-10-0231-01",
    "on_farms": fmt_num(on_tob[0], on_tob[1]),
    "ca_farms": fmt_num(ca_tob[0], ca_tob[1]),
    "on_farms_pct": pct_share(on_tob[0], ca_tob[0]),
    "on_vol": "Included in 21,199 ac",
    "ca_vol": "—",
    "on_vol_pct": "—",
    "unit": "Primary Farms",
    "extra_note": "Ontario accounts for 93.8% of all Canadian tobacco farms"
})

_, on_384, ca_384 = index_cube("32100384")
on_can_f = on_384.get(("2021", ("Cannabis grown in open fields - Number of cultivators",)), ("", "", "", ""))
ca_can_f = ca_384.get(("2021", ("Cannabis grown in open fields - Number of cultivators",)), ("", "", "", ""))
on_can_a = on_384.get(("2021", ("Cannabis grown in open fields - Acres",)), ("", "", "", ""))
ca_can_a = ca_384.get(("2021", ("Cannabis grown in open fields - Acres",)), ("", "", "", ""))
master_rows.append({
    "sector": "1. Field Crops, Grains, Oilseeds, Pulses & Hay",
    "subsector": "Roots, Tubers & Specialty Field Crops",
    "commodity": "Cannabis grown in open fields (Licensed cultivators)",
    "table": "32-10-0384-01",
    "on_farms": fmt_num(on_can_f[0], on_can_f[1]),
    "ca_farms": fmt_num(ca_can_f[0], ca_can_f[1]),
    "on_farms_pct": pct_share(on_can_f[0], ca_can_f[0]),
    "on_vol": fmt_num(on_can_a[0], on_can_a[1]),
    "ca_vol": fmt_num(ca_can_a[0], ca_can_a[1]),
    "on_vol_pct": pct_share(on_can_a[0], ca_can_a[0]),
    "unit": "Acres",
    "extra_note": "Licensed outdoor cannabis cultivation"
})

# 2. FRUITS, BERRIES & TREE NUTS (32-10-0315-01 & 32-10-0364-01)
_, on_315, ca_315 = index_cube("32100315")
_, on_364, ca_364 = index_cube("32100364")

fruit_items = [
    ("Grapes", "Vineyards & Grapes", "Fresh grapes [1141147]"),
    ("Apples", "Tree Fruits", "Fresh apples [114114111]"),
    ("Peaches", "Tree Fruits", "Fresh peaches [114114411]"),
    ("Strawberries", "Berries & Small Fruit", "Fresh strawberries [114111111]"),
    ("Other fruits, berries and nuts", "Tree Nuts, Nectarines & Specialty Fruit", "Other fresh fruit, n.e.c. [114114811]"),
    ("Cherries (sour)", "Tree Fruits", "Fresh sour cherries [114114521]"),
    ("Blueberries, total", "Berries & Small Fruit", "Fresh blueberries [1141114]"),
    ("Pears", "Tree Fruits", "Fresh pears [114114211]"),
    ("Plums and prunes", "Tree Fruits", "Fresh plums and prune plums [1141143]"),
    ("Blueberries, highbush", "Berries & Small Fruit", "Fresh highbush blueberries [114111411]"),
    ("Raspberries", "Berries & Small Fruit", "Fresh raspberries [114111211]"),
    ("Cherries (sweet)", "Tree Fruits", "Fresh sweet cherries [114114511]"),
    ("Haskaps", "Berries & Small Fruit", "Fresh haskaps [114111571]"),
    ("Blackcurrants, redcurrants and whitecurrants", "Berries & Small Fruit", "Fresh currants [114111561]"),
    ("Apricots", "Tree Fruits", "Fresh apricots [114114431]"),
    ("Blueberries, lowbush", "Berries & Small Fruit", "Fresh lowbush blueberries [114111421]"),
    ("Saskatoons", "Berries & Small Fruit", "Fresh saskatoon berries [114111551]"),
    ("Cranberries", "Berries & Small Fruit", "Fresh cranberries [114111311]"),
    ("Total area of fruits", "Sector Total", "Total fresh fruit"),
]

# Note: 32100364 has 3 dim_cols (e.g. ['Estimates', 'Commodity', 'Farm area, production, value'])
# Build a simpler lookup by (ref, comm, est) -> (val, status, uom, scalar)
on_364_simple = {}
ca_364_simple = {}
for r in raw["32100364"]["ontario_rows"]:
    on_364_simple[(r["ref"], r["dims"].get("Commodity", ""), r["dims"].get("Estimates", ""))] = (r["val"], r["status"], r["uom"], r["scalar"])
for r in raw["32100364"]["canada_rows"]:
    ca_364_simple[(r["ref"], r["dims"].get("Commodity", ""), r["dims"].get("Estimates", ""))] = (r["val"], r["status"], r["uom"], r["scalar"])

def get_364(m, ref, est, comm):
    if m is on_364:
        return on_364_simple.get((ref, comm, est), ("", "", "", ""))
    else:
        return ca_364_simple.get((ref, comm, est), ("", "", "", ""))

for item, subcat, survey_comm in fruit_items:
    on_f = on_315.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_315.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_a = on_315.get(("2021", (item, "Acres")), ("", "", "", ""))
    ca_a = ca_315.get(("2021", (item, "Acres")), ("", "", "", ""))
    fgv_21 = get_364(on_364, "2021", "Farm gate value", survey_comm)
    fgv_24 = get_364(on_364, "2024", "Farm gate value", survey_comm)
    note_parts = []
    if to_num(fgv_21[0]) is not None:
        note_parts.append(f"2021 Farm Gate: ${float(fgv_21[0])*1000:,.0f}")
    if to_num(fgv_24[0]) is not None:
        note_parts.append(f"2024 Farm Gate: ${float(fgv_24[0])*1000:,.0f}")
    # If Census acres suppressed (e.g. Lowbush blueberries, Cranberries), check 32100364 cultivated area (hectares * 2.47105)
    vol_str = fmt_num(on_a[0], on_a[1])
    if to_num(on_a[0]) is None:
        ha_21 = get_364(on_364, "2021", "Cultivated area, total", survey_comm)
        if to_num(ha_21[0]) is not None:
            ac_est = round(float(ha_21[0]) * 2.47105)
            vol_str = f"F (Survey: ~{ac_est:,} ac)"
    master_rows.append({
        "sector": "2. Fruits, Berries & Tree Nuts",
        "subsector": subcat,
        "commodity": item,
        "table": "32-10-0315-01 / 0364-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": vol_str,
        "ca_vol": fmt_num(ca_a[0], ca_a[1]),
        "on_vol_pct": pct_share(on_a[0], ca_a[0]),
        "unit": "Acres",
        "extra_note": " | ".join(note_parts) if note_parts else f"Status: {on_a[1] or 'A'}"
    })

# Additional fruits explicitly tracked in Annual Fruit Survey (32-10-0364-01):
extra_fruits_364 = [
    ("Fresh vinifera, fresh French hybrid grapes [114114721]", "Vineyards & Grapes", "Vinifera & French hybrid wine grapes (Annual Survey breakdown)"),
    ("Fresh Labrusca grapes [114114711]", "Vineyards & Grapes", "Labrusca grapes - table/juice (Annual Survey breakdown)"),
    ("Fresh nectarines [114114421]", "Tree Fruits", "Nectarines (Explicitly tracked in Annual Fruit Survey)"),
    ("Fresh blackberries [114111511]", "Berries & Small Fruit", "Blackberries (Explicitly tracked in Annual Fruit Survey)"),
]
for s_comm, subcat, label in extra_fruits_364:
    ha_21 = get_364(on_364, "2021", "Cultivated area, total", s_comm)
    ha_24 = get_364(on_364, "2024", "Cultivated area, total", s_comm)
    ha_ca = get_364(ca_364, "2021", "Cultivated area, total", s_comm)
    mt_21 = get_364(on_364, "2021", "Marketed production", s_comm)
    fgv_21 = get_364(on_364, "2021", "Farm gate value", s_comm)
    fgv_24 = get_364(on_364, "2024", "Farm gate value", s_comm)
    use_ha = ha_21[0] if to_num(ha_21[0]) is not None else ha_24[0]
    ac_val = round(float(use_ha) * 2.47105) if to_num(use_ha) is not None else None
    ca_ac = round(float(ha_ca[0]) * 2.47105) if to_num(ha_ca[0]) is not None else None
    notes = []
    if to_num(mt_21[0]) is not None:
        notes.append(f"2021 Marketed: {int(float(mt_21[0])):,} tonnes")
    if to_num(fgv_21[0]) is not None:
        notes.append(f"2021 Farm Gate: ${float(fgv_21[0])*1000:,.0f}")
    if to_num(fgv_24[0]) is not None:
        notes.append(f"2024 Farm Gate: ${float(fgv_24[0])*1000:,.0f}")
    master_rows.append({
        "sector": "2. Fruits, Berries & Tree Nuts",
        "subsector": subcat,
        "commodity": label,
        "table": "32-10-0364-01",
        "on_farms": "In Census Fruit Total",
        "ca_farms": "—",
        "on_farms_pct": "—",
        "on_vol": f"{ac_val:,}" if ac_val is not None else "x",
        "ca_vol": f"{ca_ac:,}" if ca_ac is not None else "—",
        "on_vol_pct": pct_share(ac_val, ca_ac) if ac_val and ca_ac else "—",
        "unit": "Acres (Survey)",
        "extra_note": " | ".join(notes)
    })

# 3. FIELD VEGETABLES, MELONS & HERBS (32-10-0355-01 & 32-10-0365-01)
_, on_355, ca_355 = index_cube("32100355")
_, on_365, ca_365 = index_cube("32100365")
dim_365 = raw["32100365"]["dim_cols"]
def get_365(m, ref, est, comm):
    if dim_365 == ["Estimates", "Commodity"]:
        return m.get((ref, (est, comm)), ("", "", "", ""))
    else:
        return m.get((ref, (comm, est)), ("", "", "", ""))

veg_items = [
    ("Sweet corn", "Fruiting & Sweet Corn", "Fresh sweet corn [114221811]"),
    ("Tomatoes", "Fruiting & Sweet Corn", "Fresh tomatoes [11422151]"),
    ("Green peas", "Legume Vegetables", "Fresh green peas [114221611]"),
    ("Other field vegetables", "Melons, Sweet Potatoes & Specialty Veg", "Other fresh vegetables"),
    ("Carrots", "Root, Bulb & Tuber Vegetables", "Fresh carrots [11422111]"),
    ("Green and wax beans", "Legume Vegetables", "Fresh green and wax beans [114221621]"),
    ("Pumpkins", "Vine & Cucurbit Vegetables", "Fresh pumpkins [114221551]"),
    ("Onions, dry", "Root, Bulb & Tuber Vegetables", "Fresh dry onions [114221211]"),
    ("Peppers", "Fruiting & Sweet Corn", "Fresh peppers [114221541]"),
    ("Broccoli", "Brassicas & Leafy Greens", "Fresh broccoli [114221821]"),
    ("Cucumbers", "Vine & Cucurbit Vegetables", "Fresh cucumbers and fresh gherkins (all varieties)"),
    ("Cabbage, Chinese", "Brassicas & Leafy Greens", "Fresh Chinese cabbage [114221322]"),
    ("Cabbage, regular", "Brassicas & Leafy Greens", "Fresh regular cabbage [114221321]"),
    ("Asparagus, producing", "Perennial & Stalk Vegetables", "Fresh asparagus [114221351]"),
    ("Squash and zucchini", "Vine & Cucurbit Vegetables", "Fresh squash and zucchini [114221561]"),
    ("Rutabagas and turnips", "Root, Bulb & Tuber Vegetables", "Fresh rutabagas and turnips [11422112]"),
    ("Cauliflower", "Brassicas & Leafy Greens", "Fresh cauliflowers [114221831]"),
    ("Garlic", "Root, Bulb & Tuber Vegetables", "Fresh garlic [114221221]"),
    ("Beets", "Root, Bulb & Tuber Vegetables", "Fresh beets [114221141]"),
    ("Brussels sprouts", "Brassicas & Leafy Greens", "Fresh Brussels sprouts [114221361]"),
    ("Spinach", "Brassicas & Leafy Greens", "Fresh spinach [114221341]"),
    ("Radishes", "Root, Bulb & Tuber Vegetables", "Fresh radishes  [11422113]"),
    ("Celery", "Perennial & Stalk Vegetables", "Fresh celery [114221331]"),
    ("Lettuce", "Brassicas & Leafy Greens", "Fresh lettuce [11422131]"),
    ("Asparagus, non-producing", "Perennial & Stalk Vegetables", ""),
    ("Onions, green / shallots", "Root, Bulb & Tuber Vegetables", "Fresh French shallots and green onions [11422123]"),
    ("Kale", "Brassicas & Leafy Greens", "Fresh kale [114221323]"),
    ("Rhubarb", "Perennial & Stalk Vegetables", "Fresh rhubarb [114221371]"),
    ("Total area of field vegetables", "Sector Total", "Total fresh vegetables"),
]

for item, subcat, s_comm in veg_items:
    on_f = on_355.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_355.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_a = on_355.get(("2021", (item, "Acres")), ("", "", "", ""))
    ca_a = ca_355.get(("2021", (item, "Acres")), ("", "", "", ""))
    notes = []
    if s_comm:
        fgv_21 = get_365(on_365, "2021", "Farm gate value (dollars)", s_comm)
        fgv_24 = get_365(on_365, "2024", "Farm gate value (dollars)", s_comm)
        if to_num(fgv_21[0]) is not None:
            notes.append(f"2021 Farm Gate: ${float(fgv_21[0])*1000:,.0f}")
        if to_num(fgv_24[0]) is not None:
            notes.append(f"2024 Farm Gate: ${float(fgv_24[0])*1000:,.0f}")
    master_rows.append({
        "sector": "3. Field Vegetables, Melons & Culinary Herbs",
        "subsector": subcat,
        "commodity": item,
        "table": "32-10-0355-01 / 0365-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_a[0], on_a[1]),
        "ca_vol": fmt_num(ca_a[0], ca_a[1]),
        "on_vol_pct": pct_share(on_a[0], ca_a[0]),
        "unit": "Acres",
        "extra_note": " | ".join(notes) if notes else f"Status: {on_a[1] or 'A'}"
    })

# Additional field vegetables explicitly tracked in 32-10-0365-01:
extra_veg_365 = [
    ("Fresh sweet potatoes [114221161]", "Root, Bulb & Tuber Vegetables", "Sweet potatoes (Explicitly tracked in Annual Veg Survey)"),
    ("Fresh watermelons [114221411]", "Vine & Cucurbit Vegetables", "Watermelons (Explicitly tracked in Annual Veg Survey)"),
    ("Fresh Asian radishes [114221132]", "Root, Bulb & Tuber Vegetables", "Asian radishes / Daikon (Annual Veg Survey breakdown)"),
    ("Other fresh melons [114221421]", "Vine & Cucurbit Vegetables", "Cantaloupes, muskmelons & other melons (Annual Veg Survey)"),
    ("Fresh eggplants (except Chinese eggplants) [114221571]", "Fruiting & Sweet Corn", "Eggplants (Explicitly tracked in Annual Veg Survey)"),
    ("Fresh leeks [114221241]", "Root, Bulb & Tuber Vegetables", "Leeks (Explicitly tracked in Annual Veg Survey)"),
    ("Other fresh fine herbs [114221382]", "Perennial & Stalk Vegetables", "Fine culinary herbs - field (Explicitly tracked in Annual Veg Survey)"),
    ("Fresh parsnips [114221151]", "Root, Bulb & Tuber Vegetables", "Parsnips (Explicitly tracked in Annual Veg Survey)"),
    ("Fresh parsley [114221381]", "Perennial & Stalk Vegetables", "Parsley - field (Explicitly tracked in Annual Veg Survey)"),
    ("Fresh radishes (except Asian radishes) [114221131]", "Root, Bulb & Tuber Vegetables", "Regular radishes (Annual Veg Survey breakdown)"),
]
for s_comm, subcat, label in extra_veg_365:
    ac_21 = get_365(on_365, "2021", "Area planted (acres)", s_comm)
    ac_ca = get_365(ca_365, "2021", "Area planted (acres)", s_comm)
    mt_21 = get_365(on_365, "2021", "Marketed production (metric tonnes)", s_comm)
    fgv_21 = get_365(on_365, "2021", "Farm gate value (dollars)", s_comm)
    fgv_24 = get_365(on_365, "2024", "Farm gate value (dollars)", s_comm)
    notes = []
    if to_num(mt_21[0]) is not None:
        notes.append(f"2021 Marketed: {int(float(mt_21[0])):,} tonnes")
    if to_num(fgv_21[0]) is not None:
        notes.append(f"2021 Farm Gate: ${float(fgv_21[0])*1000:,.0f}")
    if to_num(fgv_24[0]) is not None:
        notes.append(f"2024 Farm Gate: ${float(fgv_24[0])*1000:,.0f}")
    master_rows.append({
        "sector": "3. Field Vegetables, Melons & Culinary Herbs",
        "subsector": subcat,
        "commodity": label,
        "table": "32-10-0365-01",
        "on_farms": "In Census Veg Total",
        "ca_farms": "—",
        "on_farms_pct": "—",
        "on_vol": fmt_num(ac_21[0], ac_21[1]),
        "ca_vol": fmt_num(ac_ca[0], ac_ca[1]),
        "on_vol_pct": pct_share(ac_21[0], ac_ca[0]),
        "unit": "Acres (Survey)",
        "extra_note": " | ".join(notes)
    })

# 4. GREENHOUSE, MUSHROOMS, NURSERY, SOD, CHRISTMAS TREES & MAPLE (32100360, 32100361, 32100357, 32100362, 32100249, 32100384)
_, on_360, ca_360 = index_cube("32100360")
gh_items = [
    ("Greenhouse tomatoes", "Greenhouse Vegetables & Herbs"),
    ("Greenhouse peppers", "Greenhouse Vegetables & Herbs"),
    ("Greenhouse cucumbers", "Greenhouse Vegetables & Herbs"),
    ("Potted plants", "Floriculture & Ornamentals"),
    ("Other greenhouse products", "Floriculture & Ornamentals"),
    ("Other greenhouse fruits and vegetables", "Greenhouse Vegetables & Herbs"),
    ("Cut flowers", "Floriculture & Ornamentals"),
    ("Greenhouse herbs", "Greenhouse Vegetables & Herbs"),
    ("Greenhouse fruits and vegetables", "Sub-total / Aggregate"),
    ("Total greenhouse area in use", "Sector Total"),
    ("Total area under glass, plastic or other protection", "Sector Total"),
]
for item, subcat in gh_items:
    on_f = on_360.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_360.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_sq = on_360.get(("2021", (item, "Square feet")), ("", "", "", ""))
    ca_sq = ca_360.get(("2021", (item, "Square feet")), ("", "", "", ""))
    ac_equiv = f"~{float(on_sq[0])/43560:,.1f} acres" if to_num(on_sq[0]) else ""
    master_rows.append({
        "sector": "4. Greenhouse, Mushrooms, Nursery, Sod, Christmas Trees & Maple",
        "subsector": subcat,
        "commodity": item,
        "table": "32-10-0360-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_sq[0], on_sq[1]),
        "ca_vol": fmt_num(ca_sq[0], ca_sq[1]),
        "on_vol_pct": pct_share(on_sq[0], ca_sq[0]),
        "unit": "Square feet",
        "extra_note": ac_equiv
    })

# Licensed cannabis under cover (32-10-0384-01)
on_cc_f = on_384.get(("2021", ("Cannabis grown under cover - Number of cultivators",)), ("", "", "", ""))
ca_cc_f = ca_384.get(("2021", ("Cannabis grown under cover - Number of cultivators",)), ("", "", "", ""))
on_cc_sq = on_384.get(("2021", ("Cannabis grown under cover - Square feet",)), ("", "", "", ""))
ca_cc_sq = ca_384.get(("2021", ("Cannabis grown under cover - Square feet",)), ("", "", "", ""))
master_rows.append({
    "sector": "4. Greenhouse, Mushrooms, Nursery, Sod, Christmas Trees & Maple",
    "subsector": "Licensed Indoor / Greenhouse Cannabis",
    "commodity": "Cannabis grown under cover (Licensed cultivators)",
    "table": "32-10-0384-01",
    "on_farms": fmt_num(on_cc_f[0], on_cc_f[1]),
    "ca_farms": fmt_num(ca_cc_f[0], ca_cc_f[1]),
    "on_farms_pct": pct_share(on_cc_f[0], ca_cc_f[0]),
    "on_vol": fmt_num(on_cc_sq[0], on_cc_sq[1]),
    "ca_vol": fmt_num(ca_cc_sq[0], ca_cc_sq[1]),
    "on_vol_pct": pct_share(on_cc_sq[0], ca_cc_sq[0]),
    "unit": "Square feet",
    "extra_note": f"~{float(on_cc_sq[0])/43560:,.1f} acres under cover"
})

# Mushrooms (32-10-0361-01)
_, on_361, ca_361 = index_cube("32100361")
mush_items = [
    ("Total growing area for mushrooms", "Mushrooms (Total)"),
    ("Total growing area for Agaricus mushrooms", "Agaricus Mushrooms (White Button, Cremini, Portobello)"),
    ("Total growing area for specialty mushrooms", "Specialty Mushrooms (Shiitake, Oyster, Lion's Mane, etc.)"),
    ("Total growing area for specialty mushrooms, grown in bags", "Specialty Mushrooms — Grown in bags"),
    ("Total growing area for specialty mushrooms, grown on natural wood logs", "Specialty Mushrooms — Grown on natural wood logs"),
    ("Total growing area for specialty mushrooms, grown using other methods", "Specialty Mushrooms — Other methods"),
]
for item, label in mush_items:
    on_f = on_361.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_361.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_sq = on_361.get(("2021", (item, "Square feet")), ("", "", "", ""))
    ca_sq = ca_361.get(("2021", (item, "Square feet")), ("", "", "", ""))
    master_rows.append({
        "sector": "4. Greenhouse, Mushrooms, Nursery, Sod, Christmas Trees & Maple",
        "subsector": "Mushroom Production",
        "commodity": label,
        "table": "32-10-0361-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_sq[0], on_sq[1]),
        "ca_vol": fmt_num(ca_sq[0], ca_sq[1]),
        "on_vol_pct": pct_share(on_sq[0], ca_sq[0]),
        "unit": "Square feet",
        "extra_note": f"Status: {on_sq[1] or 'A'}"
    })

# Nursery & Sod (32-10-0357-01)
_, on_357, ca_357 = index_cube("32100357")
for item, label in [
    ("Area of sod under cultivation for sale", "Sod under cultivation for sale"),
    ("Area of nursery products grown for sale", "Nursery stock, trees, shrubs & ornamentals grown for sale"),
]:
    on_f = on_357.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_357.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_ac = on_357.get(("2021", (item, "Acres")), ("", "", "", ""))
    ca_ac = ca_357.get(("2021", (item, "Acres")), ("", "", "", ""))
    master_rows.append({
        "sector": "4. Greenhouse, Mushrooms, Nursery, Sod, Christmas Trees & Maple",
        "subsector": "Nursery, Sod & Christmas Trees",
        "commodity": label,
        "table": "32-10-0357-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_ac[0], on_ac[1]),
        "ca_vol": fmt_num(ca_ac[0], ca_ac[1]),
        "on_vol_pct": pct_share(on_ac[0], ca_ac[0]),
        "unit": "Acres",
        "extra_note": f"Status: {on_ac[1] or 'A'}"
    })

# Christmas trees (32-10-0249-01)
_, on_249, ca_249 = index_cube("32100249")
on_ct_f = on_249.get(("2021", ("Christmas trees grown for sale", "Number of farms reporting")), ("", "", "", ""))
ca_ct_f = ca_249.get(("2021", ("Christmas trees grown for sale", "Number of farms reporting")), ("", "", "", ""))
on_ct_ac = on_249.get(("2021", ("Christmas trees grown for sale", "Acres")), ("", "", "", ""))
ca_ct_ac = ca_249.get(("2021", ("Christmas trees grown for sale", "Acres")), ("", "", "", ""))
master_rows.append({
    "sector": "4. Greenhouse, Mushrooms, Nursery, Sod, Christmas Trees & Maple",
    "subsector": "Nursery, Sod & Christmas Trees",
    "commodity": "Christmas trees grown for sale",
    "table": "32-10-0249-01",
    "on_farms": fmt_num(on_ct_f[0], on_ct_f[1]),
    "ca_farms": fmt_num(ca_ct_f[0], ca_ct_f[1]),
    "on_farms_pct": pct_share(on_ct_f[0], ca_ct_f[0]),
    "on_vol": fmt_num(on_ct_ac[0], on_ct_ac[1]),
    "ca_vol": fmt_num(ca_ct_ac[0], ca_ct_ac[1]),
    "on_vol_pct": pct_share(on_ct_ac[0], ca_ct_ac[0]),
    "unit": "Acres",
    "extra_note": "3,258 hectares in Ontario"
})

# Maple Taps (32-10-0362-01)
_, on_362, ca_362 = index_cube("32100362")
on_mp_f = on_362.get(("2021", ("Number of farms reporting",)), ("", "", "", ""))
ca_mp_f = ca_362.get(("2021", ("Number of farms reporting",)), ("", "", "", ""))
on_mp_t = on_362.get(("2021", ("Number of taps",)), ("", "", "", ""))
ca_mp_t = ca_362.get(("2021", ("Number of taps",)), ("", "", "", ""))
master_rows.append({
    "sector": "4. Greenhouse, Mushrooms, Nursery, Sod, Christmas Trees & Maple",
    "subsector": "Maple Syrup & Products",
    "commodity": "Maple tree taps (Syrup, sugar, butter & taffy)",
    "table": "32-10-0362-01",
    "on_farms": fmt_num(on_mp_f[0], on_mp_f[1]),
    "ca_farms": fmt_num(ca_mp_f[0], ca_mp_f[1]),
    "on_farms_pct": pct_share(on_mp_f[0], ca_mp_f[0]),
    "on_vol": fmt_num(on_mp_t[0], on_mp_t[1]),
    "ca_vol": fmt_num(ca_mp_t[0], ca_mp_t[1]),
    "on_vol_pct": pct_share(on_mp_t[0], ca_mp_t[0]),
    "unit": "Maple Taps",
    "extra_note": "389 primary NAICS 111994 maple syrup operations in Ontario"
})

# 5. CATTLE, DAIRY & BEEF (32-10-0370-01)
_, on_370, ca_370 = index_cube("32100370")
cattle_items = [
    ("Cows, dairy", "Dairy Cattle"),
    ("Heifers, for dairy herd replacement", "Dairy Cattle"),
    ("Cows, beef", "Beef Cattle"),
    ("Heifers, for beef herd replacement", "Beef Cattle"),
    ("Heifers, for slaughter or feeding", "Beef Feedlot & Slaughter"),
    ("Steers", "Beef Feedlot & Slaughter"),
    ("Calves (under 1 year)", "Calves & Veal"),
    ("Bulls", "Breeding Bulls"),
    ("Cows, total", "Sub-total / Aggregate"),
    ("Heifers, total", "Sub-total / Aggregate"),
    ("Total cattle", "Sector Total"),
]
for item, subcat in cattle_items:
    on_f = on_370.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_370.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_hd = on_370.get(("2021", (item, "Number of animals")), ("", "", "", ""))
    ca_hd = ca_370.get(("2021", (item, "Number of animals")), ("", "", "", ""))
    master_rows.append({
        "sector": "5. Cattle, Dairy & Beef Production",
        "subsector": subcat,
        "commodity": item,
        "table": "32-10-0370-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_hd[0], on_hd[1]),
        "ca_vol": fmt_num(ca_hd[0], ca_hd[1]),
        "on_vol_pct": pct_share(on_hd[0], ca_hd[0]),
        "unit": "Head (Animals)",
        "extra_note": f"Status: {on_hd[1] or 'A'}"
    })

# 6. SWINE / HOGS & PIGS (32-10-0372-01)
_, on_372, ca_372 = index_cube("32100372")
pig_items = [
    ("Market pigs, 50 lb (23 kg) and over", "Grower & Finisher Pigs"),
    ("Weanling, nursery or starter pigs, 15 to 49 lb (7 to 22 kg)", "Nursery / Starter Pigs"),
    ("Suckling pigs, less than 15 lb (7 kg)", "Suckling Piglets"),
    ("Sows and gilts for breeding", "Breeding Herd"),
    ("Boars for breeding", "Breeding Herd"),
    ("Total pigs", "Sector Total"),
]
for item, subcat in pig_items:
    on_f = on_372.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_372.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_hd = on_372.get(("2021", (item, "Number of animals")), ("", "", "", ""))
    ca_hd = ca_372.get(("2021", (item, "Number of animals")), ("", "", "", ""))
    master_rows.append({
        "sector": "6. Swine / Hogs & Pigs",
        "subsector": subcat,
        "commodity": item,
        "table": "32-10-0372-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_hd[0], on_hd[1]),
        "ca_vol": fmt_num(ca_hd[0], ca_hd[1]),
        "on_vol_pct": pct_share(on_hd[0], ca_hd[0]),
        "unit": "Head (Animals)",
        "extra_note": f"Status: {on_hd[1] or 'A'}"
    })

# 7. SHEEP, LAMBS, GOATS & OTHER LIVESTOCK (32-10-0371-01 & 32-10-0373-01)
_, on_371, ca_371 = index_cube("32100371")
for item, subcat in [
    ("Ewes", "Sheep & Lambs"),
    ("Lambs, market", "Sheep & Lambs"),
    ("Lambs, replacement", "Sheep & Lambs"),
    ("Rams", "Sheep & Lambs"),
    ("Lambs, total", "Sub-total / Aggregate"),
    ("Total sheep", "Sector Total"),
]:
    on_f = on_371.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_371.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_hd = on_371.get(("2021", (item, "Number of animals")), ("", "", "", ""))
    ca_hd = ca_371.get(("2021", (item, "Number of animals")), ("", "", "", ""))
    master_rows.append({
        "sector": "7. Sheep, Goats, Equine, Cervids, Bison, Rabbits & Fur",
        "subsector": subcat,
        "commodity": item,
        "table": "32-10-0371-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_hd[0], on_hd[1]),
        "ca_vol": fmt_num(ca_hd[0], ca_hd[1]),
        "on_vol_pct": pct_share(on_hd[0], ca_hd[0]),
        "unit": "Head (Animals)",
        "extra_note": f"Status: {on_hd[1] or 'A'}"
    })

_, on_373, ca_373 = index_cube("32100373")
for item, subcat in [
    ("Goats", "Goats (Dairy & Meat)"),
    ("Horses and ponies", "Equine"),
    ("Donkeys and mules", "Equine"),
    ("Rabbits", "Rabbits & Fur-Bearing Animals"),
    ("Mink", "Rabbits & Fur-Bearing Animals"),
    ("Llamas and alpacas", "Camelids"),
    ("Bison (buffalo)", "Bison & Cervids"),
    ("Deer (excluding wild deer)", "Bison & Cervids"),
    ("Elk (wapiti)", "Bison & Cervids"),
]:
    on_f = on_373.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_373.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_hd = on_373.get(("2021", (item, "Number of animals")), ("", "", "", ""))
    ca_hd = ca_373.get(("2021", (item, "Number of animals")), ("", "", "", ""))
    master_rows.append({
        "sector": "7. Sheep, Goats, Equine, Cervids, Bison, Rabbits & Fur",
        "subsector": subcat,
        "commodity": item,
        "table": "32-10-0373-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_hd[0], on_hd[1]),
        "ca_vol": fmt_num(ca_hd[0], ca_hd[1]),
        "on_vol_pct": pct_share(on_hd[0], ca_hd[0]),
        "unit": "Head (Animals)",
        "extra_note": f"Status: {on_hd[1] or 'A'}"
    })

# 8. POULTRY, EGGS & HATCHERIES (32100374, 32100375, 32100376, 32100377)
_, on_374, ca_374 = index_cube("32100374")
for item, subcat in [
    ("Broilers, roasters and Cornish", "Chicken & Broiler Inventory"),
    ("Laying hens that produce table eggs, 19 weeks and over", "Layer & Pullet Inventory"),
    ("Pullets intended for laying table eggs, under 19 weeks", "Layer & Pullet Inventory"),
    ("Layer and broiler breeders (pullets and hens), total", "Breeder Flock Inventory"),
    ("Turkeys", "Turkeys, Waterfowl & Specialty Poultry"),
    ("Other poultry", "Turkeys, Waterfowl & Specialty Poultry"),
    ("Ducks", "Turkeys, Waterfowl & Specialty Poultry"),
    ("Geese", "Turkeys, Waterfowl & Specialty Poultry"),
    ("Total hens and chickens", "Sector Total"),
]:
    on_f = on_374.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_374.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_bd = on_374.get(("2021", (item, "Number of birds")), ("", "", "", ""))
    ca_bd = ca_374.get(("2021", (item, "Number of birds")), ("", "", "", ""))
    master_rows.append({
        "sector": "8. Poultry, Eggs & Commercial Hatcheries",
        "subsector": subcat,
        "commodity": item,
        "table": "32-10-0374-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_bd[0], on_bd[1]),
        "ca_vol": fmt_num(ca_bd[0], ca_bd[1]),
        "on_vol_pct": pct_share(on_bd[0], ca_bd[0]),
        "unit": "Birds (Inventory)",
        "extra_note": "Other poultry includes quail, pheasants, guinea fowl, squab, ostriches, etc." if item == "Other poultry" else f"Status: {on_bd[1] or 'A'}"
    })

_, on_375, ca_375 = index_cube("32100375")
for item, label in [
    ("Broilers, roasters and Cornish production", "Broilers, roasters & Cornish — Annual Meat Production"),
    ("Turkey production", "Turkey — Annual Meat Production"),
]:
    on_f = on_375.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_375.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_kg = on_375.get(("2021", (item, "Kilograms")), ("", "", "", ""))
    ca_kg = ca_375.get(("2021", (item, "Kilograms")), ("", "", "", ""))
    master_rows.append({
        "sector": "8. Poultry, Eggs & Commercial Hatcheries",
        "subsector": "Annual Poultry Meat Production",
        "commodity": label,
        "table": "32-10-0375-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_kg[0], on_kg[1]),
        "ca_vol": fmt_num(ca_kg[0], ca_kg[1]),
        "on_vol_pct": pct_share(on_kg[0], ca_kg[0]),
        "unit": "Kilograms (Live/Meat)",
        "extra_note": f"{int(float(on_kg[0])*2.20462):,} lbs" if to_num(on_kg[0]) else ""
    })

_, on_376, ca_376 = index_cube("32100376")
for item, label in [
    ("Table eggs", "Table eggs — Annual Production"),
    ("Hatching eggs", "Hatching eggs — Annual Production"),
]:
    on_f = on_376.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_376.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_dz = on_376.get(("2021", (item, "Number of eggs (dozens)")), ("", "", "", ""))
    ca_dz = ca_376.get(("2021", (item, "Number of eggs (dozens)")), ("", "", "", ""))
    master_rows.append({
        "sector": "8. Poultry, Eggs & Commercial Hatcheries",
        "subsector": "Annual Egg Production",
        "commodity": label,
        "table": "32-10-0376-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_dz[0], on_dz[1]),
        "ca_vol": fmt_num(ca_dz[0], ca_dz[1]),
        "on_vol_pct": pct_share(on_dz[0], ca_dz[0]),
        "unit": "Dozen Eggs",
        "extra_note": f"Status: {on_dz[1] or 'A'}"
    })

_, on_377, ca_377 = index_cube("32100377")
on_ht_f = on_377.get(("2021", ("Number of farms reporting",)), ("", "", "", ""))
ca_ht_f = ca_377.get(("2021", ("Number of farms reporting",)), ("", "", "", ""))
on_ht_b = on_377.get(("2021", ("Number of birds hatched",)), ("", "", "", ""))
ca_ht_b = ca_377.get(("2021", ("Number of birds hatched",)), ("", "", "", ""))
master_rows.append({
    "sector": "8. Poultry, Eggs & Commercial Hatcheries",
    "subsector": "Commercial Poultry Hatcheries",
    "commodity": "Chicks and other poultry hatched in commercial hatcheries",
    "table": "32-10-0377-01",
    "on_farms": fmt_num(on_ht_f[0], on_ht_f[1]),
    "ca_farms": fmt_num(ca_ht_f[0], ca_ht_f[1]),
    "on_farms_pct": pct_share(on_ht_f[0], ca_ht_f[0]),
    "on_vol": fmt_num(on_ht_b[0], on_ht_b[1]),
    "ca_vol": fmt_num(ca_ht_b[0], ca_ht_b[1]),
    "on_vol_pct": pct_share(on_ht_b[0], ca_ht_b[0]),
    "unit": "Birds Hatched",
    "extra_note": "Commercial hatchery output"
})

# 9. APICULTURE (BEES), BIOENERGY & CERTIFIED ORGANIC (32100378 & 32100363)
_, on_378, ca_378 = index_cube("32100378")
for item, unit_label in [
    ("Honeybees, live colonies", "Live Colonies"),
    ("Other pollinating bees, gallons", "Gallons of Bees"),
]:
    on_f = on_378.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    ca_f = ca_378.get(("2021", (item, "Number of farms reporting")), ("", "", "", ""))
    on_v = on_378.get(("2021", (item, "Number")), ("", "", "", ""))
    ca_v = ca_378.get(("2021", (item, "Number")), ("", "", "", ""))
    master_rows.append({
        "sector": "9. Apiculture, Pollination & Organic Production",
        "subsector": "Apiculture & Pollinators",
        "commodity": item,
        "table": "32-10-0378-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": fmt_num(on_v[0], on_v[1]),
        "ca_vol": fmt_num(ca_v[0], ca_v[1]),
        "on_vol_pct": pct_share(on_v[0], ca_v[0]),
        "unit": unit_label,
        "extra_note": "527 primary NAICS 112910 apiculture farms in Ontario" if "Honeybees" in item else "Leafcutter & bumblebee pollinators"
    })

_, on_363, ca_363 = index_cube("32100363")
for item in [
    "Organic products for sale",
    "Certified organic products for sale",
    "Transitional organic products for sale",
]:
    on_f = on_363.get(("2021", (item,)), ("", "", "", ""))
    ca_f = ca_363.get(("2021", (item,)), ("", "", "", ""))
    master_rows.append({
        "sector": "9. Apiculture, Pollination & Organic Production",
        "subsector": "Organic & Transitional Production",
        "commodity": item,
        "table": "32-10-0363-01",
        "on_farms": fmt_num(on_f[0], on_f[1]),
        "ca_farms": fmt_num(ca_f[0], ca_f[1]),
        "on_farms_pct": pct_share(on_f[0], ca_f[0]),
        "on_vol": "Cross-Commodity",
        "ca_vol": "Cross-Commodity",
        "on_vol_pct": "—",
        "unit": "Farms Reporting",
        "extra_note": "Certified & transitional organic operations across all commodity sectors"
    })

# Write CSV
csv_out = "c:/Projects/Census Tool/Ontario_Complete_Agricultural_Commodity_Inventory_2021.csv"
with open(csv_out, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.DictWriter(f, fieldnames=[
        "sector", "subsector", "commodity", "table",
        "on_farms", "ca_farms", "on_farms_pct",
        "on_vol", "ca_vol", "on_vol_pct", "unit", "extra_note"
    ])
    writer.writeheader()
    writer.writerows(master_rows)
print(f"Wrote {len(master_rows)} rows to {csv_out}")

# Write Word Document
doc = Document()
for section in doc.sections:
    section.top_margin = Inches(0.6)
    section.bottom_margin = Inches(0.6)
    section.left_margin = Inches(0.6)
    section.right_margin = Inches(0.6)

title_p = doc.add_paragraph()
title_r = title_p.add_run("ONTARIO COMPLETE AGRICULTURAL COMMODITY INVENTORY (2021 CENSUS & ANNUAL SURVEYS)")
title_r.bold = True
title_r.font.size = Pt(15)
title_r.font.color.rgb = RGBColor(15, 37, 55)

sub_p = doc.add_paragraph()
sub_r = sub_p.add_run(
    "Exhaustive Empirical Inventory of Every Agricultural Commodity Produced in Ontario — "
    "Derived from 22 Statistics Canada Census of Agriculture (2021) & Annual Commodity Survey Cubes"
)
sub_r.font.size = Pt(10)
sub_r.font.color.rgb = RGBColor(46, 107, 52)

def set_cell_bg(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tcPr.append(shd)

by_sector = {}
for r in master_rows:
    by_sector.setdefault(r["sector"], []).append(r)

for sec_name, rows in by_sector.items():
    h = doc.add_paragraph()
    hr = h.add_run(sec_name)
    hr.bold = True
    hr.font.size = Pt(11.5)
    hr.font.color.rgb = RGBColor(15, 37, 55)

    tbl = doc.add_table(rows=1, cols=7)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = ["Commodity", "Sub-Sector", "StatCan Table", "ON Farms", "ON % of CAN Farms", "ON Production / Area / Inventory", "Unit & Market Notes"]
    hdr_cells = tbl.rows[0].cells
    for idx, text in enumerate(headers):
        hdr_cells[idx].text = text
        set_cell_bg(hdr_cells[idx], "0F2537")
        for p in hdr_cells[idx].paragraphs:
            for run in p.runs:
                run.font.bold = True
                run.font.size = Pt(8)
                run.font.color.rgb = RGBColor(255, 255, 255)

    for i, r in enumerate(rows):
        row_cells = tbl.add_row().cells
        vals = [
            r["commodity"],
            r["subsector"],
            r["table"],
            r["on_farms"],
            r["on_farms_pct"],
            f"{r['on_vol']} ({r['on_vol_pct']} of CAN)" if r["on_vol_pct"] != "—" else r["on_vol"],
            f"{r['unit']} — {r['extra_note']}" if r["extra_note"] else r["unit"]
        ]
        bg = "F8FAFC" if i % 2 == 1 else "FFFFFF"
        if "Total" in r["subsector"]:
            bg = "E6F4EA"
        for idx, v in enumerate(vals):
            row_cells[idx].text = str(v)
            set_cell_bg(row_cells[idx], bg)
            for p in row_cells[idx].paragraphs:
                for run in p.runs:
                    run.font.size = Pt(8)
                    if idx == 0 or "Total" in r["subsector"]:
                        run.font.bold = True

docx_out = "c:/Projects/Census Tool/Ontario_Complete_Agricultural_Commodity_Inventory_2021.docx"
doc.save(docx_out)
print(f"Saved Word report to {docx_out}")

# Also generate a native, styled Excel (.xlsx) workbook with openpyxl
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = openpyxl.Workbook()
ws_all = wb.active
ws_all.title = "All Ontario Commodities"

header_fill = PatternFill(start_color="0F2537", end_color="0F2537", fill_type="solid")
sub_fill = PatternFill(start_color="E6F4EA", end_color="E6F4EA", fill_type="solid")
zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")

header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
bold_font = Font(name="Calibri", size=10, bold=True, color="0F2537")
reg_font = Font(name="Calibri", size=10, bold=False, color="1E293B")
thin_border = Border(
    left=Side(style="thin", color="E2E8F0"),
    right=Side(style="thin", color="E2E8F0"),
    top=Side(style="thin", color="E2E8F0"),
    bottom=Side(style="thin", color="E2E8F0")
)

xl_headers = [
    "Sector", "Sub-Sector", "Agricultural Commodity", "StatCan Table",
    "Ontario Farms (2021)", "Canada Farms (2021)", "ON % of CAN Farms",
    "Ontario Area / Inventory / Production", "Canada Area / Inventory / Production",
    "ON % of CAN Volume", "Unit of Measure", "Market & Quality Notes"
]

def populate_sheet(ws, rows_to_write):
    ws.append(xl_headers)
    ws.freeze_panes = "A2"
    for col_idx in range(1, len(xl_headers) + 1):
        c = ws.cell(row=1, column=col_idx)
        c.fill = header_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="center" if 5 <= col_idx <= 10 else "left", vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 26

    for r_idx, r in enumerate(rows_to_write, start=2):
        row_vals = [
            r["sector"], r["subsector"], r["commodity"], r["table"],
            r["on_farms"], r["ca_farms"], r["on_farms_pct"],
            r["on_vol"], r["ca_vol"], r["on_vol_pct"],
            r["unit"], r["extra_note"]
        ]
        ws.append(row_vals)
        is_tot = "Total" in r["subsector"] or "Aggregate" in r["subsector"]
        fill = sub_fill if is_tot else (zebra_fill if r_idx % 2 == 1 else white_fill)
        for col_idx in range(1, len(xl_headers) + 1):
            c = ws.cell(row=r_idx, column=col_idx)
            c.fill = fill
            c.font = bold_font if (is_tot or col_idx == 3) else reg_font
            c.border = thin_border
            c.alignment = Alignment(horizontal="right" if 5 <= col_idx <= 10 else "left", vertical="center")

    col_widths = [36, 28, 44, 18, 16, 16, 15, 22, 22, 15, 18, 52]
    for i, w in enumerate(col_widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

populate_sheet(ws_all, master_rows)

# Add separate tabs for each major sector
short_tab_names = {
    "1. Field Crops, Grains, Oilseeds, Pulses & Hay": "1_Field_Crops_Hay",
    "2. Fruits, Berries & Tree Nuts": "2_Fruits_Berries_Nuts",
    "3. Field Vegetables, Melons & Culinary Herbs": "3_Field_Vegetables",
    "4. Greenhouse, Mushrooms, Nursery, Sod, Christmas Trees & Maple": "4_Greenhouse_Maple_Nursery",
    "5. Cattle, Dairy & Beef Production": "5_Cattle_Dairy_Beef",
    "6. Swine / Hogs & Pigs": "6_Swine_Hogs",
    "7. Sheep, Goats, Equine, Cervids, Bison, Rabbits & Fur": "7_Sheep_Goats_Other_Lvstk",
    "8. Poultry, Eggs & Commercial Hatcheries": "8_Poultry_Eggs",
    "9. Apiculture, Pollination & Organic Production": "9_Bees_Organic"
}
for sec_name, rows in by_sector.items():
    tab_title = short_tab_names.get(sec_name, sec_name[:30])
    ws_sec = wb.create_sheet(title=tab_title)
    populate_sheet(ws_sec, rows)

xlsx_out = "c:/Projects/Census Tool/Ontario_Complete_Agricultural_Commodity_Inventory_2021.xlsx"
wb.save(xlsx_out)
print(f"Saved Excel workbook to {xlsx_out}")

