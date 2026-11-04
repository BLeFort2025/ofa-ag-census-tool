import React, { useEffect, useMemo, useState } from 'react';
import { AgCensusDataset, GeoLevel, GeographyNode } from '../../types/census';
import {
  MTM_PALETTES,
  computeQuintileBreaks,
  downloadCsvFile,
  formatDelta,
  formatMetricValue,
  getObservation,
  getQuintileColor,
  getRawNumber
} from '../../utils/analytics';
import { MultiGeographyScopeSlicer } from '../GeographySlicer';
import { InteractiveAgMap, MapItemPoint, loadBoundariesGeoJson } from '../InteractiveAgMap';
import {
  Download,
  FileSpreadsheet,
  HelpCircle,
  Image as ImageIcon,
  Printer,
  RotateCcw
} from 'lucide-react';

interface AgRankerModuleProps {
  dataset: AgCensusDataset;
  onOpenGeoLocator: () => void;
  onSelectGeoForSnapshot: (geo: GeographyNode) => void;
}

type RankerUnitFilter = 'all' | 'acres' | 'head' | 'dollars' | 'farms' | 'agg';
type RefColMode =
  | 'auto'
  | 'land_total_acres'
  | 'land_crops_acres'
  | 'avg_farm_size_acres'
  | 'total_farms'
  | 'rev_total_dollars'
  | 'avg_rev_per_farm'
  | 'cattle_total_head'
  | 'val2016';

const REF_COL_OPTIONS: Array<{ id: RefColMode; label: string; shortHeader: string }> = [
  { id: 'auto', label: 'Auto (Paired Acres / Head / Farms)', shortHeader: 'Paired Metric' },
  { id: 'land_total_acres', label: 'Total Farmland (Acres)', shortHeader: 'Farmland (Ac)' },
  { id: 'land_crops_acres', label: 'Total Cropland (Acres)', shortHeader: 'Cropland (Ac)' },
  { id: 'avg_farm_size_acres', label: 'Avg Farm Size (Acres)', shortHeader: 'Avg Size (Ac)' },
  { id: 'total_farms', label: 'Total Census Farms', shortHeader: 'Total Farms' },
  { id: 'rev_total_dollars', label: 'Gross Farm Revenue ($)', shortHeader: 'Gross Rev ($)' },
  { id: 'avg_rev_per_farm', label: 'Avg Revenue / Farm ($)', shortHeader: 'Rev / Farm ($)' },
  { id: 'cattle_total_head', label: 'Total Cattle Herd (Head)', shortHeader: 'Cattle (Head)' },
  { id: 'val2016', label: '2016 Prior Census Value', shortHeader: '2016 Value' }
];

function getUnitColumnHeader(unit: string): string {
  switch (unit) {
    case 'ACRES':
      return 'Acres';
    case 'HEAD':
      return 'Head / Birds';
    case 'DOLLARS':
      return 'Dollars ($)';
    case 'FARMS':
      return 'Farms';
    case 'SQFT':
      return 'Sq. Ft.';
    case 'TAPS':
      return 'Maple Taps';
    case 'COLONIES':
      return 'Colonies';
    case 'WORKERS':
      return 'Operators / Workers';
    case 'PERCENT':
      return 'Percent (%)';
    default:
      return 'Value';
  }
}

export const AgRankerModule: React.FC<AgRankerModuleProps> = ({
  dataset,
  onOpenGeoLocator,
  onSelectGeoForSnapshot
}) => {
  const [unitFilter, setUnitFilter] = useState<RankerUnitFilter>('all');
  const [refColMode, setRefColMode] = useState<RefColMode>('auto');
  const [selectedLevel, setSelectedLevel] = useState<GeoLevel>('Counties / Census Divisions (CD)');
  const [selectedProvince, setSelectedProvince] = useState<string>('35'); // Default Ontario
  const [selectedCarId, setSelectedCarId] = useState<string>('ALL');

  const charMatchesUnitFilter = (
    c: AgCensusDataset['characteristics'][number],
    filter: RankerUnitFilter
  ): boolean => {
    if (filter === 'all') return true;
    if (filter === 'acres') return c.unit === 'ACRES';
    if (filter === 'head') return c.unit === 'HEAD' || c.unit === 'COLONIES';
    if (filter === 'dollars') return c.unit === 'DOLLARS';
    if (filter === 'farms') return c.unit === 'FARMS';
    if (filter === 'agg') return c.layer1 === 'Aggregate Statistics';
    return true;
  };

  const categories = useMemo(() => {
    const s = new Set<string>();
    dataset.characteristics.forEach((c) => {
      if (charMatchesUnitFilter(c, unitFilter)) {
        s.add(c.category);
      }
    });
    return Array.from(s);
  }, [dataset.characteristics, unitFilter]);

  const [selectedCategory, setSelectedCategory] = useState<string>(
    '1. Farm Types & Industry (NAICS)'
  );
  const [selectedCharId, setSelectedCharId] = useState<string>('naics_dairy');

  // Ranker range filters (matching MTM Ranker Filters card at bottom-left)
  const [minFarms, setMinFarms] = useState<number>(10);
  const [maxFarms, setMaxFarms] = useState<number>(250000);
  const [minPct, setMinPct] = useState<number>(0);
  const [maxPct, setMaxPct] = useState<number>(100);

  const [sortCol, setSortCol] = useState<'val' | 'pct' | 'delta' | 'farms'>('val');
  const [mapColorMode, setMapColorMode] = useState<'val' | 'pct'>('pct');
  const [paletteMode, setPaletteMode] = useState<'standard' | 'accessible'>('standard');
  const [focusedGeoId, setFocusedGeoId] = useState<string | null>(null);
  const [showBaseTooltip, setShowBaseTooltip] = useState<boolean>(false);
  const [isExportingMap, setIsExportingMap] = useState<boolean>(false);

  // Sync category if unitFilter changes and current category has no matching characteristics
  useEffect(() => {
    if (categories.length > 0 && !categories.includes(selectedCategory)) {
      setSelectedCategory(categories[0]);
    }
  }, [categories, selectedCategory]);

  // Eligible characteristics for the current unit filter & category
  const availableChars = useMemo(() => {
    return dataset.characteristics.filter((c) => {
      if (c.category !== selectedCategory) return false;
      return charMatchesUnitFilter(c, unitFilter);
    });
  }, [dataset.characteristics, selectedCategory, unitFilter]);

  useEffect(() => {
    if (availableChars.length > 0 && !availableChars.some((c) => c.id === selectedCharId)) {
      setSelectedCharId(availableChars[0].id);
    }
  }, [availableChars, selectedCharId]);

  const activeCharMeta = useMemo(
    () =>
      dataset.characteristics.find((c) => c.id === selectedCharId) ||
      dataset.characteristics[0],
    [dataset.characteristics, selectedCharId]
  );

  const hasPctShare = Boolean(activeCharMeta.baseId);

  // Helper to jump directly to any characteristic ID (updating category & unit filter seamlessly)
  const selectCharacteristicDirectly = (cid: string) => {
    const target = dataset.characteristics.find((c) => c.id === cid);
    if (!target) return;
    if (!charMatchesUnitFilter(target, unitFilter)) {
      setUnitFilter('all');
    }
    setSelectedCategory(target.category);
    setSelectedCharId(target.id);
  };

  // Smart Contextual "Switch Measure for This Topic" options (Acres <-> Head <-> Farms <-> Avg)
  const relatedMeasureOptions = useMemo(() => {
    const cid = activeCharMeta.id;
    const list: Array<{ id: string; badge: string }> = [];
    const addIfFound = (id: string, badge: string) => {
      if (dataset.characteristics.some((c) => c.id === id) && !list.some((x) => x.id === id)) {
        list.push({ id, badge });
      }
    };

    // 1. Cattle / Beef / Dairy group
    if (
      cid === 'naics_cattle_total' ||
      cid === 'naics_beef' ||
      cid === 'naics_dairy' ||
      cid.startsWith('cattle_') ||
      cid === 'avg_cattle_per_farm' ||
      cid === 'avg_dairy_cows_per_farm'
    ) {
      addIfFound('cattle_total_head', 'Total Cattle (Head)');
      addIfFound('cattle_beef_cows_head', 'Beef Cows (Head)');
      addIfFound('cattle_dairy_cows_head', 'Dairy Cows (Head)');
      addIfFound('avg_cattle_per_farm', 'Avg Cattle / Farm');
      addIfFound('land_tame_pasture_acres', 'Tame Pasture (Acres)');
      addIfFound('land_natural_pasture_acres', 'Natural Pasture (Acres)');
      addIfFound('cattle_total_farms', 'All Cattle Farms');
      addIfFound('naics_cattle_total', 'NAICS Cattle Farms');
      addIfFound('naics_dairy', 'NAICS Dairy Farms');
      return list;
    }

    // 2. Field Crops (crop_*_acres <-> crop_*_farms + NAICS grain/oilseed/hay)
    const naicsToCropPrefix: Record<string, string> = {
      naics_soybean: 'crop_soybeans',
      naics_corn: 'crop_corn_grain',
      naics_wheat: 'crop_wheat_total',
      naics_oilseed_other: 'crop_canola',
      naics_hay: 'crop_alfalfa',
      naics_potato: 'crop_potatoes'
    };
    const cropPrefix =
      naicsToCropPrefix[cid] ||
      (cid.startsWith('crop_') && cid !== 'crop_total_acres'
        ? cid.replace(/_(acres|farms)$/, '')
        : null);

    if (cropPrefix) {
      addIfFound(`${cropPrefix}_acres`, 'Crop Area (Acres)');
      addIfFound(`${cropPrefix}_farms`, 'Farms Growing (Farms)');
      if (cropPrefix === 'crop_corn_grain' || cropPrefix === 'crop_corn_silage') {
        addIfFound('crop_corn_grain_acres', 'Grain Corn (Acres)');
        addIfFound('crop_corn_silage_acres', 'Silage Corn (Acres)');
        addIfFound('naics_corn', 'NAICS Corn Farms');
      }
      if (cropPrefix === 'crop_soybeans') addIfFound('naics_soybean', 'NAICS Soybean Farms');
      if (cropPrefix.startsWith('crop_wheat') || cropPrefix.includes('wheat')) {
        addIfFound('crop_wheat_total_acres', 'All Wheat (Acres)');
        addIfFound('crop_winter_wheat_acres', 'Winter Wheat (Acres)');
        addIfFound('crop_spring_wheat_acres', 'Spring Wheat (Acres)');
        addIfFound('naics_wheat', 'NAICS Wheat Farms');
      }
      if (cropPrefix === 'crop_alfalfa' || cropPrefix === 'crop_other_hay') {
        addIfFound('crop_alfalfa_acres', 'Alfalfa (Acres)');
        addIfFound('crop_other_hay_acres', 'Other Hay (Acres)');
        addIfFound('naics_hay', 'NAICS Hay Farms');
      }
      addIfFound('crop_total_acres', 'All Field Crops (Acres)');
      return list;
    }

    if (cid === 'naics_oilseed_grain' || cid === 'crop_total_acres' || cid === 'land_crops_acres') {
      addIfFound('crop_total_acres', 'Field Crops & Hay (Acres)');
      addIfFound('land_crops_acres', 'Total Land in Crops (Acres)');
      addIfFound('avg_cropland_per_farm', 'Avg Cropland / Farm (Acres)');
      addIfFound('naics_oilseed_grain', 'Oilseed & Grain Farms');
      return list;
    }

    // 3. Pigs / Hogs
    if (cid === 'naics_hog' || cid.startsWith('pigs_') || cid === 'avg_pigs_per_farm') {
      addIfFound('pigs_total_head', 'Total Pigs (Head)');
      addIfFound('avg_pigs_per_farm', 'Avg Pigs / Farm (Head)');
      addIfFound('pigs_total_farms', 'All Farms with Pigs');
      addIfFound('naics_hog', 'NAICS Hog & Pig Farms');
      return list;
    }

    // 4. Sheep & Goat
    if (cid === 'naics_sheep_goat' || cid.startsWith('sheep_')) {
      addIfFound('sheep_total_head', 'Total Sheep & Lambs (Head)');
      addIfFound('sheep_total_farms', 'All Farms with Sheep');
      addIfFound('naics_sheep_goat', 'NAICS Sheep & Goat Farms');
      return list;
    }

    // 5. Poultry & Egg
    if (
      cid === 'naics_poultry_egg' ||
      cid === 'naics_chicken_egg' ||
      cid === 'naics_broiler' ||
      cid.startsWith('poultry_')
    ) {
      addIfFound('poultry_hens_chickens_birds', 'Hens & Chickens (Birds)');
      addIfFound('poultry_hens_chickens_farms', 'Farms with Chickens');
      addIfFound('naics_poultry_egg', 'NAICS Poultry & Egg Farms');
      addIfFound('naics_chicken_egg', 'Chicken Egg Farms');
      addIfFound('naics_broiler', 'Broiler Chicken Farms');
      return list;
    }

    // 6. Horticulture, Fruit, Veg, Greenhouse, Maple, Bees
    if (cid === 'naics_fruit_nut' || cid.startsWith('fruit_')) {
      addIfFound('fruit_total_acres', 'Total Fruit Area (Acres)');
      addIfFound('fruit_apples_acres', 'Apples (Acres)');
      addIfFound('fruit_grapes_acres', 'Grapes (Acres)');
      addIfFound('naics_fruit_nut', 'Fruit & Nut Farms');
      return list;
    }
    if (cid === 'naics_vegetable' || cid.startsWith('veg_')) {
      addIfFound('veg_total_acres', 'Total Vegetable Area (Acres)');
      addIfFound('veg_sweet_corn_acres', 'Sweet Corn (Acres)');
      addIfFound('veg_tomatoes_acres', 'Tomatoes (Acres)');
      addIfFound('naics_vegetable', 'Vegetable Farms');
      return list;
    }
    if (cid === 'naics_greenhouse' || cid === 'gh_total_sqft') {
      addIfFound('gh_total_sqft', 'Greenhouse Area (Sq. Ft.)');
      addIfFound('naics_greenhouse', 'Greenhouse & Nursery Farms');
      return list;
    }
    if (cid === 'naics_maple' || cid.startsWith('maple_')) {
      addIfFound('maple_total_taps', 'Total Maple Taps');
      addIfFound('maple_farms', 'Farms with Maple Taps');
      addIfFound('naics_maple', 'NAICS Maple Farms');
      return list;
    }
    if (cid === 'naics_apiculture' || cid.startsWith('bees_')) {
      addIfFound('bees_colonies', 'Honeybee Colonies');
      addIfFound('bees_farms', 'Beekeeping Farms');
      addIfFound('naics_apiculture', 'NAICS Apiculture Farms');
      return list;
    }

    // 7. Land Use / Total Farms / Revenues
    if (
      cid === 'total_farms' ||
      cid === 'land_total_acres' ||
      cid === 'avg_farm_size_acres' ||
      cid === 'rev_total_dollars'
    ) {
      addIfFound('land_total_acres', 'Total Farmland (Acres)');
      addIfFound('land_crops_acres', 'Land in Crops (Acres)');
      addIfFound('avg_farm_size_acres', 'Avg Farm Size (Acres)');
      addIfFound('total_farms', 'Total Farms');
      addIfFound('rev_total_dollars', 'Gross Revenues ($)');
      return list;
    }

    return list;
  }, [activeCharMeta.id, dataset.characteristics]);

  // Resolve what characteristic is displayed in the customizable Reference Column
  const resolvedRefColMeta = useMemo(() => {
    if (refColMode === 'val2016') {
      return {
        charId: null,
        headerLabel: `2016 ${getUnitColumnHeader(activeCharMeta.unit)}`,
        unit: activeCharMeta.unit
      };
    }

    let targetCharId: string = refColMode;
    if (refColMode === 'auto') {
      const cid = activeCharMeta.id;
      if (cid.endsWith('_acres')) {
        const farmPair = cid.replace(/_acres$/, '_farms');
        targetCharId = dataset.characteristics.some((c) => c.id === farmPair)
          ? farmPair
          : 'total_farms';
      } else if (cid.endsWith('_farms')) {
        const acrePair = cid.replace(/_farms$/, '_acres');
        const headPair = cid.replace(/_farms$/, '_head');
        if (dataset.characteristics.some((c) => c.id === acrePair)) targetCharId = acrePair;
        else if (dataset.characteristics.some((c) => c.id === headPair)) targetCharId = headPair;
        else if (cid === 'poultry_hens_chickens_farms') targetCharId = 'poultry_hens_chickens_birds';
        else if (cid === 'bees_farms') targetCharId = 'bees_colonies';
        else if (cid === 'maple_farms') targetCharId = 'maple_total_taps';
        else targetCharId = 'land_total_acres';
      } else if (cid.endsWith('_head')) {
        const farmPair = cid.replace(/_head$/, '_farms');
        targetCharId = dataset.characteristics.some((c) => c.id === farmPair)
          ? farmPair
          : 'cattle_total_farms';
      } else if (cid === 'naics_cattle_total') {
        targetCharId = 'cattle_total_head';
      } else if (cid === 'naics_beef') {
        targetCharId = 'cattle_beef_cows_head';
      } else if (cid === 'naics_dairy') {
        targetCharId = 'cattle_dairy_cows_head';
      } else if (cid === 'naics_hog') {
        targetCharId = 'pigs_total_head';
      } else if (cid === 'naics_sheep_goat') {
        targetCharId = 'sheep_total_head';
      } else if (
        cid === 'naics_poultry_egg' ||
        cid === 'naics_chicken_egg' ||
        cid === 'naics_broiler'
      ) {
        targetCharId = 'poultry_hens_chickens_birds';
      } else if (cid === 'naics_soybean') {
        targetCharId = 'crop_soybeans_acres';
      } else if (cid === 'naics_corn') {
        targetCharId = 'crop_corn_grain_acres';
      } else if (cid === 'naics_wheat') {
        targetCharId = 'crop_wheat_total_acres';
      } else if (cid === 'naics_oilseed_other') {
        targetCharId = 'crop_canola_acres';
      } else if (cid === 'naics_oilseed_grain') {
        targetCharId = 'crop_total_acres';
      } else if (cid === 'naics_hay' || cid === 'naics_other_crop') {
        targetCharId = 'crop_alfalfa_acres';
      } else if (cid === 'naics_potato') {
        targetCharId = 'crop_potatoes_acres';
      } else if (cid === 'naics_fruit_nut') {
        targetCharId = 'fruit_total_acres';
      } else if (cid === 'naics_vegetable') {
        targetCharId = 'veg_total_acres';
      } else if (cid === 'naics_greenhouse') {
        targetCharId = 'gh_total_sqft';
      } else if (cid === 'naics_maple') {
        targetCharId = 'maple_total_taps';
      } else if (cid === 'naics_apiculture') {
        targetCharId = 'bees_colonies';
      } else if (activeCharMeta.unit === 'FARMS') {
        targetCharId = 'land_total_acres';
      } else {
        targetCharId = 'total_farms';
      }
    }

    const foundChar =
      dataset.characteristics.find((c) => c.id === targetCharId) ||
      dataset.characteristics.find((c) => c.id === 'land_total_acres') ||
      dataset.characteristics[0];

    const presetOpt = REF_COL_OPTIONS.find((o) => o.id === refColMode);
    const headerLabel =
      refColMode !== 'auto' && presetOpt
        ? presetOpt.shortHeader
        : foundChar.shortName.length > 18
        ? `${foundChar.shortName.replace(/\s*\([^)]*\)/g, '').slice(0, 12)} (${
            foundChar.unit === 'ACRES'
              ? 'Ac'
              : foundChar.unit === 'HEAD'
              ? 'Head'
              : foundChar.unit === 'FARMS'
              ? 'Farms'
              : foundChar.unit === 'DOLLARS'
              ? '$'
              : foundChar.unit
          })`
        : foundChar.shortName;

    return {
      charId: foundChar.id,
      headerLabel,
      unit: foundChar.unit
    };
  }, [refColMode, activeCharMeta, dataset.characteristics]);

  // Scope geographies
  const scopedGeos = useMemo(() => {
    return dataset.geographies.filter((g) => {
      if (g.level !== selectedLevel) return false;
      if (selectedProvince !== 'ALL' && g.provinceCode !== selectedProvince) return false;
      if (selectedCarId !== 'ALL') {
        if (selectedLevel === 'Counties / Census Divisions (CD)') {
          return g.parentId === selectedCarId;
        }
        if (selectedLevel === 'Townships / Subdivisions (CCS)') {
          const parentCd = dataset.geographies.find((p) => p.id === g.parentId);
          return parentCd?.parentId === selectedCarId;
        }
      }
      return true;
    });
  }, [dataset.geographies, selectedLevel, selectedProvince, selectedCarId]);

  const scopeTitleLabel = useMemo(() => {
    const provGeo = dataset.geographies.find(
      (g) => g.level === 'Provinces & Territories' && g.provinceCode === selectedProvince
    );
    const carGeo =
      selectedCarId !== 'ALL' ? dataset.geographies.find((g) => g.id === selectedCarId) : null;
    const provName = selectedProvince === 'ALL' ? 'All Canada' : provGeo?.cleanName || 'Ontario';
    return carGeo
      ? `${provName} (${carGeo.cleanName}) • ${selectedLevel}`
      : `${provName} • ${selectedLevel}`;
  }, [dataset.geographies, selectedProvince, selectedCarId, selectedLevel]);

  // Compute and filter leaderboard rows
  const leaderboardRows = useMemo(() => {
    const rows = scopedGeos
      .map((geo) => {
        const obs = getObservation(dataset, geo.id, activeCharMeta);
        const totalFarms = getRawNumber(dataset, geo.id, 'total_farms', 0) || 0;
        const refVal =
          resolvedRefColMeta.charId === null
            ? obs.val2016
            : getRawNumber(dataset, geo.id, resolvedRefColMeta.charId, 0);
        return {
          geo,
          obs,
          totalFarms,
          refVal
        };
      })
      .filter((r) => {
        if (r.obs.val2021 === null) return false;
        if (r.totalFarms < minFarms || r.totalFarms > maxFarms) return false;
        if (hasPctShare && r.obs.pctOfBase !== null) {
          if (r.obs.pctOfBase < minPct || r.obs.pctOfBase > maxPct) return false;
        }
        return true;
      });

    rows.sort((a, b) => {
      if (sortCol === 'pct') return (b.obs.pctOfBase ?? -1) - (a.obs.pctOfBase ?? -1);
      if (sortCol === 'delta') return (b.obs.pctChange ?? -999) - (a.obs.pctChange ?? -999);
      if (sortCol === 'farms') return (b.refVal ?? -1) - (a.refVal ?? -1);
      return (b.obs.val2021 ?? -1) - (a.obs.val2021 ?? -1);
    });

    return rows;
  }, [
    scopedGeos,
    dataset,
    activeCharMeta,
    resolvedRefColMeta.charId,
    minFarms,
    maxFarms,
    minPct,
    maxPct,
    hasPctShare,
    sortCol
  ]);

  const maxVal = useMemo(
    () => Math.max(1, ...leaderboardRows.map((r) => r.obs.val2021 || 0)),
    [leaderboardRows]
  );
  const maxPctBar = useMemo(
    () => Math.max(1, ...leaderboardRows.map((r) => r.obs.pctOfBase || 0)),
    [leaderboardRows]
  );

  // Scale breaks for Map (5 equal groups: Lowest 20% to Highest 20%)
  const isMapShadedByPct = hasPctShare && mapColorMode === 'pct';

  const quintileBreaks = useMemo(() => {
    const vals = leaderboardRows.map((r) =>
      isMapShadedByPct && r.obs.pctOfBase !== null
        ? r.obs.pctOfBase
        : r.obs.val2021 || 0
    );
    return computeQuintileBreaks(vals);
  }, [leaderboardRows, isMapShadedByPct]);

  const formatScaleVal = (v: number): string =>
    isMapShadedByPct
      ? `${v.toFixed(1)}%`
      : formatMetricValue(v, activeCharMeta.unit, true);

  const getQuintileLabel = (val: number): string => {
    const [, b1, b2, b3, b4] = quintileBreaks;
    if (val <= b1) return 'Lowest 20% (Bottom Tier)';
    if (val <= b2) return 'Lower-Middle 20%';
    if (val <= b3) return 'Middle 20%';
    if (val <= b4) return 'Upper-Middle 20%';
    return 'Highest 20% (Top Tier)';
  };

  const mapItems: MapItemPoint[] = useMemo(() => {
    return leaderboardRows.map((r, idx) => {
      const mVal =
        hasPctShare && mapColorMode === 'pct' && r.obs.pctOfBase !== null
          ? r.obs.pctOfBase
          : r.obs.val2021 || 0;
      const refStr = `${resolvedRefColMeta.headerLabel}: ${formatMetricValue(
        r.refVal,
        resolvedRefColMeta.unit,
        true
      )}`;
      return {
        geo: r.geo,
        value: mVal,
        formattedValue: `#${idx + 1}: ${formatMetricValue(r.obs.val2021, activeCharMeta.unit)}`,
        secondaryLabel:
          r.obs.pctOfBase !== null
            ? `${r.obs.pctOfBase.toFixed(1)}% of Base | ${refStr}`
            : refStr,
        color: getQuintileColor(mVal, quintileBreaks, paletteMode),
        radius: 7,
        isSelected: r.geo.id === focusedGeoId
      };
    });
  }, [
    leaderboardRows,
    hasPctShare,
    mapColorMode,
    activeCharMeta.unit,
    resolvedRefColMeta,
    quintileBreaks,
    paletteMode,
    focusedGeoId
  ]);

  const focusedGeo = useMemo(
    () => dataset.geographies.find((g) => g.id === focusedGeoId) || null,
    [dataset.geographies, focusedGeoId]
  );

  // 1. Export Leaderboard Data as Excel-Ready CSV
  const exportRankerCsv = () => {
    if (leaderboardRows.length === 0) return;
    const headers = [
      'Rank',
      'Geography',
      'Province / Region',
      'OFA Federation',
      'Geography Level',
      'DGUID',
      'Characteristic',
      'StatCan Table',
      'Unit',
      `2021 ${getUnitColumnHeader(activeCharMeta.unit)}`,
      '% of Base (2021)',
      '2016 Value',
      '2016-2021 Change',
      'Scale Tier (Low to High)',
      resolvedRefColMeta.headerLabel,
      'Total Census Farms (2021)'
    ];
    const deltaSuffix = activeCharMeta.unit === 'PERCENT' ? ' pts' : '%';
    const rows = leaderboardRows.map((r, idx) => {
      const mVal =
        hasPctShare && mapColorMode === 'pct' && r.obs.pctOfBase !== null
          ? r.obs.pctOfBase
          : r.obs.val2021 || 0;
      return [
        idx + 1,
        r.geo.cleanName,
        r.geo.provinceName || '',
        r.geo.ofaFederation || '',
        r.geo.level,
        r.geo.dguid,
        activeCharMeta.name,
        activeCharMeta.statcanTable,
        activeCharMeta.unit,
        r.obs.val2021 ?? '',
        r.obs.pctOfBase !== null ? Number(r.obs.pctOfBase.toFixed(1)) : '',
        r.obs.val2016 ?? '',
        r.obs.pctChange !== null ? `${r.obs.pctChange.toFixed(1)}${deltaSuffix}` : '',
        getQuintileLabel(mVal),
        r.refVal ?? '',
        r.totalFarms
      ];
    });
    downloadCsvFile(`OFA_Ranker_Leaderboard_${activeCharMeta.id}.csv`, headers, rows);
  };

  // 2. Download Publication-Grade Heat Map & Leaderboard Graphic (PNG)
  const handleDownloadRankerMapPng = async () => {
    if (leaderboardRows.length === 0 || isExportingMap) return;
    setIsExportingMap(true);
    try {
      const geoJson = await loadBoundariesGeoJson();
      const width = 1800;
      const height = 1125;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, width, height);

      // Top OFA Navy Header Banner
      ctx.fillStyle = '#0F3D6E';
      ctx.fillRect(0, 0, width, 128);
      ctx.fillStyle = '#328475';
      ctx.fillRect(0, 124, width, 5);

      // Header Eyebrow
      ctx.fillStyle = '#7DD3FC';
      ctx.font = 'bold 15px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `ONTARIO FEDERATION OF AGRICULTURE (OFA)  •  AGCENSUS IQ REGIONAL RANKER (${activeCharMeta.statcanTable})`,
        36,
        34
      );

      // Main Metric Title
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 28px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(`RANKER: ${activeCharMeta.shortName.toUpperCase()}`.slice(0, 75), 36, 72);

      // Subtitle
      const isShadedByPct = hasPctShare && mapColorMode === 'pct';
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 16px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `Scope: ${scopeTitleLabel} (${leaderboardRows.length} Geographies)  •  Map Shaded by: ${
          isShadedByPct ? '% Share of Base' : `2021 ${getUnitColumnHeader(activeCharMeta.unit)}`
        }`,
        36,
        104
      );

      // Right Header Callout Pill (#1 Ranked Leader)
      const topRow = leaderboardRows[0];
      if (topRow) {
        const kpiW = 410;
        const kpiH = 84;
        const kpiX = width - kpiW - 36;
        const kpiY = 20;
        ctx.fillStyle = '#164E63';
        ctx.strokeStyle = '#328475';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(kpiX, kpiY, kpiW, kpiH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#A7F3D0';
        ctx.font = 'bold 13px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText('#1 RANKED LEADER IN ACTIVE SCOPE', kpiX + 18, kpiY + 26);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 22px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(topRow.geo.cleanName.slice(0, 24), kpiX + 18, kpiY + 58);

        const topValStr = formatMetricValue(topRow.obs.val2021, activeCharMeta.unit, true);
        const topPctStr =
          topRow.obs.pctOfBase !== null ? ` (${topRow.obs.pctOfBase.toFixed(1)}%)` : '';
        ctx.fillStyle = '#7DD3FC';
        ctx.font = 'bold 17px Inter, Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${topValStr}${topPctStr}`, kpiX + kpiW - 18, kpiY + 58);
        ctx.textAlign = 'left';
      }

      // Map Card Container (Left 1090px)
      const mapBox = { x: 32, y: 150, w: 1090, h: 895 };
      ctx.fillStyle = '#E6EEF4';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(mapBox.x, mapBox.y, mapBox.w, mapBox.h, 10);
      ctx.fill();
      ctx.stroke();

      const itemByDguid = new Map<string, MapItemPoint>();
      for (const it of mapItems) {
        itemByDguid.set(it.geo.dguid, it);
      }

      const matchingFeatures =
        geoJson?.features?.filter((f: any) => itemByDguid.has(f.properties?.dguid)) || [];

      const extractRings = (geom: any): number[][][] => {
        if (!geom) return [];
        if (geom.type === 'Polygon') return geom.coordinates;
        if (geom.type === 'MultiPolygon') {
          const all: number[][][] = [];
          for (const poly of geom.coordinates) {
            for (const ring of poly) all.push(ring);
          }
          return all;
        }
        return [];
      };

      const drawGeoJsonView = (
        featuresToDraw: any[],
        rect: { x: number; y: number; w: number; h: number },
        bboxOverride?: { minLon: number; maxLon: number; minLat: number; maxLat: number },
        labelTopN: number = 10
      ) => {
        let minLon = Infinity,
          maxLon = -Infinity,
          minLat = Infinity,
          maxLat = -Infinity;

        if (bboxOverride) {
          ({ minLon, maxLon, minLat, maxLat } = bboxOverride);
        } else {
          for (const f of featuresToDraw) {
            for (const ring of extractRings(f.geometry)) {
              for (const [lon, lat] of ring) {
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
              }
            }
          }
        }

        if (!isFinite(minLon) || !isFinite(minLat)) return;

        const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
        const cosLat = Math.max(0.35, Math.cos(midLatRad));
        const pad = 28;
        const availW = rect.w - pad * 2;
        const availH = rect.h - pad * 2;

        const lonSpan = Math.max(0.05, (maxLon - minLon) * cosLat);
        const latSpan = Math.max(0.05, maxLat - minLat);
        const scale = Math.min(availW / lonSpan, availH / latSpan);

        const drawnW = lonSpan * scale;
        const drawnH = latSpan * scale;
        const offsetX = rect.x + pad + (availW - drawnW) / 2;
        const offsetY = rect.y + pad + (availH - drawnH) / 2;

        const project = (lon: number, lat: number): [number, number] => [
          offsetX + (lon - minLon) * cosLat * scale,
          offsetY + (maxLat - lat) * scale
        ];

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
        ctx.clip();

        // Draw Canadian Provincial Base Silhouette underneath so filtered/suppressed areas still show Canada's shape
        const prBaseFeatures =
          geoJson?.features?.filter((f: any) => {
            if (f.properties?.level !== 'PR') return false;
            const uid = String(f.properties?.uid || '');
            if (selectedProvince !== 'ALL') return uid === selectedProvince;
            return !['60', '61', '62'].includes(uid);
          }) || [];

        for (const pf of prBaseFeatures) {
          const rings = extractRings(pf.geometry);
          ctx.fillStyle = '#DCE5EE';
          ctx.strokeStyle = '#94A3B8';
          ctx.lineWidth = 1.1;
          for (const ring of rings) {
            ctx.beginPath();
            ring.forEach(([lon, lat], i) => {
              const [px, py] = project(lon, lat);
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }

        for (const f of featuresToDraw) {
          const dguid = f.properties?.dguid;
          const it = itemByDguid.get(dguid);
          const rings = extractRings(f.geometry);
          if (rings.length === 0) continue;

          ctx.fillStyle = it?.color || '#CBD5E1';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = selectedProvince === 'ALL' ? 0.85 : 1.4;

          for (const ring of rings) {
            ctx.beginPath();
            ring.forEach(([lon, lat], i) => {
              const [px, py] = project(lon, lat);
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }

        // Draw crisp Canadian Provincial Borders on top
        if (selectedLevel !== 'Provinces & Territories') {
          for (const pf of prBaseFeatures) {
            const rings = extractRings(pf.geometry);
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1.3;
            for (const ring of rings) {
              ctx.beginPath();
              ring.forEach(([lon, lat], i) => {
                const [px, py] = project(lon, lat);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
              });
              ctx.closePath();
              ctx.stroke();
            }
          }
        }

        if (labelTopN > 0) {
          const topSlice = leaderboardRows.slice(0, labelTopN);
          ctx.font = 'bold 12.5px Inter, Segoe UI, Arial, sans-serif';
          ctx.textAlign = 'center';
          for (let i = 0; i < topSlice.length; i++) {
            const r = topSlice[i];
            if (!r.geo.lon || !r.geo.lat) continue;
            if (
              r.geo.lon < minLon ||
              r.geo.lon > maxLon ||
              r.geo.lat < minLat ||
              r.geo.lat > maxLat
            ) {
              continue;
            }
            const [cx, cy] = project(r.geo.lon, r.geo.lat);
            const valLabel = isShadedByPct && r.obs.pctOfBase !== null
              ? `${r.obs.pctOfBase.toFixed(1)}%`
              : formatMetricValue(r.obs.val2021, activeCharMeta.unit, true);
            const tag = `#${i + 1} ${r.geo.cleanName} (${valLabel})`;
            const tw = ctx.measureText(tag).width + 12;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
            ctx.beginPath();
            ctx.roundRect(cx - tw / 2, cy - 11, tw, 22, 5);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(tag, cx, cy + 4);
          }
          ctx.textAlign = 'left';
        }

        ctx.restore();
      };

      const isAllOntarioCounties =
        selectedProvince === '35' &&
        (selectedLevel === 'Counties / Census Divisions (CD)' ||
          selectedLevel === 'Census Agricultural Regions (CAR)') &&
        selectedCarId === 'ALL' &&
        matchingFeatures.length > 8;

      if (matchingFeatures.length > 0) {
        if (isAllOntarioCounties) {
          drawGeoJsonView(
            matchingFeatures,
            { x: mapBox.x, y: mapBox.y, w: mapBox.w, h: mapBox.h - 72 },
            { minLon: -83.6, maxLon: -74.2, minLat: 41.9, maxLat: 46.7 },
            10
          );

          const insetRect = { x: mapBox.x + 18, y: mapBox.y + 18, w: 355, h: 250 };
          ctx.fillStyle = '#DCE7F0';
          ctx.strokeStyle = '#0F3D6E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(insetRect.x, insetRect.y, insetRect.w, insetRect.h, 8);
          ctx.fill();
          ctx.stroke();

          drawGeoJsonView(
            matchingFeatures,
            { x: insetRect.x, y: insetRect.y + 24, w: insetRect.w, h: insetRect.h - 24 },
            { minLon: -95.2, maxLon: -79.0, minLat: 46.0, maxLat: 56.9 },
            0
          );

          ctx.fillStyle = '#0F3D6E';
          ctx.font = 'bold 12px Inter, Segoe UI, Arial, sans-serif';
          ctx.fillText('NORTHERN ONTARIO DISTRICTS INSET', insetRect.x + 12, insetRect.y + 18);
        } else if (selectedProvince === 'ALL') {
          drawGeoJsonView(
            matchingFeatures,
            { x: mapBox.x, y: mapBox.y, w: mapBox.w, h: mapBox.h - 72 },
            { minLon: -131.5, maxLon: -52.5, minLat: 41.8, maxLat: 60.2 },
            10
          );
        } else {
          drawGeoJsonView(
            matchingFeatures,
            { x: mapBox.x, y: mapBox.y, w: mapBox.w, h: mapBox.h - 72 },
            undefined,
            10
          );
        }
      } else {
        const pts = mapItems.filter((it) => it.geo.lat && it.geo.lon);
        if (pts.length > 0) {
          let minLon = Infinity,
            maxLon = -Infinity,
            minLat = Infinity,
            maxLat = -Infinity;
          for (const p of pts) {
            minLon = Math.min(minLon, p.geo.lon!);
            maxLon = Math.max(maxLon, p.geo.lon!);
            minLat = Math.min(minLat, p.geo.lat!);
            maxLat = Math.max(maxLat, p.geo.lat!);
          }
          const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
          const cosLat = Math.max(0.35, Math.cos(midLatRad));
          const pad = 45;
          const availW = mapBox.w - pad * 2;
          const availH = mapBox.h - 72 - pad * 2;
          const lonSpan = Math.max(0.08, (maxLon - minLon) * cosLat);
          const latSpan = Math.max(0.08, maxLat - minLat);
          const scale = Math.min(availW / lonSpan, availH / latSpan);
          const offsetX = mapBox.x + pad + (availW - lonSpan * scale) / 2;
          const offsetY = mapBox.y + pad + (availH - latSpan * scale) / 2;

          for (const it of pts) {
            const cx = offsetX + (it.geo.lon! - minLon) * cosLat * scale;
            const cy = offsetY + (maxLat - it.geo.lat!) * scale;
            ctx.beginPath();
            ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
            ctx.fillStyle = it.color;
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }

      // Bottom Quintile Legend Bar inside Map Card
      const legY = mapBox.y + mapBox.h - 62;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(mapBox.x + 2, legY, mapBox.w - 4, 60);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mapBox.x, legY);
      ctx.lineTo(mapBox.x + mapBox.w, legY);
      ctx.stroke();

      ctx.fillStyle = '#0F3D6E';
      ctx.font = 'bold 13.5px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText('MAP SCALE (LOW → HIGH):', mapBox.x + 18, legY + 35);

      const palette = MTM_PALETTES[paletteMode];
      const [, b1, b2, b3, b4, b5] = quintileBreaks;
      const fmtBreak = (v: number) =>
        isShadedByPct
          ? `${v.toFixed(1)}%`
          : formatMetricValue(v, activeCharMeta.unit, true);
      const rangeLabels = [
        `Lowest (≤ ${fmtBreak(b1)})`,
        `Low–Mid (≤ ${fmtBreak(b2)})`,
        `Middle (≤ ${fmtBreak(b3)})`,
        `High–Mid (≤ ${fmtBreak(b4)})`,
        `Highest (up to ${fmtBreak(b5)})`
      ];

      let lx = mapBox.x + 195;
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = palette[i];
        ctx.beginPath();
        ctx.roundRect(lx, legY + 19, 20, 20, 4);
        ctx.fill();

        ctx.fillStyle = '#334155';
        ctx.font = '600 12px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(rangeLabels[i], lx + 25, legY + 34);
        lx += 176;
      }

      // Right-Side Top 16 Ranked Leaderboard Card (with Inline Visual Bars)
      const rankBox = { x: 1140, y: 150, w: 628, h: 895 };
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(rankBox.x, rankBox.y, rankBox.w, rankBox.h, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0F3D6E';
      ctx.font = '800 17px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `LEADERBOARD: TOP ${Math.min(16, leaderboardRows.length)} OF ${leaderboardRows.length} GEOGRAPHIES`,
        rankBox.x + 20,
        rankBox.y + 34
      );

      // Table Column Headers
      const thY = rankBox.y + 52;
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(rankBox.x + 2, thY, rankBox.w - 4, 34);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 12px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText('RANK', rankBox.x + 16, thY + 22);
      ctx.fillText('GEOGRAPHY', rankBox.x + 68, thY + 22);
      ctx.textAlign = 'right';
      ctx.fillText(
        `2021 ${getUnitColumnHeader(activeCharMeta.unit).toUpperCase()}`.slice(0, 14),
        rankBox.x + 395,
        thY + 22
      );
      ctx.fillText('% BASE', rankBox.x + 478, thY + 22);
      ctx.fillText('16–21 Δ', rankBox.x + 542, thY + 22);
      ctx.fillText(
        resolvedRefColMeta.headerLabel.toUpperCase().slice(0, 12),
        rankBox.x + 616,
        thY + 22
      );
      ctx.textAlign = 'left';

      const maxRows = Math.min(16, leaderboardRows.length);
      let ry = thY + 36;
      const rowH = 49;

      for (let i = 0; i < maxRows; i++) {
        const r = leaderboardRows[i];
        const val = r.obs.val2021 || 0;
        const mVal = isShadedByPct && r.obs.pctOfBase !== null ? r.obs.pctOfBase : val;
        const swatch = getQuintileColor(mVal, quintileBreaks, paletteMode);
        const barW = Math.min(95, Math.max(4, (val / maxVal) * 95));
        const delta = formatDelta(r.obs.pctChange, activeCharMeta.unit);

        if (i % 2 === 1) {
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(rankBox.x + 2, ry, rankBox.w - 4, rowH);
        }

        // Rank #
        ctx.fillStyle = '#64748B';
        ctx.font = 'bold 12.5px Consolas, monospace';
        ctx.fillText(`#${i + 1}`, rankBox.x + 16, ry + 28);

        // Quintile Swatch
        ctx.fillStyle = swatch;
        ctx.beginPath();
        ctx.roundRect(rankBox.x + 50, ry + 15, 11, 17, 3);
        ctx.fill();

        // Geography Name & Province/OFA Subtitle
        ctx.fillStyle = '#0F3D6E';
        ctx.font = 'bold 13.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(r.geo.cleanName.slice(0, 24), rankBox.x + 68, ry + 21);

        ctx.fillStyle = '#64748B';
        ctx.font = '500 10.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(
          (r.geo.ofaFederation || r.geo.provinceName || '').slice(0, 34),
          rankBox.x + 68,
          ry + 38
        );

        // 2021 Value + Inline proportional bar
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 13.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(
          formatMetricValue(r.obs.val2021, activeCharMeta.unit, true),
          rankBox.x + 395,
          ry + 22
        );

        // Mini bar track under value
        ctx.fillStyle = '#E2E8F0';
        ctx.fillRect(rankBox.x + 300, ry + 29, 95, 6);
        ctx.fillStyle = '#0F3D6E';
        ctx.fillRect(rankBox.x + 395 - barW, ry + 29, barW, 6);

        // % of Base
        ctx.fillStyle = '#328475';
        ctx.font = 'bold 13px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(
          r.obs.pctOfBase !== null ? `${r.obs.pctOfBase.toFixed(1)}%` : '—',
          rankBox.x + 478,
          ry + 28
        );

        // 2016-2021 Delta
        ctx.fillStyle =
          r.obs.pctChange === null
            ? '#94A3B8'
            : delta.isPositive
            ? '#0F9D58'
            : '#D97706';
        ctx.font = 'bold 12.5px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(delta.text, rankBox.x + 542, ry + 28);

        // Customizable Reference Column Value
        ctx.fillStyle = '#475569';
        ctx.font = '600 12px Inter, Segoe UI, Arial, sans-serif';
        ctx.fillText(
          formatMetricValue(r.refVal, resolvedRefColMeta.unit, true),
          rankBox.x + 616,
          ry + 28
        );
        ctx.textAlign = 'left';

        ry += rowH;
      }

      // Bottom Footer Citation
      ctx.fillStyle = '#475569';
      ctx.font = '600 13px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(
        `Source: Statistics Canada — 2021 & 2016 Census of Agriculture (${activeCharMeta.statcanTable}) & 2021 Digital Boundary Files. Generated via AgCensus IQ (OFA Edition).`,
        36,
        1088
      );

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `OFA_Ranker_HeatMap_${activeCharMeta.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsExportingMap(false);
    }
  };

  // 3. Print / Save as PDF Full Leaderboard Report
  const handlePrintRankerPdf = () => {
    if (leaderboardRows.length === 0) return;
    const w = window.open('', '_blank', 'width=1150,height=880');
    if (!w) {
      window.print();
      return;
    }

    const rowsHtml = leaderboardRows
      .map((r, idx) => {
        const val = r.obs.val2021 || 0;
        const barW = Math.min(100, Math.max(2, (val / maxVal) * 100));
        const pctBarW =
          r.obs.pctOfBase !== null
            ? Math.min(100, Math.max(2, (r.obs.pctOfBase / maxPctBar) * 100))
            : 0;
        const delta = formatDelta(r.obs.pctChange, activeCharMeta.unit);
        const deltaColor =
          r.obs.pctChange === null
            ? '#64748B'
            : delta.isPositive
            ? '#0F9D58'
            : '#B45309';

        return `
          <tr>
            <td style="padding:6px 8px;border:1px solid #CBD5E1;font-family:Consolas,monospace;color:#475569;font-weight:700;">#${idx + 1}</td>
            <td style="padding:6px 8px;border:1px solid #CBD5E1;font-weight:700;color:#0F3D6E;">
              ${r.geo.cleanName}
              <span style="display:block;font-size:9.5px;font-weight:500;color:#475569;">${
                r.geo.ofaFederation || r.geo.provinceName || ''
              }</span>
            </td>
            <td style="padding:6px 10px;border:1px solid #CBD5E1;text-align:right;">
              <div style="font-weight:800;color:#0F172A;font-size:11.5px;">${formatMetricValue(
                r.obs.val2021,
                activeCharMeta.unit,
                false
              )}</div>
              <div style="width:100%;height:5px;background:#E2E8F0;border-radius:2px;margin-top:3px;overflow:hidden;">
                <div style="width:${barW}%;height:100%;background:#0F3D6E;"></div>
              </div>
            </td>
            ${
              hasPctShare
                ? `<td style="padding:6px 10px;border:1px solid #CBD5E1;text-align:right;">
                    <div style="font-weight:700;color:#1D6C5E;font-size:11px;">${
                      r.obs.pctOfBase !== null ? `${r.obs.pctOfBase.toFixed(1)}%` : '—'
                    }</div>
                    <div style="width:100%;height:5px;background:#E2E8F0;border-radius:2px;margin-top:3px;overflow:hidden;">
                      <div style="width:${pctBarW}%;height:100%;background:#328475;"></div>
                    </div>
                  </td>`
                : ''
            }
            <td style="padding:6px 8px;border:1px solid #CBD5E1;text-align:right;color:#475569;">
              ${formatMetricValue(r.obs.val2016, activeCharMeta.unit, false)}
            </td>
            <td style="padding:6px 8px;border:1px solid #CBD5E1;text-align:right;font-weight:700;color:${deltaColor};">
              ${delta.text}
            </td>
            <td style="padding:6px 8px;border:1px solid #CBD5E1;text-align:right;font-weight:600;color:#334155;">
              ${formatMetricValue(r.refVal, resolvedRefColMeta.unit, false)}
            </td>
          </tr>
        `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>OFA Ranker Report — ${activeCharMeta.shortName}</title>
          <style>
            @page { size: portrait; margin: 10mm; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0F172A;
              margin: 0;
              padding: 16px;
              background: #FFFFFF;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            thead { display: table-header-group; }
            tr, td, th { page-break-inside: avoid !important; break-inside: avoid !important; }
            @media print {
              .no-print-bar { display: none !important; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="no-print-bar" style="background:#0F3D6E;color:#FFFFFF;padding:10px 16px;border-radius:6px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
            <div>
              <strong>OFA Printable Ranker Leaderboard Ready</strong> — Select <em>"Save as PDF"</em> or your printer in the print dialog.
            </div>
            <button onclick="window.print()" style="background:#328475;color:#FFFFFF;border:none;padding:8px 16px;border-radius:4px;font-weight:700;cursor:pointer;">
              🖨️ Print / Save as PDF Now
            </button>
          </div>

          <div style="border-bottom:3px solid #0F3D6E;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end;">
            <div>
              <div style="font-size:10px;font-weight:800;color:#328475;letter-spacing:0.06em;text-transform:uppercase;">
                ONTARIO FEDERATION OF AGRICULTURE (OFA) • AGCENSUS IQ REGIONAL LEADERBOARD REPORT
              </div>
              <h1 style="margin:3px 0 4px 0;font-size:18px;font-weight:900;color:#0F3D6E;">
                RANKER: ${activeCharMeta.name}
              </h1>
              <div style="font-size:10.5px;color:#475569;">
                <strong>Scope:</strong> ${scopeTitleLabel} (${leaderboardRows.length} Geographies) • <strong>Denominator Base:</strong> ${activeCharMeta.baseDescription}
              </div>
            </div>
            <div style="text-align:right;font-size:9.5px;color:#64748B;">
              <div><strong>Source:</strong> Statistics Canada Census of Agriculture (2021 & 2016)</div>
              <div>Official Table ${activeCharMeta.statcanTable}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr style="background:#0F3D6E;color:#FFFFFF;">
                <th style="padding:7px 8px;text-align:left;width:48px;border:1px solid #1E3A8A;">Rank</th>
                <th style="padding:7px 8px;text-align:left;border:1px solid #1E3A8A;">Geography</th>
                <th style="padding:7px 10px;text-align:right;width:150px;border:1px solid #1E3A8A;">2021 ${getUnitColumnHeader(
                  activeCharMeta.unit
                )}</th>
                ${
                  hasPctShare
                    ? `<th style="padding:7px 10px;text-align:right;width:110px;border:1px solid #1E3A8A;">% of Base</th>`
                    : ''
                }
                <th style="padding:7px 8px;text-align:right;width:110px;border:1px solid #1E3A8A;">2016 Value</th>
                <th style="padding:7px 8px;text-align:right;width:90px;border:1px solid #1E3A8A;">16–21 Δ</th>
                <th style="padding:7px 8px;text-align:right;width:110px;border:1px solid #1E3A8A;">${
                  resolvedRefColMeta.headerLabel
                }</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <script>
            setTimeout(() => { window.print(); }, 350);
          </script>
        </body>
      </html>
    `;

    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2 rounded-md border border-slate-200/90 shadow-xs">
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-[#0F3D6E] uppercase">
            RANKER: {activeCharMeta.shortName}
          </h1>
          <p className="text-[11px] text-slate-500">
            Regional Leaderboard with Inline Data Bars, Range Filters & Color-Scaled Map •{' '}
            <span className="font-semibold text-[#0F3D6E]">{activeCharMeta.statcanTable}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownloadRankerMapPng}
            disabled={isExportingMap || leaderboardRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded bg-[#328475] hover:bg-[#276B5E] disabled:opacity-50 px-2.5 py-1.5 text-xs font-bold text-white shadow-2xs transition cursor-pointer"
            title="Download high-resolution Heat Map & Top 16 Leaderboard PNG for emails, reports, or social media"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>{isExportingMap ? 'Rendering...' : 'Download Map & Graph (PNG)'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrintRankerPdf}
            disabled={leaderboardRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded bg-[#0F3D6E] hover:bg-[#164677] disabled:opacity-50 px-2.5 py-1.5 text-xs font-bold text-white shadow-2xs transition cursor-pointer"
            title="Print or Save full Leaderboard with inline bars as a PDF report"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save PDF</span>
          </button>

          <button
            type="button"
            onClick={exportRankerCsv}
            disabled={leaderboardRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0F3D6E] hover:bg-slate-50 transition cursor-pointer"
            title="Download complete Leaderboard data as an Excel-ready CSV spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#328475]" />
            <span>Download Data (Excel CSV)</span>
          </button>
        </div>
      </div>

      {/* Main 3-Column Grid matching MTM Ranker */}
      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        {/* LEFT COLUMN (3 cols): Geographies + Variable + Ranker Filters */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2 overflow-y-auto pr-0.5">
          <MultiGeographyScopeSlicer
            title="Geographies"
            geographies={dataset.geographies}
            selectedLevel={selectedLevel}
            onChangeLevel={setSelectedLevel}
            selectedProvince={selectedProvince}
            onChangeProvince={setSelectedProvince}
            selectedParentCarId={selectedCarId}
            onChangeParentCarId={setSelectedCarId}
            onOpenGeoLocator={onOpenGeoLocator}
            matchingCount={leaderboardRows.length}
          />

          {/* Variable Slicer with Unit / Measure Type Filter & Smart Topic Switcher */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                Variable & Unit Measure
              </h3>
              <span className="rounded bg-[#0F3D6E]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#0F3D6E]">
                {getUnitColumnHeader(activeCharMeta.unit)}
              </span>
            </div>

            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
              Filter by Unit / Measure Type
            </label>
            <div className="grid grid-cols-3 gap-1 rounded bg-slate-100 p-1 text-[10.5px] font-bold mb-2.5">
              {[
                { id: 'all' as const, label: 'All (170+)' },
                { id: 'acres' as const, label: 'Acres' },
                { id: 'head' as const, label: 'Head / Herd' },
                { id: 'dollars' as const, label: 'Dollars ($)' },
                { id: 'farms' as const, label: 'Farms' },
                { id: 'agg' as const, label: 'Totals / Avgs' }
              ].map((uf) => (
                <button
                  key={uf.id}
                  type="button"
                  onClick={() => setUnitFilter(uf.id)}
                  className={`py-1 px-1 rounded cursor-pointer transition truncate ${
                    unitFilter === uf.id
                      ? 'bg-[#0F3D6E] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {uf.label}
                </button>
              ))}
            </div>

            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
              Variable Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="mb-2 w-full rounded border border-slate-300 bg-[#F8FAFC] px-2 py-1.5 text-xs font-semibold text-[#0F3D6E]"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
              Specific Metric to Rank
            </label>
            <select
              value={selectedCharId}
              onChange={(e) => setSelectedCharId(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800"
            >
              {availableChars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.shortName}
                </option>
              ))}
            </select>

            {/* Smart Contextual Measure Switcher for the Active Commodity / Topic */}
            {relatedMeasureOptions.length > 1 && (
              <div className="mt-2.5 pt-2 border-t border-slate-100">
                <label className="block text-[10px] font-bold uppercase text-[#328475] mb-1">
                  Switch Measure for This Topic (Acres / Head / Farms)
                </label>
                <div className="flex flex-wrap gap-1">
                  {relatedMeasureOptions.map((opt) => {
                    const isCurrent = opt.id === activeCharMeta.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => selectCharacteristicDirectly(opt.id)}
                        className={`px-2 py-0.5 rounded text-[10.5px] font-bold border cursor-pointer transition ${
                          isCurrent
                            ? 'bg-[#328475] text-white border-[#328475]'
                            : 'bg-[#F8FAFC] text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {opt.badge}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Ranker Filters Card matching MTM Ranker bottom-left */}
          <div className="rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                  Ranker Filters
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setMinFarms(0);
                    setMaxFarms(250000);
                    setMinPct(0);
                    setMaxPct(100);
                  }}
                  title="Reset Ranker Filters"
                  className="text-slate-400 hover:text-[#0F3D6E] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Total Census Farms (Min / Max)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="number"
                      value={minFarms}
                      onChange={(e) => setMinFarms(Number(e.target.value) || 0)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      placeholder="Min farms"
                    />
                    <input
                      type="number"
                      value={maxFarms}
                      onChange={(e) => setMaxFarms(Number(e.target.value) || 250000)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      placeholder="Max farms"
                    />
                  </div>
                </div>

                {hasPctShare && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1">
                      <span>Percentage Share Filter (%)</span>
                      <span className="text-[#0F3D6E]">
                        {minPct}% – {maxPct}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={minPct}
                        onChange={(e) => setMinPct(Number(e.target.value) || 0)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={maxPct}
                        onChange={(e) => setMaxPct(Number(e.target.value) || 100)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
              Showing <span className="font-bold text-[#0F3D6E]">{leaderboardRows.length}</span> of{' '}
              {scopedGeos.length} geographies matching criteria.
            </div>
          </div>
        </div>

        {/* CENTER COLUMN (5 cols): Leaderboard Table with Inline Data Bars */}
        <div className="col-span-12 lg:col-span-5 rounded-md bg-white p-3.5 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F3D6E]">
                {activeCharMeta.shortName}
              </h3>
              <p className="text-[10px] text-slate-400">
                Click column headers to sort • Click &apos;Map&apos; to zoom
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Customizable Extra Reference Column Selector */}
              <div className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase text-slate-500">Extra Col:</span>
                <select
                  value={refColMode}
                  onChange={(e) => setRefColMode(e.target.value as RefColMode)}
                  className="bg-transparent text-[11px] font-bold text-[#0F3D6E] focus:outline-none cursor-pointer"
                  title="Choose what data is displayed in the reference column alongside the primary ranked value"
                >
                  {REF_COL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {hasPctShare && (
                <button
                  type="button"
                  onClick={() => setShowBaseTooltip((p) => !p)}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  <span>Base</span>
                  <HelpCircle className="w-3 h-3 text-[#4E79A7]" />
                </button>
              )}

              <button
                type="button"
                onClick={handlePrintRankerPdf}
                disabled={leaderboardRows.length === 0}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-[#0F3D6E] cursor-pointer"
                title="Print or Save Leaderboard as PDF"
              >
                <Printer className="w-3 h-3 text-[#328475]" />
                <span>PDF</span>
              </button>

              <button
                type="button"
                onClick={exportRankerCsv}
                disabled={leaderboardRows.length === 0}
                className="inline-flex items-center gap-1 rounded bg-[#0F3D6E] hover:bg-[#164677] px-2 py-0.5 text-[11px] font-bold text-white cursor-pointer"
                title="Download Leaderboard as Excel CSV"
              >
                <Download className="w-3 h-3 text-emerald-300" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {showBaseTooltip && (
            <div className="mb-2 rounded bg-[#071D49] p-2 text-xs text-white flex items-center justify-between">
              <span>Denominator Base: {activeCharMeta.baseDescription}</span>
              <button onClick={() => setShowBaseTooltip(false)}>✕</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto border border-slate-200 rounded">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 sticky top-0 text-[11px] text-slate-600 z-10">
                <tr>
                  <th className="py-2 px-2">Geography</th>
                  <th
                    onClick={() => setSortCol('val')}
                    className="py-2 px-2 text-right cursor-pointer hover:text-[#0F3D6E]"
                  >
                    {getUnitColumnHeader(activeCharMeta.unit)} {sortCol === 'val' && '▼'}
                  </th>
                  {hasPctShare && (
                    <th
                      onClick={() => setSortCol('pct')}
                      className="py-2 px-2 text-right cursor-pointer hover:text-[#0F3D6E]"
                    >
                      % {sortCol === 'pct' && '▼'}
                    </th>
                  )}
                  <th
                    onClick={() => setSortCol('delta')}
                    className="py-2 px-2 text-right cursor-pointer hover:text-[#0F3D6E]"
                  >
                    16–21 Δ {sortCol === 'delta' && '▼'}
                  </th>
                  <th
                    onClick={() => setSortCol('farms')}
                    className="py-2 px-2 text-right cursor-pointer hover:text-[#0F3D6E]"
                    title="Click to sort by this reference column (customize via 'Extra Col' dropdown above)"
                  >
                    {resolvedRefColMeta.headerLabel} {sortCol === 'farms' && '▼'}
                  </th>
                  <th className="py-2 px-1.5 text-center">Map</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaderboardRows.map((row, idx) => {
                  const val = row.obs.val2021 || 0;
                  const pct = row.obs.pctOfBase;
                  const barW = Math.min(100, Math.max(2, (val / maxVal) * 100));
                  const pctBarW =
                    pct !== null ? Math.min(100, Math.max(2, (pct / maxPctBar) * 100)) : 0;
                  const delta = formatDelta(row.obs.pctChange, activeCharMeta.unit);

                  return (
                    <tr
                      key={row.geo.id}
                      onClick={() => setFocusedGeoId(row.geo.id)}
                      onDoubleClick={() => onSelectGeoForSnapshot(row.geo)}
                      className={`cursor-pointer transition ${
                        row.geo.id === focusedGeoId ? 'bg-[#0F3D6E]/10' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-1.5 px-2 font-medium text-slate-800 max-w-[140px]">
                        <div className="truncate font-semibold text-[#0F3D6E]" title={row.geo.name}>
                          <span className="text-slate-400 font-mono mr-1">#{idx + 1}</span>
                          {row.geo.cleanName}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {row.geo.provinceName}
                        </div>
                      </td>

                      {/* Value cell with inline proportional data bar (matching MTM Ranker) */}
                      <td className="py-1.5 px-2 text-right align-middle">
                        <div className="font-bold text-slate-900">
                          {formatMetricValue(row.obs.val2021, activeCharMeta.unit, true)}
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-xs overflow-hidden mt-0.5">
                          <div
                            className="h-full bg-[#0F3D6E]"
                            style={{ width: `${barW}%` }}
                          />
                        </div>
                      </td>

                      {/* Percentage cell with inline proportional data bar */}
                      {hasPctShare && (
                        <td className="py-1.5 px-2 text-right align-middle">
                          <div className="font-bold text-[#0F3D6E]">
                            {pct !== null ? `${pct.toFixed(1)}%` : '—'}
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-xs overflow-hidden mt-0.5">
                            <div
                              className="h-full bg-[#328475]"
                              style={{ width: `${pctBarW}%` }}
                            />
                          </div>
                        </td>
                      )}

                      <td
                        className={`py-1.5 px-2 text-right font-semibold ${
                          row.obs.pctChange === null
                            ? 'text-slate-300'
                            : delta.isPositive
                            ? 'text-[#0F9D58]'
                            : 'text-amber-600'
                        }`}
                      >
                        {delta.text}
                      </td>

                      <td className="py-1.5 px-2 text-right font-medium text-slate-600">
                        {formatMetricValue(row.refVal, resolvedRefColMeta.unit, true)}
                      </td>

                      <td className="py-1.5 px-1.5 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocusedGeoId(row.geo.id);
                          }}
                          className="text-[11px] font-semibold text-[#0F3D6E] underline hover:text-[#328475] cursor-pointer"
                        >
                          Map
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN (4 cols): Synchronized Quintile Map */}
        <div className="col-span-12 lg:col-span-4 rounded-md bg-white p-3 shadow-xs border border-slate-200/90 flex flex-col min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
            {hasPctShare ? (
              <div className="flex items-center gap-1 rounded bg-slate-100 p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setMapColorMode('val')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    mapColorMode === 'val' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                  }`}
                >
                  {getUnitColumnHeader(activeCharMeta.unit)}
                </button>
                <button
                  type="button"
                  onClick={() => setMapColorMode('pct')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    mapColorMode === 'pct' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                  }`}
                >
                  Percentages
                </button>
              </div>
            ) : (
              <span className="text-xs font-bold uppercase text-[#0F3D6E]">
                Regional Map ({activeCharMeta.shortName})
              </span>
            )}

            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1 rounded bg-slate-100 p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setPaletteMode('standard')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    paletteMode === 'standard' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                  }`}
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => setPaletteMode('accessible')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    paletteMode === 'accessible' ? 'bg-[#0F3D6E] text-white' : 'text-slate-600'
                  }`}
                >
                  Accessible
                </button>
              </div>

              <button
                type="button"
                onClick={handleDownloadRankerMapPng}
                disabled={isExportingMap || leaderboardRows.length === 0}
                className="inline-flex items-center gap-1 rounded bg-[#328475] hover:bg-[#276B5E] disabled:opacity-50 px-2 py-1 text-[11px] font-bold text-white shadow-2xs transition cursor-pointer"
                title="Download Heat Map & Top 16 Leaderboard as high-res PNG"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>PNG</span>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <InteractiveAgMap
              items={mapItems}
              selectedGeoId={focusedGeoId}
              focusGeo={focusedGeo}
              onSelectGeo={(gid) => setFocusedGeoId(gid)}
              legendElement={
                <div className="flex flex-col w-full gap-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-700">
                    <span>Lowest: {formatScaleVal(quintileBreaks[0])}</span>
                    <span className="text-slate-500 font-semibold">
                      Middle: {formatScaleVal((quintileBreaks[2] + quintileBreaks[3]) / 2)}
                    </span>
                    <span>Highest: {formatScaleVal(quintileBreaks[5])}</span>
                  </div>
                  <div className="grid grid-cols-5 h-2.5 w-full rounded-xs overflow-hidden border border-slate-200/80">
                    {MTM_PALETTES[paletteMode].map((col, idx) => {
                      const tierNames = ['Lowest 20%', 'Low–Mid 20%', 'Middle 20%', 'High–Mid 20%', 'Highest 20%'];
                      const lo = formatScaleVal(quintileBreaks[idx]);
                      const hi = formatScaleVal(quintileBreaks[idx + 1]);
                      return (
                        <div
                          key={col}
                          style={{ backgroundColor: col }}
                          title={`${tierNames[idx]}: ${lo} to ${hi}`}
                        />
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-5 text-[9px] font-medium text-slate-500 text-center leading-none">
                    <span className="text-left">Lowest</span>
                    <span>Low–Mid</span>
                    <span>Middle</span>
                    <span>High–Mid</span>
                    <span className="text-right">Highest</span>
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};
