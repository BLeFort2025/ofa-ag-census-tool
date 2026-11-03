import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# Empirically verified, farmer-defensible inventory of primary agricultural commodities produced in Ontario (1 per row)
# Audited against Statistics Canada (Census & Annual Surveys), Agricorp Production Insurance, OFPMC Marketing Boards,
# OMAFRA production guides, and commodity associations.
# - Removes Prairie-only, research-only, defunct, wild-foraged, and climatically unviable items
# - Removes/merges intermediate breeding, young-stock, seed, and propagation inputs
# - Consolidates redundant maturity-stage, harvest-method, and colour/cultivar splits

SINGLE_COMMODITY_ROWS = [
    # 1. Grains, Cereals & Pseudocereals
    ("Grains, Cereals & Pseudocereals", "Corn", "Grain Corn (Yellow Dent)", "StatCan / Agricorp / GFO"),
    ("Grains, Cereals & Pseudocereals", "Corn", "White & Food-Grade Corn", "Agricorp / GFO"),
    ("Grains, Cereals & Pseudocereals", "Corn", "Popping Corn (Popcorn)", "Agricorp / OMAFRA"),
    ("Grains, Cereals & Pseudocereals", "Wheat", "Soft Red Winter Wheat", "StatCan / Agricorp / GFO"),
    ("Grains, Cereals & Pseudocereals", "Wheat", "Soft White Winter Wheat", "Agricorp / GFO"),
    ("Grains, Cereals & Pseudocereals", "Wheat", "Hard Red Winter Wheat", "Agricorp / GFO"),
    ("Grains, Cereals & Pseudocereals", "Wheat", "Hard Red Spring Wheat", "StatCan / Agricorp / GFO"),
    ("Grains, Cereals & Pseudocereals", "Cereal Grains", "Oats", "StatCan / Agricorp / GFO"),
    ("Grains, Cereals & Pseudocereals", "Cereal Grains", "Barley (Feed & Malting)", "StatCan / Agricorp / GFO"),
    ("Grains, Cereals & Pseudocereals", "Cereal Grains", "Fall Rye", "StatCan / Agricorp"),
    ("Grains, Cereals & Pseudocereals", "Cereal Grains", "Spring Rye", "StatCan 32-10-0309-01"),
    ("Grains, Cereals & Pseudocereals", "Cereal Grains", "Mixed Grains", "StatCan / Agricorp"),
    ("Grains, Cereals & Pseudocereals", "Cereal Grains", "Triticale", "StatCan 32-10-0309-01"),
    ("Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Spelt", "Agricorp / OMAFRA"),
    ("Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Heritage Hulled & Ancient Wheats (Emmer, Einkorn & Khorasan / Kamut)", "OMAFRA / Ont. Organic"),
    ("Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Buckwheat", "StatCan 32-10-0309-01"),
    ("Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Quinoa", "OMAFRA / Quinta Quinoa"),
    ("Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Grain Amaranth", "OMAFRA"),
    ("Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Millet (Proso, Pearl & Foxtail)", "OMAFRA"),
    ("Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Sorghum (Grain Sorghum & Sweet Sorghum)", "OMAFRA"),

    # 2. Oilseeds, Pulses, Dry Beans & Peanuts
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Soybeans", "Crushing & Feed Soybeans", "StatCan / Agricorp / GFO"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Soybeans", "Identity-Preserved (IP) Food-Grade Soybeans (Tofu, Natto & Miso)", "Agricorp / GFO"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Oilseeds", "Canola (Spring & Winter Rapeseed)", "StatCan / Agricorp"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Oilseeds", "Sunflower Seed (Oilseed & Confectionary)", "StatCan / Agricorp"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Oilseeds", "Flaxseed (Linseed)", "StatCan / Agricorp"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Oilseeds", "Mustard Seed", "StatCan / Agricorp"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "White Pea Beans (Navy Beans)", "StatCan / Agricorp / OBG"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Kidney Beans (Dark Red, Light Red & White Cannellini)", "Agricorp / Ontario Bean Growers"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Black Turtle Beans", "Agricorp / Ontario Bean Growers"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Cranberry Beans (Romano / Borlotti)", "Agricorp / Ontario Bean Growers"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Adzuki Beans", "Agricorp / Ontario Bean Growers"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Otebo & Kintoki Japanese Beans", "Agricorp / Ontario Bean Growers"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Heirloom & Specialty Dry Beans (Pinto, Great Northern, Yellow Eye, Dutch Brown & Small Red)", "Ontario Bean Growers"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Mung Beans", "OMAFRA / Ont. Bean Growers"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Pulses & Legumes", "Dry Field Peas", "StatCan 32-10-0309-01 / Agricorp"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Pulses & Legumes", "Faba Beans (Dry Broad Beans)", "StatCan 32-10-0309-01"),
    ("Oilseeds, Pulses, Dry Beans & Peanuts", "Peanuts", "Peanuts (Valencia & Virginia-Type)", "Agricorp / OMAFRA"),

    # 3. Forages, Hay, Sugar, Tobacco, Hops & Biomass
    ("Forages, Hay, Industrial & Biomass Crops", "Hay & Forage Crops", "Alfalfa & Alfalfa-Grass Hay", "StatCan 32-10-0309-01"),
    ("Forages, Hay, Industrial & Biomass Crops", "Hay & Forage Crops", "Timothy Hay", "OMAFRA / Ontario Forage Council"),
    ("Forages, Hay, Industrial & Biomass Crops", "Hay & Forage Crops", "Forage & Cover-Crop Clovers (Red, White/Ladino, Alsike & Crimson)", "OMAFRA / Ontario Forage Council"),
    ("Forages, Hay, Industrial & Biomass Crops", "Hay & Forage Crops", "Birdsfoot Trefoil", "OMAFRA / Ontario Forage Council"),
    ("Forages, Hay, Industrial & Biomass Crops", "Hay & Forage Crops", "Cool-Season Pasture & Hay Grasses (Orchardgrass, Bromegrass, Ryegrass & Fescue)", "OMAFRA / Ontario Forage Council"),
    ("Forages, Hay, Industrial & Biomass Crops", "Hay & Forage Crops", "Reed Canarygrass (Forage & Biomass)", "OMAFRA Pub 30"),
    ("Forages, Hay, Industrial & Biomass Crops", "Hay & Forage Crops", "Corn Silage", "StatCan / Agricorp"),
    ("Forages, Hay, Industrial & Biomass Crops", "Hay & Forage Crops", "Sorghum-Sudangrass Forage", "OMAFRA"),
    ("Forages, Hay, Industrial & Biomass Crops", "Hay & Forage Crops", "Forage Brassicas (Grazing Turnips, Forage Rape & Kale)", "OMAFRA / Beef & Sheep Pastures"),
    ("Forages, Hay, Industrial & Biomass Crops", "Sugar, Tobacco & Hops", "Sugar Beets", "StatCan / Agricorp / OSBG"),
    ("Forages, Hay, Industrial & Biomass Crops", "Sugar, Tobacco & Hops", "Flue-Cured Virginia Tobacco", "StatCan / Agricorp / OFCTGMB"),
    ("Forages, Hay, Industrial & Biomass Crops", "Sugar, Tobacco & Hops", "Air-Cured & Fire-Cured Specialty Tobacco (Burley & Dark)", "Agricorp / OMAFRA"),
    ("Forages, Hay, Industrial & Biomass Crops", "Sugar, Tobacco & Hops", "Hops", "OMAFRA / OHGA"),
    ("Forages, Hay, Industrial & Biomass Crops", "Hemp, Cannabis & Biomass", "Industrial Hemp (Grain, Fibre & CBD)", "StatCan / Agricorp"),
    ("Forages, Hay, Industrial & Biomass Crops", "Hemp, Cannabis & Biomass", "Open-Field Cannabis", "StatCan 32-10-0384-01"),
    ("Forages, Hay, Industrial & Biomass Crops", "Hemp, Cannabis & Biomass", "Miscanthus (Biomass & Bedding)", "OMAFRA / OBPC"),
    ("Forages, Hay, Industrial & Biomass Crops", "Hemp, Cannabis & Biomass", "Switchgrass (Biomass & Bedding)", "OMAFRA / OBPC"),

    # 4. Tree Fruits, Grapes, Berries & Tree Nuts
    ("Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Apples (Fresh Market, Processing & Hard Cider Cultivars)", "StatCan / Agricorp / OAG"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Peaches", "StatCan / Agricorp / OTFG"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Nectarines", "StatCan 32-10-0364-01 / Agricorp"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "European Pears (Bartlett, Bosc, Anjou & Flemish Beauty)", "StatCan / Agricorp / OTFG"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Asian Pears", "OMAFRA / OTFG"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "European Plums & Prune Plums", "StatCan / Agricorp / OTFG"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Japanese Plums", "StatCan / Agricorp / OTFG"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Sour (Tart) Cherries", "StatCan / Agricorp / OTFG"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Sweet Cherries", "StatCan / Agricorp / OTFG"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Apricots", "StatCan 32-10-0315-01 / OTFG"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Persimmons (American & Hybrid)", "OMAFRA / SONGA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Fresh Figs (High-Tunnel & Protected)", "OMAFRA / Niagara & Essex Growers"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Grapes & Vineyards", "Vinifera Wine Grapes (incl. Icewine)", "StatCan 32-10-0364-01 / GGO"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Grapes & Vineyards", "French Hybrid Wine Grapes (incl. Vidal Icewine)", "StatCan 32-10-0364-01 / GGO"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Grapes & Vineyards", "Labrusca Table & Juice Grapes (Concord, Niagara & Coronation)", "StatCan 32-10-0364-01 / GGO"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Strawberries (Field)", "StatCan / Agricorp / BGO"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Raspberries (Red, Black & Golden)", "StatCan 32-10-0315-01 / BGO"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Highbush Blueberries (Cultivated)", "StatCan 32-10-0315-01 / BGO"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Cranberries", "StatCan 32-10-0315-01 / 0364-01"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Blackberries", "StatCan 32-10-0364-01 / BGO"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Haskaps (Honeyberries)", "StatCan 32-10-0315-01 / OMAFRA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Blackcurrants", "StatCan 32-10-0315-01 / OMAFRA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Red & White Currants", "StatCan 32-10-0315-01 / OMAFRA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Saskatoon Berries", "StatCan 32-10-0315-01"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Gooseberries", "OMAFRA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Elderberries", "OMAFRA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Sea Buckthorn Berries", "OMAFRA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Hardy Kiwi (Kiwi Berries)", "OMAFRA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Aronia Berries (Black Chokeberries)", "OMAFRA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Ground Cherries (Cape Gooseberries / Physalis)", "OMAFRA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Tree Nuts", "Hazelnuts (Filberts)", "OMAFRA / Ontario Hazelnut Association"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Tree Nuts", "English (Persian) Walnuts", "OMAFRA / SONGA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Tree Nuts", "Black Walnuts", "OMAFRA / SONGA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Tree Nuts", "Heartnuts (Japanese Walnuts)", "OMAFRA / SONGA"),
    ("Fruits, Berries, Grapes & Tree Nuts", "Tree Nuts", "Sweet Chestnuts", "OMAFRA / SONGA"),

    # 5. Field Vegetables, Melons, Roots & World Crops
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Potatoes (Table, Chipping & Processing)", "StatCan / Agricorp / OPB"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Sweet Potatoes", "StatCan 32-10-0365-01 / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Carrots", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Dry Bulb Onions (Yellow Cooking, Red, White & Spanish)", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Pearl, Pickling & Cipollini Onions", "Agricorp / Foodland Ontario"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Green Onions (Scallions)", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "French Shallots", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Garlic & Garlic Scapes (Hardneck & Softneck)", "StatCan / Agricorp / GGAO"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Elephant Garlic", "OMAFRA / GGAO"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Leeks", "StatCan 32-10-0365-01 / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Beets", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Rutabagas (Swedes)", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Turnips (White & Purple-Top)", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Parsnips", "StatCan 32-10-0365-01 / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "European & Specialty Radishes (Red Globe, French Breakfast & Watermelon)", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Asian Radishes (Daikon / Lo Bok)", "StatCan 32-10-0365-01"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Celeriac (Celery Root)", "Agricorp / Foodland Ontario"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Horseradish", "OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Jerusalem Artichokes (Sunchokes)", "OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Burdock Root (Gobo)", "OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Fresh Ginger (High-Tunnel)", "OMAFRA / Vineland"),
    ("Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Vegetables", "Fresh Turmeric (High-Tunnel)", "OMAFRA / Vineland"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Broccoli", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Cauliflower (White, Purple, Orange & Romanesco)", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Head Cabbage (Green, Red & Savoy)", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Napa Cabbage (Chinese Cabbage)", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Bok Choy (Pak Choy)", "StatCan / OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Gai Lan (Chinese Broccoli)", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Yu Choy", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Brussels Sprouts", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Kale", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Kohlrabi", "Foodland Ontario / OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Rapini (Broccoli Rabe)", "Foodland Ontario / OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Collard Greens", "OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Mustard Greens", "OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Asparagus", "StatCan / Agricorp / AFO"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Celery", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Rhubarb", "StatCan / Foodland Ontario"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Field Lettuce (Romaine, Iceberg, Butterhead & Leaf)", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Mesclun & Baby Salad Greens", "Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Spinach", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Swiss Chard", "Foodland Ontario / OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Arugula", "OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Tatsoi", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Mizuna", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Watercress", "OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Endive & Escarole", "Foodland Ontario / OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Radicchio", "Foodland Ontario / OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Belgian Endive (Witloof Chicory)", "OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Dandelion Greens", "OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Florence Fennel (Bulb Fennel)", "OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Globe Artichokes", "OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Callaloo (Amaranth Greens)", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Water Spinach (Ong Choy)", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Vegetables", "Malabar Spinach", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Sweet Corn", "StatCan / Agricorp / OPVG"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Field Tomatoes (Fresh Market)", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Processing Tomatoes (Roma / Paste)", "StatCan / Agricorp / OPVG"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Field Sweet Peppers (Bell, Shepherd, Cubanelle & Banana)", "StatCan / Agricorp / OPVG"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Field Hot & Specialty Chili Peppers (Jalapeño, Habanero, Scotch Bonnet, Poblano, Cayenne & Thai)", "Agricorp / OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Eggplants (Globe & Italian)", "StatCan 32-10-0365-01 / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Asian & Indian Eggplants", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "African Eggplant (Garden Egg)", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Tomatillos", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Okra", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Green Shelling Peas (Processing & Fresh)", "StatCan / Agricorp / OPVG"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Edible-Pod Peas (Snow Peas & Sugar Snap Peas)", "Foodland Ontario / OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Snap Beans (Green, Yellow Wax & Flat Italian Romano)", "StatCan / Agricorp / OPVG"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Lima Beans", "Agricorp / OPVG"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Broad Beans (Fresh Fava Beans)", "Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Edamame (Fresh Vegetable Soybeans)", "OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Yardlong Beans (Asparagus Beans)", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Field Slicing Cucumbers", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Pickling Cucumbers & Gherkins", "StatCan / Agricorp / OPVG"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Pumpkins", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Summer Squash & Zucchini (Green/Gold Zucchini, Pattypan & Crookneck)", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Winter Squash (Butternut, Acorn, Buttercup, Kabocha, Spaghetti, Hubbard & Delicata)", "StatCan / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Bitter Melon (Karela)", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Bottle Gourd (Lauki / Calabash)", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Wax Gourd (Winter Melon)", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Fuzzy Melon (Moqua / Hairy Gourd)", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Vegetables", "Luffa (Sponge / Ridge Gourd)", "OMAFRA World Crops"),
    ("Field Vegetables, Melons & World Crops", "Melons", "Watermelons", "StatCan 32-10-0365-01 / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Melons", "Cantaloupes (Muskmelons)", "StatCan 32-10-0365-01 / Agricorp"),
    ("Field Vegetables, Melons & World Crops", "Melons", "Honeydew Melons", "StatCan 32-10-0365-01 / OMAFRA"),
    ("Field Vegetables, Melons & World Crops", "Melons", "Canary, Galia & Korean Specialty Melons", "StatCan 32-10-0365-01 / OMAFRA"),

    # 6. Medicinal Roots, Culinary Herbs, Spices & Essential Oils
    ("Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "North American Ginseng", "StatCan 32-10-0309-01 / OGGA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "Echinacea", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "Valerian", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "St. John's Wort", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "Calendula", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "Chamomile", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "Lemon Balm", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Aromatic & Essential Oil Crops", "Lavender", "OMAFRA / Ontario Lavender Association"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Aromatic & Essential Oil Crops", "Peppermint", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Aromatic & Essential Oil Crops", "Spearmint", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Parsley", "StatCan 32-10-0365-01 / OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Basil", "StatCan / OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Cilantro & Coriander", "StatCan / OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Dill", "StatCan / OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Oregano", "StatCan / OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Marjoram", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Thyme", "StatCan / OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Rosemary", "StatCan / OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Sage", "StatCan / OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Summer & Winter Savory", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Chives & Garlic Chives", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Tarragon", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Sorrel", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Lemongrass", "OMAFRA World Crops"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Fenugreek (Methi)", "OMAFRA World Crops"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Caraway Seed", "OMAFRA"),
    ("Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Edible Culinary Flowers (Nasturtiums, Violas & Borage Blossoms)", "OMAFRA"),

    # 7. Greenhouse Produce, Indoor Cannabis & Mushrooms
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse Tomatoes", "StatCan 32-10-0360-01 / OGVG"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse Sweet Bell & Mini Peppers", "StatCan 32-10-0360-01 / OGVG"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse Cucumbers (Long English & Mini/Persian)", "StatCan 32-10-0360-01 / OGVG"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse Strawberries", "StatCan 32-10-0360-01 / OGVG"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse & Hydroponic Lettuce", "StatCan 32-10-0360-01"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse Eggplants", "StatCan 32-10-0360-01"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse Culinary Herbs", "StatCan 32-10-0360-01"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Microgreens & Wheatgrass", "OMAFRA"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Edible Sprouts", "OMAFRA"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Indoor & Greenhouse Cannabis", "Indoor & Greenhouse Cannabis", "StatCan 32-10-0384-01"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Agaricus Mushrooms (White Button, Cremini & Portobello)", "StatCan 32-10-0361-01 / Mushrooms Canada"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Shiitake Mushrooms", "StatCan 32-10-0361-01"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Oyster Mushrooms", "StatCan 32-10-0361-01"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "King Oyster Mushrooms", "StatCan 32-10-0361-01"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Lion's Mane Mushrooms", "StatCan 32-10-0361-01"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Maitake (Hen-of-the-Woods) Mushrooms", "StatCan 32-10-0361-01"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Enoki Mushrooms", "StatCan 32-10-0361-01"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Beech (Shimeji) Mushrooms", "StatCan 32-10-0361-01"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Chestnut Mushrooms", "StatCan 32-10-0361-01"),
    ("Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Reishi Mushrooms", "StatCan 32-10-0361-01"),

    # 8. Floriculture, Nursery, Sod & Christmas Trees
    ("Floriculture, Nursery, Sod & Christmas Trees", "Floriculture", "Cut Flowers", "StatCan 32-10-0360-01 / Flowers Canada"),
    ("Floriculture, Nursery, Sod & Christmas Trees", "Floriculture", "Potted Flowering Plants", "StatCan 32-10-0360-01 / Flowers Canada"),
    ("Floriculture, Nursery, Sod & Christmas Trees", "Floriculture", "Annual Bedding Plants & Hanging Baskets", "StatCan 32-10-0360-01 / Flowers Canada"),
    ("Floriculture, Nursery, Sod & Christmas Trees", "Floriculture", "Tropical & Indoor Foliage Houseplants", "StatCan 32-10-0360-01"),
    ("Floriculture, Nursery, Sod & Christmas Trees", "Nursery Stock", "Deciduous Shade & Ornamental Trees", "StatCan 32-10-0357-01 / Landscape Ontario"),
    ("Floriculture, Nursery, Sod & Christmas Trees", "Nursery Stock", "Coniferous Landscape Trees & Cedar Hedging", "StatCan 32-10-0357-01 / Landscape Ontario"),
    ("Floriculture, Nursery, Sod & Christmas Trees", "Nursery Stock", "Ornamental Shrubs & Roses", "StatCan 32-10-0357-01 / Landscape Ontario"),
    ("Floriculture, Nursery, Sod & Christmas Trees", "Nursery Stock", "Herbaceous Perennials & Ornamental Grasses", "StatCan 32-10-0357-01 / Landscape Ontario"),
    ("Floriculture, Nursery, Sod & Christmas Trees", "Nursery Stock", "Reforestation Seedlings & Native Restoration Plants", "StatCan 32-10-0357-01"),
    ("Floriculture, Nursery, Sod & Christmas Trees", "Turfgrass Sod", "Turfgrass Sod", "StatCan 32-10-0357-01 / NSGA"),
    ("Floriculture, Nursery, Sod & Christmas Trees", "Christmas Trees", "Christmas Trees", "StatCan 32-10-0249-01 / CFOA"),

    # 9. Maple Syrup, Tree Syrups & Apiculture
    ("Maple Products & Honeybees", "Maple & Tree Syrups", "Maple Syrup, Sap Water & Pure Maple Confections (Sugar, Butter & Taffy)", "StatCan 32-10-0362-01 / OMSPA"),
    ("Maple Products & Honeybees", "Maple & Tree Syrups", "Birch Syrup", "OMAFRA"),
    ("Maple Products & Honeybees", "Maple & Tree Syrups", "Black Walnut Tree Syrup", "OMAFRA"),
    ("Maple Products & Honeybees", "Apiculture & Bee Products", "Honey", "StatCan 32-10-0378-01 / OBA"),
    ("Maple Products & Honeybees", "Apiculture & Bee Products", "Beeswax", "Ontario Beekeepers' Association (OBA)"),
    ("Maple Products & Honeybees", "Apiculture & Bee Products", "Bee Pollen, Propolis & Royal Jelly", "Ontario Beekeepers' Association (OBA)"),

    # 10. Dairy, Beef, Veal, Swine, Sheep & Goats
    ("Dairy, Beef, Veal, Pork, Sheep & Goats", "Dairy Cattle & Milk", "Cow's Milk & Cream", "StatCan 32-10-0370-01 / DFO"),
    ("Dairy, Beef, Veal, Pork, Sheep & Goats", "Beef & Veal Cattle", "Beef Cattle (Cow-Calf, Stocker, Feedlot & Seedstock)", "StatCan 32-10-0370-01 / BFO"),
    ("Dairy, Beef, Veal, Pork, Sheep & Goats", "Beef & Veal Cattle", "Grain-Fed & Milk-Fed Veal", "StatCan 32-10-0370-01 / VFO"),
    ("Dairy, Beef, Veal, Pork, Sheep & Goats", "Swine & Pork", "Market Hogs (Pork)", "StatCan 32-10-0372-01 / Ontario Pork"),
    ("Dairy, Beef, Veal, Pork, Sheep & Goats", "Sheep, Lamb, Milk & Wool", "Lamb & Mutton", "StatCan 32-10-0371-01 / OSF"),
    ("Dairy, Beef, Veal, Pork, Sheep & Goats", "Sheep, Lamb, Milk & Wool", "Sheep Milk", "Ontario Sheep Farmers / ODGA"),
    ("Dairy, Beef, Veal, Pork, Sheep & Goats", "Sheep, Lamb, Milk & Wool", "Sheep Wool & Fleeces", "Canadian Co-operative Wool Growers / OSF"),
    ("Dairy, Beef, Veal, Pork, Sheep & Goats", "Goats (Milk, Meat & Fibre)", "Goat Milk", "StatCan 32-10-0373-01 / Ontario Goat"),
    ("Dairy, Beef, Veal, Pork, Sheep & Goats", "Goats (Milk, Meat & Fibre)", "Goat Meat (Chevon & Cabrito)", "StatCan 32-10-0373-01 / Ontario Goat"),
    ("Dairy, Beef, Veal, Pork, Sheep & Goats", "Goats (Milk, Meat & Fibre)", "Mohair & Cashmere Goat Fibre", "Ontario Goat"),

    # 11. Poultry, Eggs, Waterfowl & Game Birds
    ("Poultry, Eggs, Waterfowl & Game Birds", "Chicken & Turkey Meat", "Broiler & Roaster Chickens", "StatCan 32-10-0374-01 / CFO"),
    ("Poultry, Eggs, Waterfowl & Game Birds", "Chicken & Turkey Meat", "Cornish Game Hens", "StatCan 32-10-0374-01 / CFO"),
    ("Poultry, Eggs, Waterfowl & Game Birds", "Chicken & Turkey Meat", "Turkeys", "StatCan 32-10-0374-01 / TFO"),
    ("Poultry, Eggs, Waterfowl & Game Birds", "Eggs", "Chicken Table Eggs", "StatCan 32-10-0376-01 / EFO"),
    ("Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Ducks", "StatCan 32-10-0374-01"),
    ("Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Duck Eggs", "OMAFRA"),
    ("Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Geese", "StatCan 32-10-0374-01"),
    ("Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Quail (Meat & Quail Eggs)", "StatCan 32-10-0374-01 / OMAFRA"),
    ("Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Ring-Necked Pheasants", "StatCan 32-10-0374-01 / OMAFRA"),
    ("Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Chukar Partridges", "StatCan 32-10-0374-01 / OMAFRA"),
    ("Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Guinea Fowl", "StatCan 32-10-0374-01 / OMAFRA"),
    ("Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Squab (Utility Meat Pigeons)", "StatCan 32-10-0374-01 / OMAFRA"),
    ("Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Ostriches", "StatCan 32-10-0374-01 / OMAFRA"),

    # 12. Equine, Specialty Livestock, Aquaculture & Alternative Proteins
    ("Equine, Specialty Livestock & Aquaculture", "Equine", "Horses & Ponies", "StatCan 32-10-0373-01 / Equine Guelph"),
    ("Equine, Specialty Livestock & Aquaculture", "Equine", "Donkeys & Mules", "StatCan 32-10-0373-01"),
    ("Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "Alpacas (Alpaca Fibre)", "StatCan 32-10-0373-01 / Alpaca Ontario"),
    ("Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "Llamas", "StatCan 32-10-0373-01"),
    ("Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "North American Bison (Buffalo)", "StatCan 32-10-0373-01 / OBA"),
    ("Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "Water Buffalo (Milk & Meat)", "OMAFRA / Ontario Water Buffalo"),
    ("Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "Elk / Wapiti (Venison & Antler Velvet)", "StatCan 32-10-0373-01"),
    ("Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "Farmed Deer (Venison)", "StatCan 32-10-0373-01"),
    ("Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "Farmed Wild Boar", "OMAFRA"),
    ("Equine, Specialty Livestock & Aquaculture", "Rabbits & Fur-Bearing", "Rabbits (Meat & Angora Wool)", "StatCan 32-10-0373-01 / ORBA"),
    ("Equine, Specialty Livestock & Aquaculture", "Rabbits & Fur-Bearing", "Mink", "StatCan 32-10-0373-01 / NFACC"),
    ("Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Rainbow Trout", "OMAFRA / Ontario Aquaculture Association"),
    ("Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Arctic Char", "OMAFRA / Ontario Aquaculture Association"),
    ("Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Brook (Speckled) Trout", "OMAFRA / Ontario Aquaculture Association"),
    ("Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Tilapia", "OMAFRA / Ontario Aquaculture Association"),
    ("Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Barramundi", "OMAFRA / Ontario Aquaculture Association"),
    ("Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Coho Salmon (Land-Based & Net-Pen Aquaculture)", "OMAFRA / Ontario Aquaculture Association"),
    ("Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Largemouth & Smallmouth Bass", "OMAFRA / Ontario Aquaculture Association"),
    ("Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Yellow Perch", "OMAFRA / Ontario Aquaculture Association"),
    ("Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Walleye (Pickerel)", "OMAFRA / Ontario Aquaculture Association"),
    ("Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Pacific Whiteleg Shrimp (Indoor Land-Based)", "OMAFRA / Ontario Seafood Farmers"),
    ("Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Baitfish, Minnows & Koi", "OMAFRA"),
    ("Equine, Specialty Livestock & Aquaculture", "Insects, Vermiculture & Bioenergy", "Crickets (Edible & Feed Protein)", "OMAFRA"),
    ("Equine, Specialty Livestock & Aquaculture", "Insects, Vermiculture & Bioenergy", "Mealworms (Edible & Feed Protein)", "OMAFRA"),
    ("Equine, Specialty Livestock & Aquaculture", "Insects, Vermiculture & Bioenergy", "Black Soldier Fly Larvae (Bioconversion & Feed)", "OMAFRA"),
    ("Equine, Specialty Livestock & Aquaculture", "Insects, Vermiculture & Bioenergy", "Earthworms & Worm Castings (Vermiculture)", "OMAFRA"),
    ("Equine, Specialty Livestock & Aquaculture", "Insects, Vermiculture & Bioenergy", "On-Farm Renewable Bioenergy (Biogas / RNG & Biomass)", "StatCan 32-10-0380-01"),
]

wb = openpyxl.Workbook()

header_fill = PatternFill(start_color="0F2537", end_color="0F2537", fill_type="solid")
zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
bold_font = Font(name="Calibri", size=10.5, bold=True, color="0F2537")
reg_font = Font(name="Calibri", size=10.5, bold=False, color="1E293B")
thin_border = Border(
    left=Side(style="thin", color="E2E8F0"),
    right=Side(style="thin", color="E2E8F0"),
    top=Side(style="thin", color="E2E8F0"),
    bottom=Side(style="thin", color="E2E8F0")
)

# Tab 1: Alphabetical A-to-Z (1 Commodity Per Row)
ws_az = wb.active
ws_az.title = "A-to-Z Commodities (1 Per Row)"
headers = ["#", "Commodity Produced in Ontario", "Agricultural Sector", "Sub-Category", "Verification Source"]
ws_az.append(headers)
ws_az.freeze_panes = "A2"
ws_az.auto_filter.ref = f"A1:E{len(SINGLE_COMMODITY_ROWS)+1}"

for col_idx in range(1, 6):
    c = ws_az.cell(row=1, column=col_idx)
    c.fill = header_fill
    c.font = header_font
    c.alignment = Alignment(horizontal="center" if col_idx == 1 else "left", vertical="center")
ws_az.row_dimensions[1].height = 26

sorted_az = sorted(SINGLE_COMMODITY_ROWS, key=lambda x: x[2].lower())
for idx, (sec, subcat, comm, src) in enumerate(sorted_az, start=1):
    ws_az.append([idx, comm, sec, subcat, src])
    r_num = idx + 1
    fill = zebra_fill if idx % 2 == 0 else white_fill
    for col_idx in range(1, 6):
        c = ws_az.cell(row=r_num, column=col_idx)
        c.fill = fill
        c.font = bold_font if col_idx == 2 else reg_font
        c.border = thin_border
        c.alignment = Alignment(horizontal="center" if col_idx == 1 else "left", vertical="center")

for i, w in enumerate([8, 54, 42, 34, 38], start=1):
    ws_az.column_dimensions[get_column_letter(i)].width = w

# Tab 2: Grouped by Sector (1 Commodity Per Row)
ws_sec = wb.create_sheet(title="By Sector (1 Per Row)")
ws_sec.append(["#", "Agricultural Sector", "Sub-Category", "Commodity Produced in Ontario", "Verification Source"])
ws_sec.freeze_panes = "A2"
ws_sec.auto_filter.ref = f"A1:E{len(SINGLE_COMMODITY_ROWS)+1}"

for col_idx in range(1, 6):
    c = ws_sec.cell(row=1, column=col_idx)
    c.fill = header_fill
    c.font = header_font
    c.alignment = Alignment(horizontal="center" if col_idx == 1 else "left", vertical="center")
ws_sec.row_dimensions[1].height = 26

for idx, (sec, subcat, comm, src) in enumerate(SINGLE_COMMODITY_ROWS, start=1):
    ws_sec.append([idx, sec, subcat, comm, src])
    r_num = idx + 1
    fill = zebra_fill if idx % 2 == 0 else white_fill
    for col_idx in range(1, 6):
        c = ws_sec.cell(row=r_num, column=col_idx)
        c.fill = fill
        c.font = bold_font if col_idx == 4 else reg_font
        c.border = thin_border
        c.alignment = Alignment(horizontal="center" if col_idx == 1 else "left", vertical="center")

for i, w in enumerate([8, 42, 34, 54, 38], start=1):
    ws_sec.column_dimensions[get_column_letter(i)].width = w

# Tab 3: Strictly Traditional Agriculture (1 Commodity Per Row)
# Excludes non-traditional / non-land-based / forestry / bio-economy items:
# - Aquaculture (fish, shrimp, baitfish/koi)
# - Insects & Vermiculture (crickets, mealworms, black soldier fly, earthworms)
# - On-Farm Energy Utilities (biogas/RNG)
# - Non-Maple Forest Syrups & Reforestation (birch syrup, black walnut syrup, reforestation seedlings)
# - Licensed Recreational/Medical Cannabis (open-field & indoor cannabis; Industrial Hemp is retained)
NON_STRICT_AG_EXCLUSIONS = {
    # Aquaculture
    "Rainbow Trout",
    "Arctic Char",
    "Brook (Speckled) Trout",
    "Tilapia",
    "Barramundi",
    "Coho Salmon (Land-Based & Net-Pen Aquaculture)",
    "Largemouth & Smallmouth Bass",
    "Yellow Perch",
    "Walleye (Pickerel)",
    "Pacific Whiteleg Shrimp (Indoor Land-Based)",
    "Baitfish, Minnows & Koi",
    # Insects, Vermiculture & Bioenergy
    "Crickets (Edible & Feed Protein)",
    "Mealworms (Edible & Feed Protein)",
    "Black Soldier Fly Larvae (Bioconversion & Feed)",
    "Earthworms & Worm Castings (Vermiculture)",
    "On-Farm Renewable Bioenergy (Biogas / RNG & Biomass)",
    # Forest Syrups & Reforestation
    "Birch Syrup",
    "Black Walnut Tree Syrup",
    "Reforestation Seedlings & Native Restoration Plants",
    # Licensed Cannabis (Cannabis Act)
    "Open-Field Cannabis",
    "Indoor & Greenhouse Cannabis",
}

strict_ag_rows = [r for r in SINGLE_COMMODITY_ROWS if r[2] not in NON_STRICT_AG_EXCLUSIONS]

ws_strict = wb.create_sheet(title="Strictly Agriculture")
ws_strict.append(["#", "Agricultural Sector", "Sub-Category", "Strictly Traditional Agricultural Commodity", "Verification Source"])
ws_strict.freeze_panes = "A2"
ws_strict.auto_filter.ref = f"A1:E{len(strict_ag_rows)+1}"

for col_idx in range(1, 6):
    c = ws_strict.cell(row=1, column=col_idx)
    c.fill = header_fill
    c.font = header_font
    c.alignment = Alignment(horizontal="center" if col_idx == 1 else "left", vertical="center")
ws_strict.row_dimensions[1].height = 26

for idx, (sec, subcat, comm, src) in enumerate(strict_ag_rows, start=1):
    ws_strict.append([idx, sec, subcat, comm, src])
    r_num = idx + 1
    fill = zebra_fill if idx % 2 == 0 else white_fill
    for col_idx in range(1, 6):
        c = ws_strict.cell(row=r_num, column=col_idx)
        c.fill = fill
        c.font = bold_font if col_idx == 4 else reg_font
        c.border = thin_border
        c.alignment = Alignment(horizontal="center" if col_idx == 1 else "left", vertical="center")

for i, w in enumerate([8, 42, 34, 54, 38], start=1):
    ws_strict.column_dimensions[get_column_letter(i)].width = w

downloads_path = "C:/Users/ben.lefort/Downloads/OFA_AGM_Ontario_Agricultural_Commodities.xlsx"
project_path = "c:/Projects/Census Tool/OFA_AGM_Ontario_Agricultural_Commodities.xlsx"
wb.save(downloads_path)
wb.save(project_path)
print(f"Saved {len(SINGLE_COMMODITY_ROWS)} all-inclusive rows and {len(strict_ag_rows)} strictly traditional agriculture rows (excluded {len(NON_STRICT_AG_EXCLUSIONS)} non-traditional items) to:\n  1) {downloads_path}\n  2) {project_path}")
