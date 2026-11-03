import csv
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

# Master empirical compendium of every specific agricultural commodity commercially produced in Ontario
# Cross-referenced across:
# 1. Statistics Canada 2021 Census of Agriculture & Annual Fruit/Vegetable/Crop Surveys
# 2. Agricorp Production Insurance & AgriStability Insured Commodity Lists (Ontario)
# 3. OMAFRA "Specialty Cropportunities" (onspecialtycrops.ca) & World Crops Program
# 4. Foodland Ontario Availability & Produce Guides
# 5. Ontario Farm Products Marketing Commission (OFPMC) & Accredited Commodity Associations

ONTARIO_COMMODITIES = [
    # =========================================================================
    # 1. CEREAL GRAINS, ANCIENT GRAINS & PSEUDOCEREALS
    # =========================================================================
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Grain Corn (Yellow Dent)", "StatCan / Agricorp / GFO"),
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Food-Grade White & Non-GMO Corn", "Agricorp / GFO"),
    ("1. Grains, Cereals & Pseudocereals", "Specialty Corn", "Seed Corn", "Agricorp"),
    ("1. Grains, Cereals & Pseudocereals", "Specialty Corn", "Popping Corn (Popcorn)", "Agricorp / OMAFRA"),
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Soft Red Winter Wheat", "StatCan / Agricorp / GFO"),
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Soft White Winter Wheat", "Agricorp / GFO"),
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Hard Red Winter Wheat", "Agricorp / GFO"),
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Hard Red Spring Wheat", "StatCan / Agricorp / GFO"),
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Durum Wheat", "StatCan 32-10-0309-01"),
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Oats (Milling & Feed)", "StatCan / Agricorp / GFO"),
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Barley (Feed & Six-Row/Two-Row Malting)", "StatCan / Agricorp / GFO"),
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Fall Rye (Grain, Distilling & Cover)", "StatCan / Agricorp"),
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Spring Rye", "StatCan 32-10-0309-01"),
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Mixed Grains (Oats/Barley/Peas)", "StatCan / Agricorp"),
    ("1. Grains, Cereals & Pseudocereals", "Major Cereal Grains", "Triticale (Winter & Spring)", "StatCan 32-10-0309-01"),
    ("1. Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Spelt (Winter & Organic Spelt)", "Agricorp / OMAFRA"),
    ("1. Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Emmer (Farro)", "OMAFRA Specialty Cropportunities"),
    ("1. Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Einkorn", "OMAFRA Specialty Cropportunities"),
    ("1. Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Khorasan Wheat (Kamut)", "OMAFRA Specialty Cropportunities"),
    ("1. Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Buckwheat", "StatCan 32-10-0309-01 / OMAFRA"),
    ("1. Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Quinoa", "OMAFRA Specialty Cropportunities"),
    ("1. Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Grain Amaranth", "OMAFRA Specialty Cropportunities"),
    ("1. Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Millet (Proso, Pearl & Foxtail)", "OMAFRA"),
    ("1. Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Grain Sorghum & Sweet Sorghum", "OMAFRA"),
    ("1. Grains, Cereals & Pseudocereals", "Ancient & Specialty Grains", "Teff", "OMAFRA Specialty Cropportunities"),

    # =========================================================================
    # 2. OILSEEDS, PULSES, EDIBLE BEANS & PEANUTS
    # =========================================================================
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Soybeans", "Crushing & Feed Soybeans", "StatCan / Agricorp / GFO"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Soybeans", "Identity-Preserved (IP) Food-Grade Soybeans", "Agricorp / GFO"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Soybeans", "Tofu Soybeans", "Agricorp"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Soybeans", "Natto & Miso Soybeans", "Agricorp"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Oilseeds", "Canola (Spring & Winter Rapeseed)", "StatCan / Agricorp"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Oilseeds", "Sunflower Seed (Oilseed & Confectionary)", "StatCan / Agricorp"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Oilseeds", "Flaxseed (Linseed)", "StatCan / Agricorp"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Oilseeds", "Mustard Seed (Yellow, Brown & Oriental)", "StatCan / Agricorp"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Oilseeds", "Camelina", "OMAFRA Specialty Cropportunities"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Oilseeds", "Borage Seed (GLA Oilseed)", "OMAFRA Specialty Cropportunities"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "White Pea Beans (Navy Beans)", "StatCan / Agricorp / Ontario Bean Growers"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Dark Red Kidney Beans", "Agricorp / Ontario Bean Growers"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Light Red Kidney Beans", "Agricorp / Ontario Bean Growers"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "White Kidney Beans (Cannellini)", "Agricorp / Ontario Bean Growers"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Black Turtle Beans", "Agricorp / Ontario Bean Growers"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Cranberry Beans (Romano / Borlotti)", "Agricorp / Ontario Bean Growers"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Adzuki Beans", "Agricorp / Ontario Bean Growers"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Otebo Beans (Japanese White Beans)", "Agricorp / Ontario Bean Growers"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Pinto Beans", "Ontario Bean Growers"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Great Northern Beans", "Ontario Bean Growers"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Yellow Eye & Dutch Brown Beans", "Ontario Bean Growers"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Small Red & Heirloom Dry Beans", "Ontario Bean Growers"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Edible Dry Beans", "Mung Beans", "OMAFRA"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Pulses & Legumes", "Dry Field Peas (Yellow & Green)", "StatCan 32-10-0309-01"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Pulses & Legumes", "Faba Beans (Dry Broad Beans)", "StatCan 32-10-0309-01"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Pulses & Legumes", "Lentils", "StatCan 32-10-0309-01"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Pulses & Legumes", "Chickpeas (Garbanzo Beans)", "StatCan 32-10-0309-01"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Pulses & Legumes", "Sweet Lupins", "OMAFRA"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Peanuts & Tubers", "Peanuts (Valencia & Virginia-type)", "Agricorp / OMAFRA"),
    ("2. Oilseeds, Pulses, Dry Beans & Peanuts", "Peanuts & Tubers", "Tiger Nuts (Chufa)", "OMAFRA Specialty Cropportunities"),

    # =========================================================================
    # 3. FORAGES, HAY, PASTURE & BIOMASS / INDUSTRIAL FIELD CROPS
    # =========================================================================
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hay & Silage Forages", "Alfalfa & Alfalfa-Grass Mixtures", "StatCan 32-10-0309-01"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hay & Silage Forages", "Timothy Hay", "OMAFRA / Ontario Forage Council"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hay & Silage Forages", "Red, White, Alsike & Crimson Clover", "OMAFRA / Ontario Forage Council"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hay & Silage Forages", "Birdsfoot Trefoil", "OMAFRA / Ontario Forage Council"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hay & Silage Forages", "Orchardgrass, Bromegrass, Ryegrass & Fescue Hay", "OMAFRA / Ontario Forage Council"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hay & Silage Forages", "Corn Silage", "StatCan / Agricorp"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hay & Silage Forages", "Haylage / Baleage & Cereal Silage", "OMAFRA"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hay & Silage Forages", "Sorghum-Sudangrass Forage", "OMAFRA"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Forage Seed & Straw", "Pedigreed Forage & Turf Seed (Clover, Timothy, Trefoil)", "StatCan 32-10-0309-01"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Forage Seed & Straw", "Cereal Straw (Wheat, Barley & Oat Bedding/Mushroom Straw)", "StatCan 32-10-0366-01"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Sugar, Tobacco & Hops", "Sugar Beets", "StatCan / Agricorp"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Sugar, Tobacco & Hops", "Flue-Cured Virginia Tobacco", "StatCan / Agricorp / OFCTGMB"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Sugar, Tobacco & Hops", "Burley & Dark Air-Cured / Fire-Cured Tobacco", "Agricorp / OMAFRA"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Sugar, Tobacco & Hops", "Hops (Aroma & Bittering Varieties)", "OMAFRA / OHGA"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hemp, Cannabis & Biomass", "Industrial Hemp (Grain, Fibre & CBD)", "StatCan / Agricorp"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hemp, Cannabis & Biomass", "Cannabis (Licensed Open-Field Cultivation)", "StatCan 32-10-0384-01"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hemp, Cannabis & Biomass", "Miscanthus (Biomass / Bedding / Fibre)", "OMAFRA Specialty Cropportunities"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hemp, Cannabis & Biomass", "Switchgrass (Biomass / Livestock Bedding)", "OMAFRA Specialty Cropportunities"),
    ("3. Forages, Hay, Industrial & Biomass Crops", "Hemp, Cannabis & Biomass", "Fibre Flax", "OMAFRA Specialty Cropportunities"),

    # =========================================================================
    # 4. TREE FRUITS, BERRIES, GRAPES & TREE NUTS
    # =========================================================================
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Apples (Fresh Market, Cider & Processing)", "StatCan / Agricorp / OAG"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Peaches (Fresh Market & Processing)", "StatCan / Agricorp / OTFG"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Nectarines", "StatCan 32-10-0364-01 / Agricorp"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Pears (Bartlett, Bosc, Anjou & Asian Pears)", "StatCan / Agricorp / OTFG"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Plums & Prune Plums (European & Japanese)", "StatCan / Agricorp / OTFG"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Sour / Tart Cherries", "StatCan / Agricorp / OTFG"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Sweet Cherries", "StatCan / Agricorp / OTFG"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Apricots", "StatCan 32-10-0315-01 / OTFG"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Pawpaws (North American Pawpaw)", "OMAFRA Specialty Cropportunities"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Orchard Tree Fruits", "Quinces, Mulberries & Medlars", "OMAFRA Specialty Cropportunities"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Grapes & Vineyards", "Vinifera Wine Grapes (Chardonnay, Riesling, Cabernet Franc, Pinot Noir, etc.)", "StatCan / Agricorp / GGO"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Grapes & Vineyards", "French Hybrid Wine Grapes (Vidal, Baco Noir, Marquette, Frontenac)", "StatCan / Agricorp / GGO"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Grapes & Vineyards", "Icewine Grapes", "Grape Growers of Ontario (GGO)"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Grapes & Vineyards", "Labrusca Table & Juice Grapes (Concord, Niagara, Sovereign Coronation)", "StatCan 32-10-0364-01 / GGO"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Strawberries (June-Bearing, Day-Neutral & Ever-Bearing)", "StatCan / Agricorp / BGO"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Red, Black & Golden Raspberries", "StatCan 32-10-0315-01 / BGO"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Highbush Blueberries (Cultivated)", "StatCan 32-10-0315-01 / BGO"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Lowbush Blueberries (Wild)", "StatCan 32-10-0315-01"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Cranberries", "StatCan 32-10-0315-01 / 0364-01"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Blackberries & Bramble Hybrids (Tayberries, Boysenberries)", "StatCan 32-10-0364-01 / OMAFRA"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Haskaps (Honeyberries)", "StatCan 32-10-0315-01 / OMAFRA"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Blackcurrants, Redcurrants & Whitecurrants", "StatCan 32-10-0315-01"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Saskatoon Berries", "StatCan 32-10-0315-01"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Gooseberries & Jostaberries", "OMAFRA Specialty Cropportunities"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Elderberries", "OMAFRA Specialty Cropportunities"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Sea Buckthorn Berries", "OMAFRA Specialty Cropportunities"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Goji Berries (Wolfberries)", "OMAFRA Specialty Cropportunities"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Hardy Kiwi (Kiwi Berries / Actinidia arguta)", "OMAFRA Specialty Cropportunities"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Aronia Berries (Black Chokeberries)", "OMAFRA Specialty Cropportunities"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Berries & Small Fruits", "Ground Cherries (Cape Gooseberries / Physalis)", "OMAFRA Specialty Cropportunities"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Tree Nuts", "Hazelnuts (Filberts)", "OMAFRA / Ontario Hazelnut Association"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Tree Nuts", "English / Persian Walnuts", "OMAFRA / SONGA"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Tree Nuts", "Black Walnuts", "OMAFRA Specialty Cropportunities"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Tree Nuts", "Heartnuts (Japanese Walnuts)", "OMAFRA Specialty Cropportunities"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Tree Nuts", "Sweet Chestnuts", "OMAFRA Specialty Cropportunities"),
    ("4. Fruits, Berries, Grapes & Tree Nuts", "Tree Nuts", "Northern Pecans & Shagbark Hickory Nuts", "OMAFRA / SONGA"),

    # =========================================================================
    # 5. FIELD VEGETABLES, MELONS, ROOTS & WORLD / ETHNOCULTURAL VEGETABLES
    # =========================================================================
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Potatoes (Table, Chipping, French Fry & Seed)", "StatCan / Agricorp / OPB"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Sweet Potatoes", "StatCan 32-10-0365-01 / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Carrots (Fresh Topped, Cello, Baby & Processing)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Dry Onions (Yellow Cooking, Red, White & Spanish)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Set, Seed, Cipollini & Pickling/Pearl Onions", "Agricorp / Foodland Ontario"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Green Onions (Scallions) & French Shallots", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Garlic (Hardneck, Softneck, Elephant Garlic & Garlic Scapes)", "StatCan / Agricorp / GGAO"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Leeks", "StatCan 32-10-0365-01 / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Red, Golden & Chioggia Beets (Fresh & Processing)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Rutabagas (Swedes / Waxed Table Turnips)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "White & Purple-Top Turnips", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Parsnips", "StatCan 32-10-0365-01 / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Radishes (Red Globe, French Breakfast & Watermelon Radish)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Asian Radishes (Daikon / Lo Bok)", "StatCan 32-10-0365-01"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Celeriac (Celery Root)", "Agricorp / Foodland Ontario"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Horseradish", "OMAFRA"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Jerusalem Artichokes (Sunchokes)", "OMAFRA Specialty Cropportunities"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Burdock Root (Gobo) & Salsify", "OMAFRA Specialty Cropportunities"),
    ("5. Field Vegetables, Melons & World Crops", "Root, Tuber & Bulb Crops", "Fresh Ginger & Turmeric (High-Tunnel / Protected)", "OMAFRA Specialty Cropportunities"),
    ("5. Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Broccoli (Crown & Bunched)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Cauliflower (White, Purple, Orange & Romanesco)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Green, Red & Savoy Cabbage (Fresh & Kraut Processing)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Napa Cabbage (Chinese Heading Cabbage)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Bok Choy & Shanghai Pak Choy", "StatCan / OMAFRA"),
    ("5. Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Gai Lan (Chinese Broccoli) & Yu Choy", "OMAFRA Specialty Cropportunities"),
    ("5. Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Brussels Sprouts", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Kale (Curly, Lacinato/Tuscan & Red Russian)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Kohlrabi", "Foodland Ontario / OMAFRA"),
    ("5. Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Rapini (Broccoli Rabe)", "Foodland Ontario / OMAFRA"),
    ("5. Field Vegetables, Melons & World Crops", "Brassicas & Crucifers", "Collard Greens & Mustard Greens", "OMAFRA Specialty Cropportunities"),
    ("5. Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Veg", "Asparagus (Green, White & Purple)", "StatCan / Agricorp / AFO"),
    ("5. Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Veg", "Celery", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Veg", "Rhubarb (Field & Winter Forced)", "StatCan / Foodland Ontario"),
    ("5. Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Veg", "Lettuce (Iceberg, Romaine, Butterhead, Red/Green Leaf)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Veg", "Mesclun, Baby Salad Greens & Spring Mix", "Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Veg", "Spinach & Baby Spinach", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Veg", "Swiss Chard (Green & Rainbow)", "Foodland Ontario / OMAFRA"),
    ("5. Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Veg", "Arugula, Tatsoi, Mizuna & Watercress", "OMAFRA"),
    ("5. Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Veg", "Endive, Escarole, Frisée & Radicchio", "Foodland Ontario / OMAFRA"),
    ("5. Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Veg", "Belgian Endive (Witloof Chicory) & Dandelion Greens", "OMAFRA"),
    ("5. Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Veg", "Florence Fennel (Bulb Fennel) & Artichokes", "OMAFRA"),
    ("5. Field Vegetables, Melons & World Crops", "Leafy, Stalk & Perennial Veg", "Callaloo (Amaranth Greens), Water Spinach (Ong Choy) & Malabar Spinach", "OMAFRA World Crops"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Sweet Corn (Fresh Market & Canning/Freezing)", "StatCan / Agricorp / OPVG"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Field Tomatoes (Fresh Market & Processing Roma/Paste)", "StatCan / Agricorp / OPVG"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Sweet Peppers (Bell, Shepherd, Cubanelle & Banana)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Hot & Specialty Chili Peppers (Jalapeño, Habanero, Scotch Bonnet, Poblano, Cayenne, Thai)", "Agricorp / OMAFRA World Crops"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Eggplants (Globe, Italian, Indian/Bhartha, Chinese/Japanese & African Garden Egg)", "StatCan 32-10-0365-01 / Agricorp / OMAFRA"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Tomatillos", "OMAFRA World Crops"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Okra", "OMAFRA World Crops"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Green Peas (Processing Shelling, Fresh Snow Peas & Sugar Snap Peas)", "StatCan / Agricorp / OPVG"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Green, Yellow Wax, Romano & Flat Italian Beans", "StatCan / Agricorp / OPVG"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Lima Beans (Processing & Fresh)", "Agricorp / OPVG"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Broad Beans (Fresh Fava Beans)", "Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Edamame (Fresh Vegetable Soybeans)", "OMAFRA Specialty Cropportunities"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Yardlong Beans (Chinese Long / Asparagus Beans)", "OMAFRA World Crops"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Field Cucumbers (Slicing, Pickling & Gherkins)", "StatCan / Agricorp / OPVG"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Pumpkins (Carving, Pie/Processing & Giant/Ornamental)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Summer Squash (Green/Gold Zucchini, Pattypan & Crookneck)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Winter Squash (Butternut, Acorn, Buttercup, Kabocha, Spaghetti, Hubbard, Delicata)", "StatCan / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Fruiting, Legume & Vine Veg", "Asian & Tropical Gourds (Bitter Melon/Karela, Bottle Gourd/Lauki, Wax Gourd, Luffa, Chayote)", "OMAFRA World Crops"),
    ("5. Field Vegetables, Melons & World Crops", "Melons", "Watermelons (Seeded, Seedless & Personal/Mini)", "StatCan 32-10-0365-01 / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Melons", "Cantaloupes (Muskmelons)", "StatCan 32-10-0365-01 / Agricorp"),
    ("5. Field Vegetables, Melons & World Crops", "Melons", "Honeydew, Canary, Galia & Korean Melons", "StatCan 32-10-0365-01 / OMAFRA"),

    # =========================================================================
    # 6. MEDICINAL ROOTS, CULINARY HERBS, AROMATICS & ESSENTIAL OILS
    # =========================================================================
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "North American Ginseng (Panax quinquefolius)", "StatCan 32-10-0309-01 / OGGA"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "Goldenseal", "OMAFRA Specialty Cropportunities"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "Echinacea (Purple Coneflower)", "OMAFRA Specialty Cropportunities"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "Valerian, St. John's Wort, Calendula &Feverfew", "OMAFRA Specialty Cropportunities"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "Chamomile (German & Roman) & Lemon Balm", "OMAFRA Specialty Cropportunities"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Medicinal Roots & Botanicals", "Stevia", "OMAFRA Specialty Cropportunities"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Aromatic & Essential Oil Crops", "Lavender (English & Lavandin — Fresh, Dried & Essential Oil)", "OMAFRA / Ontario Lavender Association"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Aromatic & Essential Oil Crops", "Peppermint & Spearmint (Fresh & Distilled Essential Oil)", "OMAFRA Specialty Cropportunities"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Parsley (Curly & Italian Flat-Leaf)", "StatCan 32-10-0365-01 / OMAFRA"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Basil (Sweet Genovese, Thai, Purple & Holy/Tulsi)", "StatCan / OMAFRA"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Cilantro (Coriander Leaf) & Coriander Seed", "StatCan / OMAFRA"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Dill (Baby Dill Weed, Pickling Dill & Dill Seed)", "StatCan / OMAFRA"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Oregano, Marjoram, Thyme, Rosemary & Sage", "StatCan / OMAFRA"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Chives (Common & Garlic Chives), Tarragon, Chervil & Sorrel", "OMAFRA"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Lemongrass & Fenugreek (Methi)", "OMAFRA World Crops"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Caraway, Cumin, Nigella & Fennel Seed", "OMAFRA Specialty Cropportunities"),
    ("6. Ginseng, Herbs, Spices & Essential Oils", "Culinary Herbs & Spices", "Saffron", "OMAFRA Specialty Cropportunities"),

    # =========================================================================
    # 7. CONTROLLED ENVIRONMENT (GREENHOUSE) & MUSHROOMS
    # =========================================================================
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse Tomatoes (Beefsteak, Tomato-on-the-Vine, Roma, Cocktail, Cherry, Grape)", "StatCan 32-10-0360-01 / OGVG"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse Sweet Bell & Mini Peppers (Red, Yellow, Orange)", "StatCan 32-10-0360-01 / OGVG"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse Cucumbers (Long English Seedless, Mini/Persian, Cocktail)", "StatCan 32-10-0360-01 / OGVG"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse Strawberries (Winter & Year-Round Controlled Environment)", "StatCan 32-10-0360-01 / OGVG"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse / Vertical-Farm Hydroponic Lettuce & Leafy Greens", "StatCan 32-10-0360-01"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse Eggplants", "StatCan 32-10-0360-01"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Greenhouse Culinary Herbs (Potted & Fresh-Cut)", "StatCan 32-10-0360-01"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Fruits & Vegetables", "Microgreens, Wheatgrass & Edible Sprouts (Bean, Alfalfa, Broccoli, Radish)", "OMAFRA"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Greenhouse Propagation", "Commercial Vegetable Transplants (Tomato, Pepper, Brassica Plugs)", "StatCan 32-10-0360-01"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Indoor & Greenhouse Cannabis", "Licensed Cannabis Grown Under Cover (Medical & Recreational)", "StatCan 32-10-0384-01"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "White Button Mushrooms (Agaricus bisporus)", "StatCan 32-10-0361-01 / Mushrooms Canada"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Cremini (Baby Bella / Brown) Mushrooms", "StatCan 32-10-0361-01 / Mushrooms Canada"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Portobello Mushrooms", "StatCan 32-10-0361-01 / Mushrooms Canada"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Shiitake Mushrooms (Bag- & Log-Grown)", "StatCan 32-10-0361-01"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Oyster Mushrooms (Pearl, Blue, Pink, Golden & King Oyster)", "StatCan 32-10-0361-01"),
    ("7. Greenhouse Produce, Indoor Cannabis & Mushrooms", "Mushrooms", "Lion's Mane, Maitake, Enoki, Chestnut, Beech & Reishi Mushrooms", "StatCan 32-10-0361-01"),

    # =========================================================================
    # 8. FLORICULTURE, NURSERY STOCK, TURFGRASS SOD & CHRISTMAS TREES
    # =========================================================================
    ("8. Floriculture, Nursery, Sod & Christmas Trees", "Greenhouse & Field Cut Flowers", "Cut Flowers (Roses, Chrysanthemums, Tulips, Lilies, Gerbera, Alstroemeria, Snapdragons, Peonies, Dahlias)", "StatCan 32-10-0360-01 / Flowers Canada"),
    ("8. Floriculture, Nursery, Sod & Christmas Trees", "Potted & Bedding Plants", "Potted Flowering Plants (Poinsettias, Orchids, Hydrangeas, Easter Lilies, Potted Mums, Azaleas)", "StatCan 32-10-0360-01 / Flowers Canada"),
    ("8. Floriculture, Nursery, Sod & Christmas Trees", "Potted & Bedding Plants", "Annual Bedding Plants, Hanging Baskets & Patio Planters (Geraniums, Petunias, Begonias, Impatiens)", "StatCan 32-10-0360-01 / Flowers Canada"),
    ("8. Floriculture, Nursery, Sod & Christmas Trees", "Potted & Bedding Plants", "Tropical & Indoor Foliage Houseplants", "StatCan 32-10-0360-01"),
    ("8. Floriculture, Nursery, Sod & Christmas Trees", "Nursery & Landscape Stock", "Deciduous Shade & Flowering Ornamental Trees", "StatCan 32-10-0357-01 / Landscape Ontario"),
    ("8. Floriculture, Nursery, Sod & Christmas Trees", "Nursery & Landscape Stock", "Coniferous / Evergreen Landscape Trees & Hedging (Cedar, Spruce, Pine)", "StatCan 32-10-0357-01 / Landscape Ontario"),
    ("8. Floriculture, Nursery, Sod & Christmas Trees", "Nursery & Landscape Stock", "Ornamental Shrubs, Roses & Climbing Vines", "StatCan 32-10-0357-01 / Landscape Ontario"),
    ("8. Floriculture, Nursery, Sod & Christmas Trees", "Nursery & Landscape Stock", "Herbaceous Perennials, Hostas & Ornamental Grasses", "StatCan 32-10-0357-01 / Landscape Ontario"),
    ("8. Floriculture, Nursery, Sod & Christmas Trees", "Nursery & Landscape Stock", "Fruit Trees, Berry Cane/Crown Stock & Grapevine Nursery Stock", "StatCan 32-10-0357-01"),
    ("8. Floriculture, Nursery, Sod & Christmas Trees", "Nursery & Landscape Stock", "Reforestation Seedlings & Native Ecological Restoration Plants", "StatCan 32-10-0357-01"),
    ("8. Floriculture, Nursery, Sod & Christmas Trees", "Turfgrass Sod", "Cultivated Turfgrass Sod (Kentucky Bluegrass, Fine Fescue, Perennial Ryegrass & Bentgrass)", "StatCan 32-10-0357-01 / NSGA"),
    ("8. Floriculture, Nursery, Sod & Christmas Trees", "Christmas Trees", "Christmas Trees & Evergreen Boughs (Fraser Fir, Balsam Fir, Canaan Fir, White/Blue Spruce, Scotch/White Pine)", "StatCan 32-10-0249-01 / CFOA"),

    # =========================================================================
    # 9. MAPLE SYRUP, APICULTURE (HONEYBEES) & TREE SYRUPS
    # =========================================================================
    ("9. Maple Products, Honeybees & Pollination", "Maple & Tree Syrups", "Maple Syrup (Golden, Amber, Dark & Very Dark)", "StatCan 32-10-0362-01 / OMSPA"),
    ("9. Maple Products, Honeybees & Pollination", "Maple & Tree Syrups", "Maple Sugar, Maple Butter (Cream), Maple Taffy & Maple Sap Water", "StatCan 32-10-0354-01 / OMSPA"),
    ("9. Maple Products, Honeybees & Pollination", "Maple & Tree Syrups", "Birch Syrup & Black Walnut Tree Syrup", "OMAFRA Specialty Forest Products"),
    ("9. Maple Products, Honeybees & Pollination", "Apiculture & Bee Products", "Honey (Liquid, Creamed, Comb, Wildflower, Clover, Buckwheat, Basswood)", "StatCan 32-10-0378-01 / OBA"),
    ("9. Maple Products, Honeybees & Pollination", "Apiculture & Bee Products", "Beeswax, Bee Pollen, Propolis & Royal Jelly", "Ontario Beekeepers' Association (OBA)"),
    ("9. Maple Products, Honeybees & Pollination", "Apiculture & Bee Products", "Queen Honeybees, Nucleus Colonies (Nucs) & Packaged Bees", "Ontario Beekeepers' Association (OBA)"),
    ("9. Maple Products, Honeybees & Pollination", "Commercial Pollinators", "Commercial Pollination Bees (Honeybees, Bumblebees & Alfalfa Leafcutter Bees)", "StatCan 32-10-0378-01"),

    # =========================================================================
    # 10. CATTLE (DAIRY, BEEF, VEAL), SWINE, SHEEP & GOATS
    # =========================================================================
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Dairy Cattle & Milk", "Cow's Milk & Cream (Fluid Milk & Industrial Milk for Cheese, Butter, Yogurt, Ice Cream)", "StatCan 32-10-0370-01 / DFO"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Dairy Cattle & Milk", "Specialty Cow's Milk (Certified Organic, Grass-Fed, A2 Protein, Jersey/Guernsey)", "Dairy Farmers of Ontario (DFO)"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Dairy Cattle & Milk", "Purebred Dairy Breeding Cattle, Replacement Heifers, Bull Semen & Embryos", "StatCan 32-10-0370-01"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Beef & Veal Cattle", "Beef Cattle — Cow-Calf, Stocker/Backgrounder & Fed Steers/Heifers", "StatCan 32-10-0370-01 / BFO"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Beef & Veal Cattle", "Purebred Beef Seedstock (Angus, Charolais, Simmental, Hereford, Limousin, Shorthorn, Speckle Park, Wagyu)", "Beef Farmers of Ontario (BFO)"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Beef & Veal Cattle", "Grain-Fed & Milk-Fed Veal Cattle (plus Dairy-Beef Cross Calves)", "StatCan 32-10-0370-01 / VFO"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Swine & Pork", "Market Hogs (Pork)", "StatCan 32-10-0372-01 / Ontario Pork"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Swine & Pork", "Weaner / Nursery Pigs, Feeder Pigs, Suckling/Roaster Pigs & Breeding Swine Genetics", "StatCan 32-10-0372-01 / Ontario Pork"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Sheep, Lamb, Milk & Wool", "Market Lambs (Heavy Lamb, New-Crop / Milk-Fed Lamb & Mutton)", "StatCan 32-10-0371-01 / OSF"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Sheep, Lamb, Milk & Wool", "Sheep Milk (for Pecorino/Manchego-Style Artisan Cheeses & Yogurt)", "Ontario Sheep Farmers (OSF) / ODGA"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Sheep, Lamb, Milk & Wool", "Raw Sheep Wool, Fleeces & Lanolin", "Canadian Co-operative Wool Growers / OSF"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Goats (Milk, Meat & Fibre)", "Goat Milk (Fluid, Feta, Chèvre, Goat Butter, Ice Cream & Infant Formula)", "StatCan 32-10-0373-01 / Ontario Goat"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Goats (Milk, Meat & Fibre)", "Meat Goats (Chevon & Cabrito / Kid Goat Meat)", "StatCan 32-10-0373-01 / Ontario Goat"),
    ("10. Dairy, Beef, Veal, Pork, Sheep & Goats", "Goats (Milk, Meat & Fibre)", "Mohair & Cashmere Fibre (Angora & Cashmere Goats)", "Ontario Goat"),

    # =========================================================================
    # 11. POULTRY, EGGS, WATERFOWL & SPECIALTY GAME BIRDS
    # =========================================================================
    ("11. Poultry, Eggs, Waterfowl & Game Birds", "Chicken & Turkey Meat", "Broiler Chickens, Roaster Chickens & Cornish Game Hens", "StatCan 32-10-0374-01 / CFO"),
    ("11. Poultry, Eggs, Waterfowl & Game Birds", "Chicken & Turkey Meat", "Specialty Chickens (Artisanal, Taiwan/Silkie, Organic, Free-Range & Halal)", "Chicken Farmers of Ontario (CFO)"),
    ("11. Poultry, Eggs, Waterfowl & Game Birds", "Chicken & Turkey Meat", "Turkeys (Broiler Turkeys, Heavy Hens & Heavy Toms)", "StatCan 32-10-0374-01 / TFO"),
    ("11. Poultry, Eggs, Waterfowl & Game Birds", "Eggs & Hatcheries", "Chicken Table Eggs (White, Brown, Free-Run, Free-Range, Enriched, Organic, Omega-3)", "StatCan 32-10-0376-01 / EFO"),
    ("11. Poultry, Eggs, Waterfowl & Game Birds", "Eggs & Hatcheries", "Broiler, Layer & Turkey Hatching Eggs", "StatCan 32-10-0376-01 / OBHEPA"),
    ("11. Poultry, Eggs, Waterfowl & Game Birds", "Eggs & Hatcheries", "Day-Old Chicks, Poults, Ducklings & Ready-to-Lay Pullets", "StatCan 32-10-0377-01"),
    ("11. Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Ducks (Pekin, Muscovy, Moulard — Meat, Down Feathers & Duck Eggs)", "StatCan 32-10-0374-01"),
    ("11. Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Geese (Meat, Down Feathers & Breeding Stock)", "StatCan 32-10-0374-01"),
    ("11. Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Quail (Coturnix Quail Meat & Quail Eggs)", "StatCan 32-10-0374-01 / OMAFRA"),
    ("11. Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Ring-Necked Pheasants & Chukar Partridges", "StatCan 32-10-0374-01 / OMAFRA"),
    ("11. Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Guinea Fowl & Squab (Utility Meat Pigeons)", "StatCan 32-10-0374-01 / OMAFRA"),
    ("11. Poultry, Eggs, Waterfowl & Game Birds", "Waterfowl & Game Birds", "Ratites (Ostriches, Emus & Rheas — Meat, Leather, Oil & Eggs)", "StatCan 32-10-0374-01 / OMAFRA"),

    # =========================================================================
    # 12. EQUINE, SPECIALTY LIVESTOCK, AQUACULTURE & ALTERNATIVE PROTEINS
    # =========================================================================
    ("12. Equine, Specialty Livestock & Aquaculture", "Equine", "Horses & Ponies (Standardbred, Thoroughbred, Quarter Horse, Warmblood, Draft Horses)", "StatCan 32-10-0373-01 / Equine Guelph"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Equine", "Donkeys, Mules & Hinnies", "StatCan 32-10-0373-01"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "Alpacas & Llamas (Huacaya & Suri Alpaca Fibre, Breeding & Guardian Stock)", "StatCan 32-10-0373-01 / Alpaca Ontario"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "North American Bison (Buffalo Meat & Breeding Stock)", "StatCan 32-10-0373-01 / OBA"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "Water Buffalo (Water Buffalo Milk for Mozzarella di Bufala & Meat)", "OMAFRA / Ontario Water Buffalo"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "Elk / Wapiti (Venison Meat & Antler Velvet)", "StatCan 32-10-0373-01"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "Farmed Deer (Red Deer, Fallow Deer & White-Tailed Deer Venison)", "StatCan 32-10-0373-01"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Camelids, Bison & Cervids", "Farmed Wild Boar", "OMAFRA"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Rabbits & Fur-Bearing", "Rabbits (Meat Rabbits, Breeding Stock & Angora Wool Rabbits)", "StatCan 32-10-0373-01 / ORBA"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Rabbits & Fur-Bearing", "Mink & Chinchillas (Fur Pelts)", "StatCan 32-10-0373-01"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Rainbow Trout (Net-Pen & Land-Based Aquaculture)", "OMAFRA / Ontario Aquaculture Association"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Arctic Char & Brook (Speckled) Trout", "OMAFRA / Ontario Aquaculture Association"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Tilapia & Barramundi (Indoor Recirculating Aquaculture)", "OMAFRA / Ontario Aquaculture Association"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Coho & Atlantic Salmon (Land-Based Recirculating Aquaculture)", "OMAFRA / Ontario Aquaculture Association"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Largemouth Bass, Smallmouth Bass, Yellow Perch & Walleye (Pickerel)", "OMAFRA / Ontario Aquaculture Association"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Pacific Whiteleg Shrimp (Indoor Land-Based Shrimp Aquaculture)", "OMAFRA / Ontario Seafood Farmers"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Aquaculture (Fish & Shrimp)", "Baitfish, Minnows, Koi & Ornamental Pond Fish", "OMAFRA"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Insects, Vermiculture & Bioenergy", "Edible & Feed Insects (Crickets, Mealworms & Black Soldier Fly Larvae)", "OMAFRA"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Insects, Vermiculture & Bioenergy", "Earthworms (Bait Worms, Vermiculture & Worm Castings)", "OMAFRA"),
    ("12. Equine, Specialty Livestock & Aquaculture", "Insects, Vermiculture & Bioenergy", "On-Farm Renewable Bioenergy (Biogas / RNG, Biomethane & Biomass)", "StatCan 32-10-0380-01"),
]

# Also extract an A-to-Z flat list of individual named commodities (splitting grouped lines into distinct individual commodities for the AGM Program Wall)
INDIVIDUAL_AGM_NAMES = [
    # Grains & Cereals
    "Alfalfa", "Alsike Clover", "Amaranth (Grain)", "Amaranth Greens (Callaloo)", "Anjou Pears",
    "Apples (Cider)", "Apples (Fresh & Processing)", "Apricots", "Arctic Char", "Aronia Berries (Chokeberries)",
    "Artichokes (Globe)", "Arugula", "Asian Pears", "Asian Radishes (Daikon / Lo Bok)", "Asparagus (Green, White & Purple)",
    "Atlantic Salmon (Land-Based)", "Azaleas (Potted)",
    # B
    "Baby Salad Greens (Mesclun)", "Baco Noir Grapes", "Baitfish & Minnows", "Balsam Fir Christmas Trees",
    "Banana Peppers", "Barley (Feed & Malting)", "Barramundi", "Bartlett Pears", "Basil (Sweet, Thai & Holy)",
    "Bass (Largemouth & Smallmouth)", "Bedding Plants (Annuals)", "Bee Pollen", "Beech Mushrooms (Shimeji)",
    "Beef Cattle (Cow-Calf & Feedlot)", "Beef Seedstock (Purebred)", "Beeswax", "Beets (Red, Golden & Chioggia)",
    "Belgian Endive (Witloof Chicory)", "Bell Peppers (Field & Greenhouse)", "Bentgrass Sod", "Birch Syrup",
    "Birdsfoot Trefoil", "Bison (North American Buffalo)", "Bitter Melon (Karela)", "Black Beans (Turtle Beans)",
    "Black Currants", "Black Soldier Fly Larvae", "Black Walnuts", "Black Walnut Syrup", "Blackberries",
    "Blue Spruce Christmas Trees", "Blueberries (Highbush Cultivated)", "Blueberries (Lowbush Wild)", "Bok Choy (Pak Choy)",
    "Borage Seed", "Bosc Pears", "Bottle Gourd (Lauki / Calabash)", "Boysenberries", "Broccoli",
    "Broccoli Rabe (Rapini)", "Broiler Chickens", "Broiler Hatching Eggs", "Bromegrass Hay", "Brook (Speckled) Trout",
    "Brussels Sprouts", "Buckwheat", "Bumblebees (Commercial Pollination)", "Burdock Root (Gobo)", "Burley Tobacco",
    "Buttercup Squash", "Butternut Squash",
    # C
    "Cabbage (Green, Red & Savoy)", "Cabernet Franc Grapes", "Calendula", "Callaloo", "Camelina",
    "Canaan Fir Christmas Trees", "Canola (Spring & Winter)", "Cantaloupes (Muskmelons)", "Caraway Seed", "Carrots",
    "Cashmere Fibre", "Cauliflower", "Cayenne Peppers", "Cedar Hedging & Nursery Stock", "Celeriac (Celery Root)",
    "Celery", "Chamomile", "Chardonnay Grapes", "Chayote", "Cherries (Sour / Tart)",
    "Cherries (Sweet)", "Chestnut Mushrooms", "Chestnuts (Sweet)", "Chevon (Goat Meat)", "Chickpeas (Garbanzo Beans)",
    "Chicory", "Chinchillas", "Chinese Broccoli (Gai Lan)", "Chinese Cabbage (Napa)", "Chinese Eggplants",
    "Chives & Garlic Chives", "Christmas Trees", "Chrysanthemums (Cut & Potted)", "Chukar Partridges", "Cilantro (Coriander)",
    "Cipollini Onions", "Clover Hay (Red, White & Crimson)", "Cocktail & Cherry Tomatoes", "Coho Salmon (Land-Based)", "Collard Greens",
    "Concord Grapes", "Coniferous Landscape Trees", "Corn (Grain)", "Corn (Popping / Popcorn)", "Corn (Seed)",
    "Corn (Silage)", "Corn (Sweet — Fresh & Processing)", "Corn (White Food-Grade)", "Cornish Game Hens", "Cranberries",
    "Cranberry Beans (Romano)", "Cream & Fluid Milk", "Cremini (Baby Bella) Mushrooms", "Crickets (Edible & Feed Protein)", "Crookneck Squash",
    "Cubanelle Peppers", "Cucumbers (Field Slicing & Pickling)", "Cucumbers (Greenhouse English & Mini)", "Cumin", "Cut Flowers",
    # D
    "Dahlias", "Dairy Cattle & Milk", "Dairy Replacement Heifers", "Dandelion Greens", "Dark Air-Cured & Fire-Cured Tobacco",
    "Day-Old Chicks & Poults", "Deciduous Shade & Ornamental Trees", "Deer (Farmed Red, Fallow & White-Tailed)", "Delicata Squash", "Dill (Weed & Seed)",
    "Donkeys", "Draft Horses", "Dry Field Peas (Yellow & Green)", "Duck Eggs", "Ducks (Pekin, Muscovy & Moulard)",
    "Durum Wheat", "Dutch Brown Beans",
    # E
    "Earthworms & Worm Castings", "Easter Lilies", "Echinacea", "Edamame (Fresh Vegetable Soybeans)", "Eggplants (Field & Greenhouse)",
    "Eggs (Chicken Table — White, Brown, Free-Run, Free-Range, Enriched, Organic, Omega-3)", "Einkorn", "Elderberries", "Elephant Garlic", "Elk (Wapiti — Venison & Antler Velvet)",
    "Emmer (Farro)", "Emus", "Endive & Escarole", "English Walnuts (Persian)", "Enoki Mushrooms",
    # F
    "Faba Beans (Dry & Fresh Broad Beans)", "Fall Rye", "Feeder & Weaner Pigs", "Fennel (Florence Bulb & Seed)", "Fenugreek (Methi)",
    "Fescue Turf Sod", "Fibre Flax", "Flaxseed (Linseed)", "Flue-Cured Virginia Tobacco", "Forage Seed",
    "Fraser Fir Christmas Trees", "French Hybrid Wine Grapes", "French Shallots", "Fruit Tree Nursery Stock",
    # G
    "Garlic & Garlic Scapes", "Geese", "Geraniums & Bedding Annuals", "Gerbera Daisies", "Gherkins",
    "Ginger (Fresh High-Tunnel)", "Ginseng (North American)", "Goat Milk & Artisan Goat Cheese", "Goats (Dairy & Meat)", "Goji Berries",
    "Goldenseal", "Gooseberries", "Gourds (Ornamental & Edible)", "Grapevine Nursery Stock", "Great Northern Beans",
    "Green Beans (Bush & Pole)", "Green Onions (Scallions)", "Green Peas (Fresh & Processing)", "Greenhouse Cucumbers", "Greenhouse Herbs",
    "Greenhouse Lettuce & Hydroponic Greens", "Greenhouse Peppers", "Greenhouse Strawberries", "Greenhouse Tomatoes", "Ground Cherries (Cape Gooseberries)",
    "Guinea Fowl",
    # H
    "Habanero Peppers", "Hanging Baskets", "Hard Red Spring Wheat", "Hard Red Winter Wheat", "Hardy Kiwi (Kiwi Berries)",
    "Haskaps (Honeyberries)", "Hatching Eggs (Broiler, Layer & Turkey)", "Hay & Haylage", "Hazelnuts (Filberts)", "Heartnuts",
    "Hemp (Industrial Grain, Fibre & CBD)", "Herbaceous Perennials", "Hickory Nuts (Shagbark)", "Honey (Liquid, Creamed, Comb & Varietal)", "Honeybees (Colonies, Queens & Nucs)",
    "Honeydew Melons", "Hops", "Horseradish", "Horses & Ponies", "Houseplants (Tropical Foliage)",
    "Hubbard Squash", "Hydrangeas",
    # I - L
    "Icewine Grapes", "Identity-Preserved (IP) Soybeans", "Indian Eggplants", "Jalapeño Peppers", "Jerusalem Artichokes (Sunchokes)",
    "Jostaberries", "Kabocha Squash", "Kale (Curly, Lacinato & Red)", "Kamut (Khorasan Wheat)", "Kentucky Bluegrass Sod",
    "Kidney Beans (Dark Red, Light Red & White)", "King Oyster Mushrooms", "Kohlrabi", "Koi & Ornamental Pond Fish", "Labrusca Grapes",
    "Lambs (Market & Milk-Fed)", "Lavender (Fresh, Dried & Essential Oil)", "Leafcutter Bees (Pollination)", "Leeks", "Lemon Balm",
    "Lemongrass", "Lentils", "Lettuce (Iceberg, Romaine, Butterhead & Leaf)", "Lilies (Cut & Potted)", "Lima Beans",
    "Lion's Mane Mushrooms", "Llamas", "Luffa (Sponge / Ridge Gourd)", "Lupins (Sweet)",
    # M - O
    "Maitake Mushrooms", "Malabar Spinach", "Maple Butter, Sugar & Taffy", "Maple Sap Water", "Maple Syrup",
    "Market Hogs (Pork)", "Mealworms", "Melons (Cantaloupe, Honeydew, Canary, Korean)", "Microgreens", "Millet",
    "Mink", "Mint (Peppermint & Spearmint)", "Miscanthus (Biomass & Bedding)", "Mixed Grains", "Mizuna",
    "Mohair", "Mulberries", "Mules", "Mung Beans", "Mushrooms (Button, Cremini, Portobello & Specialty)",
    "Mustard Greens", "Mustard Seed", "Mutton", "Natto Soybeans", "Native Restoration Plants",
    "Nectarines", "Niagara Grapes", "Nursery Trees & Shrubs", "Oats", "Okra",
    "Onions (Yellow, Red, White, Spanish & Pearl)", "Orchardgrass Hay", "Orchids (Potted)", "Oregano", "Ostriches",
    "Otebo Beans", "Oyster Mushrooms",
    # P - R
    "Parsley", "Parsnips", "Pattypan Squash", "Pawpaws", "Peaches",
    "Peanuts (Valencia & Virginia)", "Pears", "Peas (Dry Field, Green, Snow & Sugar Snap)", "Pecans (Northern)", "Peonies",
    "Peppers (Sweet Bell, Shepherd, Banana & Hot Chili)", "Perch (Yellow)", "Pheasants (Ring-Necked)", "Pickling Cucumbers", "Pinto Beans",
    "Plums & Prune Plums", "Poinsettias", "Popcorn", "Pork", "Portobello Mushrooms",
    "Potatoes (Table, Chipping, Processing & Seed)", "Potted Flowering Plants", "Propolis", "Pullets (Ready-to-Lay)", "Pumpkins (Carving & Pie)",
    "Quail (Meat & Quail Eggs)", "Queen Bees", "Quinces", "Quinoa", "Rabbits (Meat & Angora)",
    "Radicchio", "Radishes (Red, French Breakfast, Watermelon & Daikon)", "Rainbow Trout", "Rapini", "Raspberries (Red, Black & Golden)",
    "Red Clover", "Red Currants", "Reishi Mushrooms", "Rhubarb", "Riesling Grapes",
    "Roaster Chickens", "Roaster / Suckling Pigs", "Roma / Paste Tomatoes", "Romanesco Cauliflower", "Rosemary",
    "Roses (Cut & Shrub)", "Royal Jelly", "Rutabagas (Swedes)", "Rye (Fall & Spring)", "Ryegrass Hay & Sod",
    # S - Z
    "Saffron", "Sage", "Saskatoon Berries", "Savoy Cabbage", "Scotch Bonnet Peppers",
    "Scotch Pine Christmas Trees", "Sea Buckthorn Berries", "Seed Corn", "Seed Potatoes", "Shallots",
    "Sheep (Breeding, Lamb & Mutton)", "Sheep Milk", "Sheep Wool & Fleeces", "Shepherd Peppers", "Shiitake Mushrooms",
    "Shrimp (Indoor Pacific Whiteleg)", "Snap Peas", "Snapdragons", "Snow Peas", "Sod (Turfgrass)",
    "Soft Red Winter Wheat", "Soft White Winter Wheat", "Sorghum & Sorghum-Sudangrass", "Sorrel", "Sour Cherries",
    "Soybeans (Crushing, IP Food-Grade, Tofu & Natto)", "Spaghetti Squash", "Spanish Onions", "Spearmint", "Spelt",
    "Spinach", "Spring Wheat", "Sprouts (Edible)", "Spruce Christmas & Landscape Trees", "Squab (Utility Pigeons)",
    "Squash (Summer & Winter)", "St. John's Wort", "Standardbred & Thoroughbred Horses", "Steers & Fed Beef", "Stevia",
    "Straw (Cereal Bedding & Mushroom Substrate)", "Strawberries (Field & Greenhouse)", "Sugar Beets", "Sunflower Seed (Oilseed & Confectionary)", "Sunflowers (Cut)",
    "Sweet Cherries", "Sweet Corn", "Sweet Potatoes", "Swiss Chard", "Switchgrass",
    "Tarragon", "Tatsoi", "Tayberries", "Teff", "Thyme",
    "Tiger Nuts", "Tilapia", "Timothy Hay & Seed", "Tobacco (Flue-Cured, Burley & Dark)", "Tofu Soybeans",
    "Tomatillos", "Tomatoes (Field, Processing & Greenhouse)", "Triticale", "Tulips", "Turkeys (Broiler, Hen & Tom)",
    "Turmeric (Fresh High-Tunnel)", "Turnips (White & Purple-Top)", "Valerian", "Veal (Grain-Fed & Milk-Fed)", "Vegetable Transplants",
    "Venison (Deer & Elk)", "Vidal Icewine & Table Wine Grapes", "Vinifera Wine Grapes", "Walleye (Pickerel)", "Walnuts (English & Black)",
    "Water Buffalo (Milk & Meat)", "Water Spinach (Ong Choy)", "Watercress", "Watermelons", "Wax Beans (Yellow)",
    "Wax Gourd (Winter Melon)", "Wheat (Winter, Spring & Durum)", "Wheatgrass", "White Beans (Navy / Pea Beans)", "White Currants",
    "White Pine & White Spruce Christmas Trees", "Wild Boar", "Wool", "Yardlong Beans (Asparagus Beans)", "Yu Choy",
    "Zucchini"
]

INDIVIDUAL_AGM_NAMES = sorted(list(set(INDIVIDUAL_AGM_NAMES)))

# 1. Write CSV
csv_path = "c:/Projects/Census Tool/OFA_AGM_Complete_Ontario_Commodities_List.csv"
with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow(["Sector", "Sub-Category", "Specific Commodity / Crop / Livestock", "Verification Source (Ontario)"])
    for row in ONTARIO_COMMODITIES:
        writer.writerow(row)
print(f"Saved CSV ({len(ONTARIO_COMMODITIES)} grouped rows, {len(INDIVIDUAL_AGM_NAMES)} individual named items) to {csv_path}")

# 2. Write Excel (.xlsx) with two tabs: "1_By_Sector_Detailed" and "2_Alphabetical_AGM_Program_List"
wb = openpyxl.Workbook()
ws1 = wb.active
ws1.title = "1_By_Sector_Detailed"

header_fill = PatternFill(start_color="0F2537", end_color="0F2537", fill_type="solid")
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

headers1 = ["Agricultural Sector", "Sub-Category", "Specific Agricultural Commodity Produced in Ontario", "Authoritative Ontario Source"]
ws1.append(headers1)
ws1.freeze_panes = "A2"
for col_idx in range(1, 5):
    c = ws1.cell(row=1, column=col_idx)
    c.fill = header_fill
    c.font = header_font
    c.alignment = Alignment(horizontal="left", vertical="center")
ws1.row_dimensions[1].height = 24

for r_idx, row in enumerate(ONTARIO_COMMODITIES, start=2):
    ws1.append(list(row))
    fill = zebra_fill if r_idx % 2 == 1 else white_fill
    for col_idx in range(1, 5):
        c = ws1.cell(row=r_idx, column=col_idx)
        c.fill = fill
        c.font = bold_font if col_idx == 3 else reg_font
        c.border = thin_border

for i, w in enumerate([42, 30, 68, 36], start=1):
    ws1.column_dimensions[get_column_letter(i)].width = w

ws2 = wb.create_sheet(title="2_Alphabetical_AGM_Wall")
ws2.append(["#", "Commodity Name (A to Z — Ready for OFA AGM Program)"])
ws2.freeze_panes = "A2"
for col_idx in range(1, 3):
    c = ws2.cell(row=1, column=col_idx)
    c.fill = header_fill
    c.font = header_font
ws2.row_dimensions[1].height = 24
for idx, name in enumerate(INDIVIDUAL_AGM_NAMES, start=1):
    ws2.append([idx, name])
    fill = zebra_fill if idx % 2 == 0 else white_fill
    ws2.cell(row=idx+1, column=1).fill = fill
    ws2.cell(row=idx+1, column=1).font = reg_font
    ws2.cell(row=idx+1, column=1).border = thin_border
    ws2.cell(row=idx+1, column=2).fill = fill
    ws2.cell(row=idx+1, column=2).font = bold_font
    ws2.cell(row=idx+1, column=2).border = thin_border
ws2.column_dimensions["A"].width = 8
ws2.column_dimensions["B"].width = 55

xlsx_path = "c:/Projects/Census Tool/OFA_AGM_Complete_Ontario_Commodities_List.xlsx"
wb.save(xlsx_path)
print(f"Saved Excel workbook to {xlsx_path}")

# 3. Write Word Document (.docx) formatted specifically for the OFA AGM Program
doc = Document()
for section in doc.sections:
    section.top_margin = Inches(0.6)
    section.bottom_margin = Inches(0.6)
    section.left_margin = Inches(0.6)
    section.right_margin = Inches(0.6)

title_p = doc.add_paragraph()
tr = title_p.add_run("ONTARIO FEDERATION OF AGRICULTURE (OFA) — AGM PROGRAM REFERENCE\nCOMPLETE LIST OF AGRICULTURAL COMMODITIES PRODUCED IN ONTARIO")
tr.bold = True
tr.font.size = Pt(14)
tr.font.color.rgb = RGBColor(15, 37, 55)

sub_p = doc.add_paragraph()
sr = sub_p.add_run(
    f"Compiled from Statistics Canada (Census of Agriculture & Annual Commodity Surveys), Agricorp Production Insurance, "
    f"OMAFRA Specialty Cropportunities & World Crops, Foodland Ontario, and Ontario Marketing Boards "
    f"({len(INDIVIDUAL_AGM_NAMES)} Specific Named Commodities Across 12 Sectors)"
)
sr.font.size = Pt(9.5)
sr.font.color.rgb = RGBColor(46, 107, 52)

# Part 1: By Agricultural Sector
h1 = doc.add_paragraph()
h1r = h1.add_run("PART 1: ONTARIO AGRICULTURAL COMMODITIES BY SECTOR (12 SECTORS)")
h1r.bold = True
h1r.font.size = Pt(12)
h1r.font.color.rgb = RGBColor(15, 37, 55)

by_sec = {}
for sec, subcat, item, src in ONTARIO_COMMODITIES:
    by_sec.setdefault(sec, []).append((subcat, item, src))

def set_cell_bg(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tcPr.append(shd)

for sec, items in by_sec.items():
    sh = doc.add_paragraph()
    shr = sh.add_run(sec)
    shr.bold = True
    shr.font.size = Pt(10.5)
    shr.font.color.rgb = RGBColor(46, 107, 52)

    tbl = doc.add_table(rows=1, cols=3)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = tbl.rows[0].cells
    for i, t in enumerate(["Sub-Category", "Specific Commodity Produced in Ontario", "Verification Source"]):
        hdr[i].text = t
        set_cell_bg(hdr[i], "0F2537")
        for p in hdr[i].paragraphs:
            for run in p.runs:
                run.font.bold = True
                run.font.size = Pt(8.5)
                run.font.color.rgb = RGBColor(255, 255, 255)
    for idx, (subcat, item, src) in enumerate(items):
        rc = tbl.add_row().cells
        bg = "F8FAFC" if idx % 2 == 1 else "FFFFFF"
        for i, val in enumerate([subcat, item, src]):
            rc[i].text = val
            set_cell_bg(rc[i], bg)
            for p in rc[i].paragraphs:
                for run in p.runs:
                    run.font.size = Pt(8.5)
                    if i == 1:
                        run.font.bold = True

# Part 2: A-to-Z Program Wall
doc.add_page_break()
h2 = doc.add_paragraph()
h2r = h2.add_run(f"PART 2: ALPHABETICAL A-TO-Z PROGRAM WALL ({len(INDIVIDUAL_AGM_NAMES)} ONTARIO COMMODITIES)")
h2r.bold = True
h2r.font.size = Pt(12)
h2r.font.color.rgb = RGBColor(15, 37, 55)

wall_p = doc.add_paragraph()
wall_r = wall_p.add_run(" • ".join(INDIVIDUAL_AGM_NAMES))
wall_r.font.size = Pt(9)

docx_path = "c:/Projects/Census Tool/OFA_AGM_Complete_Ontario_Commodities_List.docx"
doc.save(docx_path)
print(f"Saved Word document to {docx_path}")
